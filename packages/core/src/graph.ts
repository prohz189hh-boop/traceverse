import type { Category, NormalizedSpan, ServiceEdge, ServiceGraph, ServiceNode } from './types.js';

export function percentile(values: readonly number[], quantile: number): number {
  if (!values.length) return 0;
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const index = Math.max(
    0,
    Math.min(sorted.length - 1, Math.ceil(Math.max(0, Math.min(1, quantile)) * sorted.length) - 1),
  );
  return sorted[index] ?? 0;
}
function position(id: string, category: Category): [number, number, number] {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
  const angle = (((hash >>> 0) % 3600) * Math.PI) / 1800;
  const radius =
    category === 'database'
      ? 7.5
      : category === 'external'
        ? 9
        : category === 'frontend'
          ? 3.5
          : 5.5;
  return [Math.cos(angle) * radius, (((hash >>> 12) % 9) - 4) * 0.5, Math.sin(angle) * radius];
}
export function buildGraph(input: readonly NormalizedSpan[]): ServiceGraph {
  const spans = [
    ...new Map(input.map((span) => [`${span.traceId}:${span.spanId}`, span])).values(),
  ];
  const byId = new Map(spans.map((span) => [`${span.traceId}:${span.spanId}`, span]));
  const serviceNames = new Set(spans.map((span) => span.serviceName));
  const children = new Set(
    spans.filter((span) => span.parentSpanId).map((span) => `${span.traceId}:${span.parentSpanId}`),
  );
  const nodes = new Map<string, { node: ServiceNode; durations: number[] }>();
  const edges = new Map<string, { edge: ServiceEdge; durations: number[] }>();
  const touchNode = (id: string, name: string, category: Category, span: NormalizedSpan) => {
    let entry = nodes.get(id);
    if (!entry) {
      entry = {
        node: {
          id,
          name,
          category,
          spanCount: 0,
          errorCount: 0,
          p50: 0,
          p95: 0,
          lastSeen: 0,
          position: position(id, category),
        },
        durations: [],
      };
      nodes.set(id, entry);
    }
    entry.node.spanCount++;
    entry.node.errorCount += Number(span.status === 'error');
    entry.node.lastSeen = Math.max(entry.node.lastSeen, span.startTime + span.durationMs);
    entry.durations.push(span.durationMs);
  };
  const touchEdge = (source: string, target: string, span: NormalizedSpan) => {
    if (source === target) return;
    const id = JSON.stringify([source, target]);
    let entry = edges.get(id);
    if (!entry) {
      entry = {
        edge: { id, source, target, spanCount: 0, errorCount: 0, p95: 0, lastSeen: 0 },
        durations: [],
      };
      edges.set(id, entry);
    }
    entry.edge.spanCount++;
    entry.edge.errorCount += Number(span.status === 'error');
    entry.edge.lastSeen = Math.max(entry.edge.lastSeen, span.startTime + span.durationMs);
    entry.durations.push(span.durationMs);
  };
  for (const span of spans) {
    const category: Category =
      span.attributes['service.role'] === 'frontend' ||
      span.attributes['traceverse.category'] === 'frontend'
        ? 'frontend'
        : span.attributes['traceverse.category'] === 'external'
          ? 'external'
          : 'service';
    touchNode(span.serviceName, span.serviceName, category, span);
    if (span.parentSpanId) {
      const parent = byId.get(`${span.traceId}:${span.parentSpanId}`);
      if (parent && parent.serviceName !== span.serviceName)
        touchEdge(parent.serviceName, span.serviceName, span);
    }
    const system = span.attributes['db.system.name'] ?? span.attributes['db.system'];
    if (typeof system === 'string' && system) {
      const name = String(span.attributes['db.namespace'] ?? span.attributes['db.name'] ?? system);
      const databaseId = `database:${system}:${name}`;
      touchNode(databaseId, name, 'database', span);
      touchEdge(span.serviceName, databaseId, span);
    } else if (span.kind === 3 && !children.has(`${span.traceId}:${span.spanId}`)) {
      const peer =
        span.attributes['peer.service'] ??
        span.attributes['server.address'] ??
        span.attributes['net.peer.name'];
      if (typeof peer === 'string' && peer && !serviceNames.has(peer)) {
        const dependencyId = `external:${peer}`;
        touchNode(dependencyId, peer, 'external', span);
        touchEdge(span.serviceName, dependencyId, span);
      }
    }
  }
  for (const entry of nodes.values()) {
    entry.node.p50 = percentile(entry.durations, 0.5);
    entry.node.p95 = percentile(entry.durations, 0.95);
  }
  for (const entry of edges.values()) entry.edge.p95 = percentile(entry.durations, 0.95);
  return {
    nodes: [...nodes.values()].map((entry) => entry.node).sort((a, b) => a.id.localeCompare(b.id)),
    edges: [...edges.values()].map((entry) => entry.edge).sort((a, b) => a.id.localeCompare(b.id)),
  };
}
