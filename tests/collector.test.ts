import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createCollector } from '../apps/collector/src/server.js';
import { CollectorStore } from '../apps/collector/src/store.js';
import { startDemo } from '../examples/express-demo/src/index.js';
import { buildGraph, type NormalizedSpan, type StreamMessage } from '@traceverse/core';

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup();
  cleanups.length = 0;
});
const traceId = 'a'.repeat(32);
function span(index = 1): NormalizedSpan {
  return {
    traceId,
    spanId: index.toString(16).padStart(16, '0'),
    serviceName: 'api',
    operation: 'GET /users',
    startTime: Date.now(),
    durationMs: 12,
    status: 'ok',
    kind: 2,
    attributes: {},
    events: [],
    source: 'live',
  };
}
function payload() {
  const now = BigInt(Date.now()) * 1000000n;
  return {
    resourceSpans: [
      {
        resource: { attributes: [{ key: 'service.name', value: { stringValue: 'api' } }] },
        scopeSpans: [
          {
            spans: [
              {
                traceId,
                spanId: 'b'.repeat(16),
                name: 'GET /users',
                kind: 2,
                startTimeUnixNano: String(now),
                endTimeUnixNano: String(now + 12000000n),
                status: { code: 1 },
              },
            ],
          },
        ],
      },
    ],
  };
}
async function collector() {
  const value = await createCollector({ dbPath: ':memory:' });
  cleanups.push(() => value.app.close());
  return value;
}
function receive(socket: WebSocket): Promise<StreamMessage> {
  return new Promise((resolveMessage, reject) => {
    const timer = setTimeout(() => reject(new Error('WebSocket message timeout')), 3000);
    socket.once('message', (data) => {
      clearTimeout(timer);
      resolveMessage(JSON.parse(data.toString()) as StreamMessage);
    });
    socket.once('error', reject);
  });
}
describe('collector HTTP API and privacy boundary', () => {
  it('ingests valid OTLP, deduplicates repeated payloads, exports and imports a sanitized session', async () => {
    const { app } = await collector();
    const body = payload();
    expect(
      (await app.inject({ method: 'POST', url: '/v1/traces', payload: body })).statusCode,
    ).toBe(200);
    await app.inject({ method: 'POST', url: '/v1/traces', payload: body });
    const session = (await app.inject('/api/session')).json();
    expect(session.spans).toHaveLength(1);
    expect((await app.inject({ method: 'DELETE', url: '/api/session' })).json()).toEqual({
      cleared: true,
    });
    session.spans[0].attributes = {
      authorization: 'Bearer private',
      'url.full': 'http://localhost/path?token=private',
    };
    expect(
      (await app.inject({ method: 'POST', url: '/api/session', payload: session })).json(),
    ).toEqual({ imported: 1 });
    expect((await app.inject('/api/spans')).json().spans[0].attributes).toEqual({
      'url.full': 'http://localhost/path',
    });
  });
  it('rejects malformed data, oversized requests, untrusted origins and DNS rebinding hosts', async () => {
    const { app } = await collector();
    expect(
      (await app.inject({ method: 'POST', url: '/v1/traces', payload: { resourceSpans: 'wrong' } }))
        .statusCode,
    ).toBe(400);
    expect(
      (await app.inject({ method: 'POST', url: '/api/session', payload: { version: 2 } }))
        .statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/traces',
          headers: { 'content-type': 'application/json' },
          payload: JSON.stringify({ padding: 'x'.repeat(2 * 1024 * 1024) }),
        })
      ).statusCode,
    ).toBe(413);
    for (const headers of [
      { origin: 'https://evil.example' },
      { host: '127.0.0.1.evil.example' },
      { host: 'localhost@evil.example' },
    ])
      expect((await app.inject({ url: '/health', headers })).statusCode).toBe(403);
    expect(
      (await app.inject({ url: '/health', headers: { origin: 'http://127.0.0.1:5173' } }))
        .statusCode,
    ).toBe(200);
  });
  it('bounds settings and limits request rates', async () => {
    const { app } = await collector();
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: '/api/settings',
          payload: { retentionMinutes: 0 },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (await app.inject({ method: 'PATCH', url: '/api/settings', payload: { maxSpans: 100001 } }))
        .statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: '/api/settings',
          payload: { retentionMinutes: 2, maxSpans: 100 },
        })
      ).json(),
    ).toEqual({ retentionMinutes: 2, maxSpans: 100 });
    let response;
    for (let index = 0; index < 121; index++) response = await app.inject('/health');
    expect(response?.statusCode).toBe(429);
    for (let index = 0; index < 600; index++) {
      response = await app.inject({
        method: 'POST',
        url: '/v1/traces',
        payload: { resourceSpans: [] },
      });
      expect(response.statusCode).toBe(200);
    }
    expect(
      (await app.inject({ method: 'POST', url: '/v1/traces', payload: { resourceSpans: [] } }))
        .statusCode,
    ).toBe(429);
  });
});
describe('SQLite history and real WebSocket streaming', () => {
  it('keeps bounded receipt-time history and persists it across restarts', () => {
    const workRoot = resolve('work');
    mkdirSync(workRoot, { recursive: true });
    const folder = mkdtempSync(join(workRoot, 'history-test-'));
    cleanups.push(() => {
      if (!folder.startsWith(workRoot)) throw new Error('Invalid cleanup path');
      rmSync(folder, { recursive: true, force: true });
    });
    const dbPath = join(folder, 'history.sqlite');
    const store = new CollectorStore(dbPath, { retentionMinutes: 1, maxSpans: 100 });
    store.add(Array.from({ length: 150 }, (_, index) => span(index + 1)));
    expect(store.all()).toHaveLength(100);
    store.close();
    const reopened = new CollectorStore(dbPath, { retentionMinutes: 1, maxSpans: 100 });
    expect(reopened.all()).toHaveLength(100);
    expect(reopened.prune(Date.now() + 61000)).toBe(100);
    expect(reopened.all()).toHaveLength(0);
    reopened.close();
  });
  it('sends snapshot, batches actual ingestion, resets and snapshots on reconnect', async () => {
    const { app } = await collector();
    const address = await app.listen({ host: '127.0.0.1', port: 0 });
    const socket = new WebSocket(address.replace('http:', 'ws:') + '/ws');
    cleanups.push(() => socket.terminate());
    expect(await receive(socket)).toEqual({ type: 'snapshot', spans: [] });
    const batch = receive(socket);
    await app.inject({ method: 'POST', url: '/v1/traces', payload: payload() });
    expect(await batch).toMatchObject({ type: 'batch', spans: [{ serviceName: 'api' }] });
    const reset = receive(socket);
    await app.inject({ method: 'DELETE', url: '/api/session' });
    expect(await reset).toEqual({ type: 'reset', spans: [] });
    const imported = receive(socket);
    await app.inject({
      method: 'POST',
      url: '/api/session',
      payload: { version: 1, exportedAt: new Date().toISOString(), spans: [span()] },
    });
    expect((await imported).spans).toHaveLength(1);
    socket.terminate();
    const reconnected = new WebSocket(address.replace('http:', 'ws:') + '/ws');
    cleanups.push(() => reconnected.terminate());
    expect(await receive(reconnected)).toMatchObject({
      type: 'snapshot',
      spans: [{ serviceName: 'api' }],
    });
  });
  it('resynchronizes connected dashboards when the storage cap evicts old spans', async () => {
    const { app } = await createCollector({ dbPath: ':memory:', maxSpans: 100 });
    cleanups.push(() => app.close());
    const address = await app.listen({ host: '127.0.0.1', port: 0 });
    const socket = new WebSocket(address.replace('http:', 'ws:') + '/ws');
    cleanups.push(() => socket.terminate());
    await receive(socket);
    const imported = receive(socket);
    await app.inject({
      method: 'POST',
      url: '/api/session',
      payload: {
        version: 1,
        exportedAt: new Date().toISOString(),
        spans: Array.from({ length: 100 }, (_, index) => span(index + 1)),
      },
    });
    await imported;
    const reset = receive(socket);
    await app.inject({ method: 'POST', url: '/v1/traces', payload: payload() });
    const message = await reset;
    expect(message.type).toBe('reset');
    expect(message.spans).toHaveLength(100);
    expect(message.spans.some((item) => item.spanId === 'b'.repeat(16))).toBe(true);
  });
});
describe('real instrumented five-service Express demo', () => {
  it('exports successful, slow, failed and recovered distributed traces into the collector', async () => {
    const { app, store } = await collector();
    const address = await app.listen({ host: '127.0.0.1', port: 0 });
    const demo = await startDemo({
      dbPath: ':memory:',
      basePort: 0,
      endpoint: `${address}/v1/traces`,
      autotraffic: false,
    });
    cleanups.push(() => demo.close());
    const frontend = `http://127.0.0.1:${demo.ports['web-frontend']}`;
    expect((await fetch(`${frontend}/health`)).status).toBe(200);
    for (const scenario of ['success', 'slow', 'error', 'multi', 'recovery']) {
      const response = await fetch(`${frontend}/scenario/${scenario}`);
      expect(response.status).toBe(scenario === 'error' ? 500 : 200);
    }
    const spans = store.all();
    expect(spans.length).toBeGreaterThan(40);
    expect(spans.every((item) => item.source === 'demo')).toBe(true);
    const graph = buildGraph(spans);
    expect(graph.nodes.map((node) => node.id)).toEqual(
      expect.arrayContaining([
        'web-frontend',
        'api-service',
        'user-service',
        'order-service',
        'payment-sandbox',
        'database:sqlite:traceverse-demo',
      ]),
    );
    expect(
      graph.edges.find((edge) => edge.source === 'web-frontend' && edge.target === 'api-service')
        ?.spanCount,
    ).toBe(5);
    expect(
      spans.some((item) => item.attributes['db.system.name'] === 'sqlite' && item.durationMs > 400),
    ).toBe(true);
    expect(
      spans.some(
        (item) =>
          item.status === 'error' &&
          item.events.some((event) => event.attributes['exception.type'] === 'DemoFailure'),
      ),
    ).toBe(true);
    const recovery = spans.filter((item) => item.attributes['traceverse.scenario'] === 'recovery');
    expect(recovery.length).toBeGreaterThan(5);
    expect(recovery.every((item) => item.status !== 'error')).toBe(true);
  }, 20000);
});
