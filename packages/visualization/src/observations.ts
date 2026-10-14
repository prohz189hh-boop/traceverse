import type {
  Category,
  NormalizedSpan,
  ServiceEdge,
  ServiceGraph,
  ServiceNode,
} from '@traceverse/core';
import type { UniverseProps } from './types.js';

export const categoryColors: Record<Category, string> = {
  frontend: '#a58cff',
  service: '#58e6de',
  database: '#ffc078',
  external: '#7ba6ff',
};
export const statusColors = { healthy: '#58e6de', slow: '#ffc078', error: '#ff758c' };
export type VisualStatus = keyof typeof statusColors;
export const spanIdentity = (span: NormalizedSpan) => `${span.traceId}:${span.spanId}`;
export const spanEnd = (span: NormalizedSpan) => span.startTime + span.durationMs;

/** Latest observed span status describes an observation, never a service uptime guarantee. */
export function visualStatus(span: NormalizedSpan | undefined, threshold: number): VisualStatus {
  return span?.status === 'error'
    ? 'error'
    : span && span.durationMs > threshold
      ? 'slow'
      : 'healthy';
}
export interface ObservationIndex {
  byNode: Map<string, NormalizedSpan[]>;
  byEdge: Map<string, NormalizedSpan[]>;
  latestNode: Map<string, NormalizedSpan>;
  latestEdge: Map<string, NormalizedSpan>;
}
/** One index per span batch replaces a full-history filter for every edge. */
export function buildObservationIndex(input: readonly NormalizedSpan[]): ObservationIndex {
  const spans = [...new Map(input.map((span) => [spanIdentity(span), span])).values()];
  const byId = new Map(spans.map((span) => [spanIdentity(span), span]));
  const children = new Set(
    spans.filter((span) => span.parentSpanId).map((span) => `${span.traceId}:${span.parentSpanId}`),
  );
  const services = new Set(spans.map((span) => span.serviceName));
  const result: ObservationIndex = {
    byNode: new Map(),
    byEdge: new Map(),
    latestNode: new Map(),
    latestEdge: new Map(),
  };
  const add = (
    map: Map<string, NormalizedSpan[]>,
    latest: Map<string, NormalizedSpan>,
    id: string,
    span: NormalizedSpan,
  ) => {
    const values = map.get(id);
    if (values) values.push(span);
    else map.set(id, [span]);
    const previous = latest.get(id);
    if (!previous || spanEnd(span) >= spanEnd(previous)) latest.set(id, span);
  };
  const edge = (source: string, target: string, span: NormalizedSpan) => {
    if (source !== target)
      add(result.byEdge, result.latestEdge, JSON.stringify([source, target]), span);
  };
  for (const span of spans) {
    add(result.byNode, result.latestNode, span.serviceName, span);
    const parent = span.parentSpanId ? byId.get(`${span.traceId}:${span.parentSpanId}`) : undefined;
    if (parent) edge(parent.serviceName, span.serviceName, span);
    const system = span.attributes['db.system.name'] ?? span.attributes['db.system'];
    let dependency: string | undefined;
    if (typeof system === 'string' && system) {
      dependency = `database:${system}:${String(span.attributes['db.namespace'] ?? span.attributes['db.name'] ?? system)}`;
    } else if (span.kind === 3 && !children.has(spanIdentity(span))) {
      const peer =
        span.attributes['peer.service'] ??
        span.attributes['server.address'] ??
        span.attributes['net.peer.name'];
      if (typeof peer === 'string' && peer && !services.has(peer)) dependency = `external:${peer}`;
    }
    if (dependency) {
      add(result.byNode, result.latestNode, dependency, span);
      edge(span.serviceName, dependency, span);
    }
  }
  return result;
}
/** Match inferred dependencies to their exact semantic-convention identity. */
export function observedSpansForNode(
  spans: readonly NormalizedSpan[],
  node: ServiceNode,
): NormalizedSpan[] {
  return buildObservationIndex(spans).byNode.get(node.id) ?? [];
}
export function edgeRelevant(
  edge: ServiceEdge,
  props: Pick<UniverseProps, 'selected' | 'direction'>,
): boolean {
  return (
    !props.selected ||
    (props.direction !== 'incoming' && edge.source === props.selected) ||
    (props.direction !== 'outgoing' && edge.target === props.selected)
  );
}
export function stableHash(id: string): number {
  let value = 2166136261;
  for (let i = 0; i < id.length; i++) value = Math.imul(value ^ id.charCodeAt(i), 16777619);
  value = Math.imul(value ^ (value >>> 16), 2246822507);
  value = Math.imul(value ^ (value >>> 13), 3266489909);
  return (value ^ (value >>> 16)) >>> 0;
}
export interface ParticleObservation {
  edgeId: string;
  span: NormalizedSpan;
  offset: number;
}
export function particleObservations(
  graph: ServiceGraph,
  index: ObservationIndex,
  props: Pick<UniverseProps, 'quality' | 'particleDensity' | 'selected' | 'direction' | 'replay'>,
  now = Date.now(),
): ParticleObservation[] {
  if (props.particleDensity <= 0) return [];
  const limit = props.quality === 'low' ? 32 : props.quality === 'high' ? 160 : 96;
  const perEdge = Math.min(
    8,
    Math.max(1, Math.round(props.particleDensity * (props.quality === 'low' ? 1 : 3))),
  );
  const result: ParticleObservation[] = [];
  // Round-robin allocation prevents a busy edge consuming the entire particle budget.
  const candidates = graph.edges
    .filter((edge) => edgeRelevant(edge, props))
    .map((edge) => ({
      edgeId: edge.id,
      spans: (index.byEdge.get(edge.id) ?? [])
        .filter((span) => props.replay || spanEnd(span) > now - 10000)
        .sort((a, b) => spanEnd(b) - spanEnd(a))
        .slice(0, perEdge),
    }));
  for (let round = 0; round < perEdge && result.length < limit; round++)
    for (const item of candidates) {
      const span = item.spans[round];
      if (span && result.length < limit)
        result.push({
          edgeId: item.edgeId,
          span,
          offset: stableHash(spanIdentity(span)) / 4294967296,
        });
    }
  return result;
}
