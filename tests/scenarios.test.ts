import { describe, expect, it } from 'vitest';
import { buildGraph, sanitizeAttributes, validateSession } from '@traceverse/core';
import { assertSynthetic, createScenario, scenarios } from '../apps/web/src/scenarios';

describe('bundled synthetic scenarios', () => {
  for (const scenario of scenarios) {
    it(`${scenario.id} contains valid, safe spans and evidence for all nine entities`, () => {
      const spans = createScenario(scenario.id, { startTime: 1791975600000 });
      const session = validateSession({ version: 1, exportedAt: '2026-10-14T00:00:00Z', spans });
      expect(session.spans).toEqual(spans);
      expect(spans.every((span) => span.source === 'synthetic')).toBe(true);
      for (const span of spans) {
        expect(sanitizeAttributes(span.attributes)).toEqual(span.attributes);
        if (span.parentSpanId) {
          const parent = spans.find(
            (value) => value.traceId === span.traceId && value.spanId === span.parentSpanId,
          )!;
          expect(parent).toBeDefined();
          expect(span.startTime).toBeGreaterThanOrEqual(parent.startTime);
          expect(span.startTime + span.durationMs).toBeLessThanOrEqual(
            parent.startTime + parent.durationMs,
          );
        }
      }
      const graph = buildGraph(spans);
      expect(graph.nodes.map((node) => node.id)).toEqual(
        expect.arrayContaining([
          'frontend',
          'api-gateway',
          'auth-service',
          'user-service',
          'order-service',
          'database:sqlite:Database',
          'database:redis:Cache',
          'payment-simulator',
          'notification-service',
        ]),
      );
      expect(graph.nodes).toHaveLength(9);
      expect(graph.edges).toHaveLength(9);
      expect(
        graph.edges.every(
          (edge) =>
            graph.nodes.some((node) => node.id === edge.source) &&
            graph.nodes.some((node) => node.id === edge.target),
        ),
      ).toBe(true);
    });
  }
  it('exposes slow database and API failure evidence', () => {
    expect(
      createScenario('slow').find((span) => span.operation === 'SELECT order')?.durationMs,
    ).toBe(900);
    expect(
      createScenario('error').find((span) => span.serviceName === 'api-gateway'),
    ).toMatchObject({
      status: 'error',
      attributes: { 'http.response.status_code': 503 },
      events: [{ attributes: { 'exception.type': 'SimulatedApiError' } }],
    });
  });
  it('keeps recovery evidence and ends in successful observations', () => {
    const spans = createScenario('recovery');
    expect(spans.some((span) => span.status === 'error')).toBe(true);
    expect(spans.filter((span) => span.serviceName === 'api-gateway').at(-1)?.status).toBe('ok');
    expect(new Set(spans.map((span) => span.traceId)).size).toBe(2);
  });
  it('heavy traces overlap and sequence IDs do not collide', () => {
    const first = createScenario('heavy', { sequence: 1 });
    const second = createScenario('heavy', { sequence: 2 });
    expect(new Set(first.map((span) => span.traceId)).size).toBe(12);
    const roots = first.filter((span) => !span.parentSpanId);
    expect(roots[1]!.startTime).toBeLessThan(roots[0]!.startTime + roots[0]!.durationMs);
    const spans = [...first, ...second];
    expect(new Set(spans.map((span) => `${span.traceId}:${span.spanId}`)).size).toBe(spans.length);
    expect(buildGraph([...first, ...first])).toEqual(buildGraph(first));
  });
  it('blocks real telemetry from the public preview', () => {
    const spans = createScenario('success');
    expect(() => assertSynthetic(spans)).not.toThrow();
    expect(() => assertSynthetic([{ ...spans[0]!, source: 'live' }])).toThrow(
      'synthetic sessions only',
    );
    expect(() => assertSynthetic([{ ...spans[0]!, source: 'demo' }])).toThrow(
      'synthetic sessions only',
    );
  });
});
