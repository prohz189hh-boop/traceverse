import { describe, expect, it } from 'vitest';
import {
  buildGraph,
  type NormalizedSpan,
  type ServiceGraph,
  type ServiceNode,
} from '@traceverse/core';
import {
  boundedGraph,
  buildObservationIndex,
  createLayoutRegistry,
  observedSpansForNode,
  particleObservations,
  visualStatus,
} from '@traceverse/visualization';

function span(id: number, overrides: Partial<NormalizedSpan> = {}): NormalizedSpan {
  return {
    traceId: 'a'.repeat(32),
    spanId: id.toString(16).padStart(16, '0'),
    serviceName: 'api',
    operation: 'request',
    startTime: 1000 + id,
    durationMs: 25,
    status: 'ok',
    kind: 2,
    attributes: {},
    events: [],
    source: 'synthetic',
    ...overrides,
  };
}
function node(id: string): ServiceNode {
  return {
    id,
    name: id,
    category: 'service',
    spanCount: 1,
    errorCount: 0,
    p50: 20,
    p95: 20,
    lastSeen: 1000,
    position: [0, 0, 0],
  };
}

describe('visual observations', () => {
  it('renders recovery from the latest observation while retaining historical error evidence', () => {
    const failed = span(1, { status: 'error' }),
      recovered = span(2, { startTime: 2000 });
    const spans = [recovered, failed];
    const graph = buildGraph(spans),
      index = buildObservationIndex(spans);
    expect(graph.nodes[0]?.errorCount).toBe(1);
    expect(visualStatus(index.latestNode.get('api'), 400)).toBe('healthy');
    expect(observedSpansForNode(spans, graph.nodes[0]!).some((s) => s.status === 'error')).toBe(
      true,
    );
    expect(visualStatus(failed, 400)).toBe('error');
    expect(visualStatus(span(3, { durationMs: 500 }), 400)).toBe('slow');
  });
  it('matches exact database and cross-service identities without linking separate traces', () => {
    const root = span(1, { serviceName: 'frontend' });
    const child = span(2, { parentSpanId: root.spanId });
    const database = span(3, {
      parentSpanId: child.spanId,
      kind: 3,
      attributes: { 'db.system.name': 'sqlite', 'db.namespace': 'orders' },
    });
    const other = span(4, {
      parentSpanId: root.spanId,
      traceId: 'f'.repeat(32),
      serviceName: 'unrelated',
    });
    const spans = [database, child, root, other, child],
      graph = buildGraph(spans),
      index = buildObservationIndex(spans);
    expect(index.byEdge.get(JSON.stringify(['frontend', 'api']))).toEqual([child]);
    expect(index.byEdge.get(JSON.stringify(['api', 'database:sqlite:orders']))).toEqual([database]);
    expect(index.byEdge.has(JSON.stringify(['frontend', 'unrelated']))).toBe(false);
    const dependency = graph.nodes.find((n) => n.id === 'database:sqlite:orders')!;
    expect(observedSpansForNode(spans, dependency)).toEqual([database]);
    expect(observedSpansForNode(spans, { ...dependency, id: 'database:sqlite:users' })).toEqual([]);
  });
  it('does not duplicate an instrumented downstream service as an external dependency', () => {
    const client = span(1, { kind: 3, attributes: { 'peer.service': 'users' } });
    const server = span(2, { serviceName: 'users', parentSpanId: client.spanId });
    const index = buildObservationIndex([client, server]);
    expect(index.byNode.has('external:users')).toBe(false);
    expect(index.byEdge.get(JSON.stringify(['api', 'users']))).toEqual([server]);
  });
});

describe('stable bounded rendering', () => {
  it('keeps node positions as new services arrive, and shares deterministic initial coordinates', () => {
    const registry = createLayoutRegistry(),
      initial: ServiceGraph = { nodes: ['api', 'auth', 'orders', 'users'].map(node), edges: [] };
    const first = registry.layout(initial),
      grown = registry.layout({ nodes: [node('cache'), ...initial.nodes], edges: [] });
    for (const original of first.nodes)
      expect(grown.nodes.find((n) => n.id === original.id)?.position).toEqual(original.position);
    expect(createLayoutRegistry().layout(initial)).toEqual(first);
    expect(initial.nodes.every((n) => n.position.every((value) => value === 0))).toBe(true);
    for (let a = 0; a < grown.nodes.length; a++)
      for (let b = a + 1; b < grown.nodes.length; b++) {
        const p = grown.nodes[a]!.position,
          q = grown.nodes[b]!.position;
        expect(Math.hypot(p[0] - q[0], p[2] - q[2])).toBeGreaterThanOrEqual(3.15);
      }
  });
  it('caps nodes and edges, preserves the selected service, and removes dangling edges', () => {
    const nodes = Array.from({ length: 50 }, (_, i) => node(`service-${i}`));
    const graph: ServiceGraph = {
      nodes,
      edges: nodes.flatMap((a) =>
        nodes
          .filter((b) => b.id !== a.id)
          .map((b) => ({
            id: JSON.stringify([a.id, b.id]),
            source: a.id,
            target: b.id,
            spanCount: 1,
            errorCount: 0,
            p95: 20,
            lastSeen: 1000,
          })),
      ),
    };
    const bounded = boundedGraph(graph, 'service-49'),
      ids = new Set(bounded.nodes.map((n) => n.id));
    expect(bounded.nodes).toHaveLength(40);
    expect(ids.has('service-49')).toBe(true);
    expect(bounded.edges).toHaveLength(300);
    expect(bounded.edges.every((edge) => ids.has(edge.source) && ids.has(edge.target))).toBe(true);
  });
  it('caps directional particles globally and draws only actual recent spans', () => {
    const spans: NormalizedSpan[] = [];
    for (let service = 0; service < 30; service++)
      for (let request = 0; request < 8; request++) {
        const root = span(service * 100 + request * 2 + 1, {
          serviceName: 'frontend',
          startTime: 1000,
        });
        spans.push(
          root,
          span(service * 100 + request * 2 + 2, {
            parentSpanId: root.spanId,
            serviceName: `service-${service}`,
            startTime: 1020,
          }),
        );
      }
    const graph = buildGraph(spans),
      index = buildObservationIndex(spans);
    const props = {
      quality: 'balanced' as const,
      particleDensity: 10,
      selected: null,
      direction: 'all' as const,
      replay: false,
    };
    const particles = particleObservations(graph, index, props, 2000);
    expect(particles).toHaveLength(96);
    expect(particleObservations(graph, index, { ...props, quality: 'low' }, 2000)).toHaveLength(32);
    expect(particleObservations(graph, index, { ...props, quality: 'high' }, 2000)).toHaveLength(
      160,
    );
    expect(
      particles.every((p) => spans.includes(p.span) && graph.edges.some((e) => e.id === p.edgeId)),
    ).toBe(true);
    expect(particleObservations(graph, index, props, 20000)).toEqual([]);
    expect(particleObservations(graph, index, { ...props, particleDensity: 0 }, 2000)).toEqual([]);
    expect(
      particleObservations(
        graph,
        index,
        { ...props, selected: 'frontend', direction: 'incoming' },
        2000,
      ),
    ).toEqual([]);
  });
});
