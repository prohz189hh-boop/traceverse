import { describe, expect, it } from 'vitest';
import { buildGraph, normalizeOtlp, percentile, sanitizeAttributes, validateSession, type NormalizedSpan } from '@traceverse/core';

const traceId = 'a'.repeat(32);
const spanId = 'b'.repeat(16);
function payload(overrides: Record<string, unknown> = {}) {
  return { resourceSpans: [{ resource: { attributes: [{ key: 'service.name', value: { stringValue: 'api-service' } }, { key: 'traceverse.source', value: { stringValue: 'demo' } }] }, scopeSpans: [{ spans: [{ traceId, spanId, name: 'GET /users?token=secret', startTimeUnixNano: '1791975600000000000', endTimeUnixNano: '1791975600025000000', kind: 2, status: { code: 1 }, ...overrides }] }] }] };
}
function span(overrides: Partial<NormalizedSpan> = {}): NormalizedSpan {
  return { traceId, spanId, serviceName: 'api-service', operation: 'GET /users', startTime: Date.now(), durationMs: 25, status: 'ok', kind: 2, attributes: {}, events: [], source: 'live', ...overrides };
}
describe('OTLP normalization and privacy', () => {
  it('decodes official HTTP JSON timestamps, IDs, source and safe typed attributes', () => {
    const [result] = normalizeOtlp(payload({ attributes: [{ key: 'http.response.status_code', value: { intValue: '200' } }] }));
    expect(result).toMatchObject({ traceId, spanId, serviceName: 'api-service', operation: 'GET /users', durationMs: 25, source: 'demo', status: 'ok', attributes: { 'http.response.status_code': 200 } });
    expect(result?.startTime).toBe(1791975600000);
  });
  it('supports symbolic enums, errors, parent IDs and exception classes without messages', () => {
    const [result] = normalizeOtlp(payload({ kind: 'SPAN_KIND_SERVER', parentSpanId: 'c'.repeat(16), status: { code: 'STATUS_CODE_ERROR', message: 'password=secret' }, events: [{ name: 'exception', timeUnixNano: '1791975600010000000', attributes: [{ key: 'exception.type', value: { stringValue: 'DatabaseError' } }, { key: 'exception.message', value: { stringValue: 'token=secret' } }, { key: 'exception.stacktrace', value: { stringValue: 'private contents' } }] }] }));
    expect(result).toMatchObject({ kind: 2, status: 'error', parentSpanId: 'c'.repeat(16), events: [{ name: 'exception', attributes: { 'exception.type': 'DatabaseError' } }] });
    expect(JSON.stringify(result)).not.toContain('secret');
  });
  it('classifies HTTP 5xx unset spans as errors without assuming every 4xx is failure', () => {
    const attributes = (status: number) => [{ key: 'http.response.status_code', value: { intValue: String(status) } }];
    expect(normalizeOtlp(payload({ status: {}, attributes: attributes(503) }))[0]?.status).toBe('error');
    expect(normalizeOtlp(payload({ status: {}, attributes: attributes(404) }))[0]?.status).toBe('unset');
  });
  it('removes credentials, URLs queries, SQL, bodies, custom secrets and control characters', () => {
    const clean = sanitizeAttributes({ 'url.full': 'http://user:password@localhost/users?token=abc#secret', 'http.route': '/users?password=x', 'db.statement': 'SELECT secret', 'http.request.body': 'private', authorization: 'Bearer abc', 'custom.secret': 'abc', 'service.name': 'api\nservice' });
    expect(clean).toEqual({ 'url.full': 'http://localhost/users', 'http.route': '/users', 'service.name': 'apiservice' });
  });
  it.each([{ resourceSpans: 'wrong' }, null, payload({ traceId: 'bad' }), payload({ spanId: '0'.repeat(16) }), payload({ endTimeUnixNano: '1791975599000000000' }), payload({ startTimeUnixNano: -1 }), payload({ kind: 8 }), payload({ parentSpanId: spanId })])('rejects malformed telemetry %#', (input) => {
    expect(() => normalizeOtlp(input)).toThrow();
  });
  it('deduplicates identities within an OTLP request', () => {
    const input = payload(); const spans = input.resourceSpans[0]!.scopeSpans[0]!.spans;
    spans.push(spans[0]!); expect(normalizeOtlp(input)).toHaveLength(1);
  });
});
describe('graph relationships and observed statistics', () => {
  it('builds real cross-service parent edges, database and uninstrumented dependencies', () => {
    const root = span({ serviceName: 'web-frontend', attributes: { 'service.role': 'frontend' } });
    const api = span({ spanId: 'c'.repeat(16), parentSpanId: root.spanId, status: 'error', durationMs: 100 });
    const database = span({ spanId: 'd'.repeat(16), parentSpanId: api.spanId, kind: 3, attributes: { 'db.system.name': 'sqlite', 'db.namespace': 'demo' } });
    const external = span({ spanId: 'e'.repeat(16), parentSpanId: api.spanId, kind: 3, attributes: { 'peer.service': 'payment-sandbox' } });
    const graph = buildGraph([root, api, database, external, api]);
    expect(graph.nodes.find((node) => node.id === 'web-frontend')?.category).toBe('frontend');
    expect(graph.nodes.find((node) => node.id === 'api-service')).toMatchObject({ spanCount: 3, errorCount: 1, p95: 100 });
    expect(graph.nodes.find((node) => node.id === 'database:sqlite:demo')?.category).toBe('database');
    expect(graph.edges.map((edge) => [edge.source, edge.target])).toEqual(expect.arrayContaining([['web-frontend', 'api-service'], ['api-service', 'database:sqlite:demo'], ['api-service', 'external:payment-sandbox']]));
    expect(graph.edges).toHaveLength(3);
  });
  it('does not create an external duplicate when a downstream service is instrumented', () => {
    const client = span({ kind: 3, attributes: { 'peer.service': 'users' } });
    const server = span({ spanId: 'c'.repeat(16), parentSpanId: spanId, serviceName: 'users' });
    expect(buildGraph([server, client]).nodes.map((node) => node.id)).toEqual(['api-service', 'users']);
  });
  it('never links same span IDs across traces and preserves positions as topology grows', () => {
    const initial = span(); const other = span({ traceId: 'f'.repeat(32), spanId: 'c'.repeat(16), parentSpanId: spanId, serviceName: 'unrelated' });
    expect(buildGraph([initial, other]).edges).toHaveLength(0);
    expect(buildGraph([initial, other]).nodes.find((node) => node.id === 'api-service')?.position).toEqual(buildGraph([initial]).nodes[0]?.position);
  });
  it('calculates nearest-rank percentiles and handles empty observations', () => {
    expect(percentile([], 0.95)).toBe(0); expect(percentile([10, 20, 30, 40], 0.5)).toBe(20); expect(percentile([10, 20, 30, 40], 0.95)).toBe(40);
  });
});
describe('session import/export contracts', () => {
  it('validates and sanitizes imported data, retains historical timestamps and removes duplicates', () => {
    const original = span({ attributes: { 'http.route': '/users?token=secret', password: 'secret' } });
    const session = validateSession({ version: 1, exportedAt: new Date().toISOString(), spans: [original, original] });
    expect(session.spans).toHaveLength(1); expect(session.spans[0]?.startTime).toBe(original.startTime); expect(session.spans[0]?.attributes).toEqual({ 'http.route': '/users' });
  });
  it.each([{ version: 2, exportedAt: new Date().toISOString(), spans: [] }, { version: 1, exportedAt: 'bad', spans: [] }, { version: 1, exportedAt: new Date().toISOString(), spans: [span({ durationMs: -1 })] }])('rejects invalid sessions %#', (input) => {
    expect(() => validateSession(input)).toThrow();
  });
});
