import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import staticFiles from '@fastify/static';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { WebSocket } from 'ws';
import {
  normalizeOtlp,
  validateSession,
  type NormalizedSpan,
  type Session,
  type StreamMessage,
} from '@traceverse/core';
import { CollectorStore, validateSettings, type RetentionSettings } from './store.js';

export interface CollectorOptions {
  dbPath?: string;
  port?: number;
  retentionMinutes?: number;
  maxSpans?: number;
}
const origins = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4318',
  'http://127.0.0.1:4318',
]);
export async function createCollector(options: CollectorOptions = {}) {
  const app = Fastify({ logger: false, bodyLimit: 2 * 1024 * 1024, trustProxy: false });
  const store = new CollectorStore(options.dbPath ?? resolve('.traceverse/history.sqlite'), {
    retentionMinutes: options.retentionMinutes ?? 60,
    maxSpans: options.maxSpans ?? 10000,
  });
  const clients = new Set<WebSocket>();
  let pending: NormalizedSpan[] = [];
  app.addHook('onRequest', async (request, reply) => {
    const host = request.headers.host;
    let validHost = false;
    try {
      if (host && !host.includes('@') && !host.includes('/') && !host.includes('\\')) {
        const hostname = new URL(`http://${host}`).hostname;
        validHost = hostname === '127.0.0.1' || hostname === 'localhost';
      }
    } catch {
      /* Reject invalid Host. */
    }
    if (!validHost) return reply.code(403).send({ error: 'Only loopback hosts are allowed' });
    const origin = request.headers.origin;
    if (origin !== undefined && !origins.has(origin))
      return reply.code(403).send({ error: 'Origin is not allowed' });
  });
  await app.register(cors, {
    origin: [...origins],
    methods: ['GET', 'POST', 'DELETE', 'PATCH', 'OPTIONS'],
  });
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });
  await app.register(websocket, { options: { maxPayload: 1024, perMessageDeflate: false } });
  const send = (client: WebSocket, message: StreamMessage) => {
    if (client.readyState !== 1) return;
    if (client.bufferedAmount > 1024 * 1024) {
      client.close(1013, 'Reconnect for a fresh snapshot');
      return;
    }
    client.send(JSON.stringify(message), (error) => {
      if (error) client.terminate();
    });
  };
  const broadcast = (message: StreamMessage) => {
    for (const client of clients) send(client, message);
  };
  const reset = () => {
    pending = [];
    broadcast({ type: 'reset', spans: store.all() });
    store.takePrunedCount();
  };
  const batchTimer = setInterval(() => {
    if (store.takePrunedCount() > 0) {
      reset();
      return;
    }
    if (!pending.length) return;
    const batch = pending;
    pending = [];
    broadcast({ type: 'batch', spans: batch });
  }, 200);
  batchTimer.unref();
  const retentionTimer = setInterval(() => {
    store.prune();
    if (store.takePrunedCount() > 0) reset();
  }, 30000);
  retentionTimer.unref();
  app.get('/health', async () => ({
    status: 'ok',
    version: '0.1.0',
    spans: store.all().length,
    settings: store.settings(),
  }));
  app.get('/api/spans', async () => ({ spans: store.all() }));
  // Five demo services export independently; ingestion gets its own bounded bucket.
  app.post(
    '/v1/traces',
    { config: { rateLimit: { max: 600, timeWindow: '1 minute', groupId: 'otlp' } } },
    async (request, reply) => {
      if (!request.headers['content-type']?.startsWith('application/json'))
        return reply.code(415).send({ error: 'Use OTLP/HTTP JSON (application/json)' });
      try {
        const accepted = store.add(normalizeOtlp(request.body));
        pending.push(...accepted);
        if (pending.length > store.settings().maxSpans)
          pending = pending.slice(-store.settings().maxSpans);
        return reply.code(200).send({});
      } catch (error) {
        return reply
          .code(400)
          .send({ error: error instanceof Error ? error.message : 'Invalid OTLP payload' });
      }
    },
  );
  app.get('/api/session', async (): Promise<Session> => ({
    version: 1,
    exportedAt: new Date().toISOString(),
    spans: store.all(),
  }));
  app.post('/api/session', async (request, reply) => {
    try {
      const session = validateSession(request.body);
      store.replace(session.spans);
      reset();
      return { imported: store.all().length };
    } catch (error) {
      return reply
        .code(400)
        .send({ error: error instanceof Error ? error.message : 'Invalid session' });
    }
  });
  app.delete('/api/session', async () => {
    store.clear();
    reset();
    return { cleared: true };
  });
  app.patch('/api/settings', async (request, reply) => {
    try {
      if (!request.body || typeof request.body !== 'object' || Array.isArray(request.body))
        throw new Error('Invalid settings');
      const input = request.body as Partial<RetentionSettings>;
      if (Object.keys(input).some((key) => key !== 'retentionMinutes' && key !== 'maxSpans'))
        throw new Error('Unknown setting');
      store.configure(validateSettings({ ...store.settings(), ...input }));
      reset();
      return store.settings();
    } catch (error) {
      return reply
        .code(400)
        .send({ error: error instanceof Error ? error.message : 'Invalid settings' });
    }
  });
  app.get('/ws', { websocket: true }, (socket) => {
    if (clients.size >= 8) {
      socket.close(1013, 'Too many connected dashboards');
      return;
    }
    clients.add(socket);
    socket.on('close', () => clients.delete(socket));
    socket.on('error', () => clients.delete(socket));
    socket.on('message', () => socket.close(1008, 'This stream only sends telemetry'));
    send(socket, { type: 'snapshot', spans: store.all() });
  });
  const webRoot = fileURLToPath(new URL('../../web/dist/', import.meta.url));
  if (existsSync(resolve(webRoot, 'index.html'))) {
    await app.register(staticFiles, { root: webRoot });
    app.setNotFoundHandler((request, reply) => {
      if (request.method === 'GET' && !/^\/(api|v1|ws)(\/|$)/.test(request.url))
        return reply.sendFile('index.html');
      return reply.code(404).send({ error: 'Not found' });
    });
  }
  app.setErrorHandler((error, _request, reply) => {
    const status =
      error &&
      typeof error === 'object' &&
      'statusCode' in error &&
      typeof error.statusCode === 'number'
        ? error.statusCode
        : 500;
    return reply
      .code(status)
      .send({
        error:
          status === 413
            ? 'Payload too large'
            : status === 429
              ? 'Rate limit exceeded'
              : status < 500
                ? 'Invalid request'
                : 'Collector request failed',
      });
  });
  app.addHook('onClose', async () => {
    clearInterval(batchTimer);
    clearInterval(retentionTimer);
    for (const client of clients) client.terminate();
    store.close();
  });
  return { app, store };
}
