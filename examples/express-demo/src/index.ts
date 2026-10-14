import express, { type Request } from 'express';
import { ROOT_CONTEXT, trace, SpanKind, SpanStatusCode, type Context, type Span, type Tracer } from '@opentelemetry/api';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { BasicTracerProvider, BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Server } from 'node:http';

const names = ['web-frontend', 'api-service', 'user-service', 'order-service', 'payment-sandbox'] as const;
const scenarios = ['success', 'slow', 'error', 'multi', 'recovery'] as const;
type ServiceName = typeof names[number];
type Scenario = typeof scenarios[number];
class DemoFailure extends Error { constructor() { super('Deterministic demo failure'); this.name = 'DemoFailure'; } }
const pause = (milliseconds: number) => new Promise<void>((resolvePause) => setTimeout(resolvePause, milliseconds));
export interface DemoOptions { dbPath?: string; basePort?: number; endpoint?: string; autotraffic?: boolean }
export async function startDemo(options: DemoOptions = {}) {
  const basePort = options.basePort ?? 4600;
  const endpoint = options.endpoint ?? 'http://127.0.0.1:4318/v1/traces';
  const dbPath = options.dbPath ?? resolve('.traceverse/demo.sqlite');
  if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true });
  const database = new DatabaseSync(dbPath);
  database.exec("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT); INSERT OR IGNORE INTO users VALUES (1, 'Demo customer'); CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY, user_id INTEGER, total INTEGER); INSERT OR IGNORE INTO orders VALUES (1, 1, 42);");
  const propagator = new W3CTraceContextPropagator();
  const providers = new Map<ServiceName, BasicTracerProvider>();
  const tracers = new Map<ServiceName, Tracer>();
  const ports = Object.fromEntries(names.map((name, index) => [name, basePort + index])) as Record<ServiceName, number>;
  const servers: Server[] = [];
  for (const name of names) {
    const provider = new BasicTracerProvider({
      resource: resourceFromAttributes({
        'service.name': name, 'traceverse.source': 'demo',
        ...(name === 'web-frontend' ? { 'service.role': 'frontend' } : {}),
        ...(name === 'payment-sandbox' ? { 'traceverse.category': 'external' } : {}),
      }),
      spanProcessors: [new BatchSpanProcessor(new OTLPTraceExporter({ url: endpoint, timeoutMillis: 5000 }), { scheduledDelayMillis: 250, maxQueueSize: 2048, maxExportBatchSize: 256 })],
    });
    providers.set(name, provider); tracers.set(name, provider.getTracer('traceverse-express-demo', '0.1.0'));
  }
  const flush = async () => { await Promise.all([...providers.values()].map((provider) => provider.forceFlush())); };
  const markError = (span: Span, error: unknown) => {
    span.setStatus({ code: SpanStatusCode.ERROR });
    span.addEvent('exception', { 'exception.type': error instanceof Error ? error.name : 'Error' });
  };
  const child = async <T>(service: ServiceName, name: string, parent: Context, attributes: Record<string, string | number>, work: (spanContext: Context) => Promise<T> | T, kind = SpanKind.INTERNAL): Promise<T> => {
    const span = tracers.get(service)!.startSpan(name, { kind, attributes }, parent);
    try { const result = await work(trace.setSpan(parent, span)); span.setStatus({ code: SpanStatusCode.OK }); return result; }
    catch (error) { markError(span, error); throw error; }
    finally { span.end(); }
  };
  const call = (from: ServiceName, target: ServiceName, path: string, scenario: Scenario, parent: Context) => child(from, `GET ${target}${path}`, parent, {
    'http.request.method': 'GET', 'peer.service': target, 'server.address': '127.0.0.1',
    'server.port': ports[target], 'traceverse.scenario': scenario,
  }, async (spanContext) => {
    const headers: Record<string, string> = {};
    propagator.inject(spanContext, headers, { set: (carrier, key, value) => { carrier[key] = value; } });
    const response = await fetch(`http://127.0.0.1:${ports[target]}${path}?scenario=${scenario}`, { headers, signal: AbortSignal.timeout(10000) });
    const result = await response.json() as unknown;
    trace.getSpan(spanContext)?.setAttribute('http.response.status_code', response.status);
    if (!response.ok) throw new DemoFailure();
    return result;
  }, SpanKind.CLIENT);
  const dbQuery = (service: ServiceName, scenario: Scenario, parent: Context, query: string) => child(service, scenario === 'slow' ? 'sqlite slow SELECT' : 'sqlite SELECT', parent, {
    'db.system.name': 'sqlite', 'db.namespace': 'traceverse-demo', 'db.operation.name': 'SELECT', 'traceverse.scenario': scenario,
  }, async () => {
    if (scenario === 'slow') await pause(420);
    return database.prepare(query).all();
  }, SpanKind.CLIENT);
  const getScenario = (request: Request): Scenario => {
    const candidate = request.params.scenario ?? request.query.scenario ?? 'success';
    if (typeof candidate !== 'string' || !scenarios.includes(candidate as Scenario)) throw new Error('Unknown scenario');
    return candidate as Scenario;
  };
  const route = (app: express.Express, service: ServiceName, path: string, work: (scenario: Scenario, parent: Context) => Promise<unknown>, flushResponse = false) => {
    app.get(path, async (request, reply) => {
      let scenario: Scenario;
      try { scenario = getScenario(request); }
      catch { reply.status(400).json({ error: 'Choose success, slow, error, multi, or recovery' }); return; }
      const parent = propagator.extract(ROOT_CONTEXT, request.headers, {
        keys: (carrier) => Object.keys(carrier),
        get: (carrier, key) => carrier[key],
      });
      const span = tracers.get(service)!.startSpan(`GET ${path}`, { kind: SpanKind.SERVER, attributes: { 'http.request.method': 'GET', 'http.route': path, 'traceverse.scenario': scenario } }, parent);
      let body: unknown; let status = 200;
      try { body = await work(scenario, trace.setSpan(parent, span)); span.setStatus({ code: SpanStatusCode.OK }); }
      catch (error) { markError(span, error); status = 500; body = { error: 'Deterministic demo failure', scenario, recovered: false }; }
      span.setAttribute('http.response.status_code', status); span.end();
      if (flushResponse) {
        try { await flush(); }
        catch { reply.status(503).json({ error: 'Demo telemetry could not be flushed. Start the local collector.' }); return; }
      }
      reply.status(status).json(body);
    });
  };
  for (const service of names) {
    const app = express();
    app.disable('x-powered-by');
    app.get('/health', (_request, response) => response.json({ status: 'ok', service, source: 'demo' }));
    if (service === 'web-frontend') {
      app.get('/', (_request, response) => response.type('html').send(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>TraceVerse real Express demo</title><style>body{background:#090e1d;color:#e5efff;font:16px system-ui;max-width:680px;margin:80px auto;padding:24px}button,select{font:inherit;padding:12px;color:#090e1d;background:#67e8f9;border:0;border-radius:8px}pre{white-space:pre-wrap;color:#a5b4fc}a{color:#67e8f9}</style><h1>TraceVerse · Real Express demo</h1><p>Five local HTTP services, a SQLite database, and official OpenTelemetry spans. Every request is labeled <strong>demo</strong>.</p><p><a href="http://127.0.0.1:5173">Open the TraceVerse dashboard</a></p><label for="scenario">Scenario </label><select id="scenario">${scenarios.map((scenario) => `<option>${scenario}</option>`).join('')}</select> <button id="run">Run request</button><pre id="result" aria-live="polite">Ready.</pre><script>document.getElementById('run').onclick=async()=>{const result=document.getElementById('result');result.textContent='Running real local requests…';try{const response=await fetch('/scenario/'+document.getElementById('scenario').value);result.textContent=JSON.stringify(await response.json(),null,2)}catch{result.textContent='Request failed. Check that the demo is running.'}}</script></html>`));
      route(app, service, '/scenario/:scenario', async (scenario, parent) => ({ source: 'demo', scenario, recovered: scenario === 'recovery', result: await call(service, 'api-service', '/checkout', scenario, parent) }), true);
    } else if (service === 'api-service') {
      route(app, service, '/checkout', async (scenario, parent) => {
        const user = await call(service, 'user-service', '/user', scenario, parent);
        const order = await call(service, 'order-service', '/order', scenario, parent);
        const extra = scenario === 'multi' ? await call(service, 'user-service', '/user', scenario, parent) : undefined;
        return { user, order, ...(extra ? { extra } : {}) };
      });
    } else if (service === 'user-service') {
      route(app, service, '/user', async (scenario, parent) => ({ users: await dbQuery(service, 'success', parent, 'SELECT id, name FROM users'), scenario }));
    } else if (service === 'order-service') {
      route(app, service, '/order', async (scenario, parent) => ({ orders: await dbQuery(service, scenario, parent, 'SELECT id, total FROM orders'), payment: await call(service, 'payment-sandbox', '/charge', scenario, parent) }));
    } else {
      route(app, service, '/charge', async (scenario) => { await pause(25); if (scenario === 'error') throw new DemoFailure(); return { accepted: true, sandbox: true }; });
    }
    try {
      const server = await new Promise<Server>((resolveServer, reject) => {
        const listening = app.listen(basePort === 0 ? 0 : ports[service], '127.0.0.1', () => resolveServer(listening));
        listening.once('error', reject);
      });
      const address = server.address();
      if (address && typeof address !== 'string') ports[service] = address.port;
      servers.push(server);
    } catch (error) {
      for (const server of servers) server.close();
      await Promise.all([...providers.values()].map((provider) => provider.shutdown())); database.close(); throw error;
    }
  }
  let iteration = 0;
  let generating = false;
  const generate = async () => {
    if (generating) return;
    generating = true;
    try { await fetch(`http://127.0.0.1:${ports['web-frontend']}/scenario/${scenarios[iteration++ % scenarios.length]}`, { signal: AbortSignal.timeout(10000) }); }
    catch { /* Requests can fail during shutdown; scenario errors are part of the demo. */ }
    finally { generating = false; }
  };
  const timer = options.autotraffic === false ? undefined : setInterval(() => { void generate(); }, 2500);
  if (timer) { timer.unref(); void generate(); }
  const close = async () => {
    if (timer) clearInterval(timer);
    await Promise.all(servers.map((server) => new Promise<void>((resolveClose) => { server.close(() => resolveClose()); server.closeIdleConnections(); })));
    await Promise.all([...providers.values()].map((provider) => provider.shutdown()));
    database.close();
  };
  return { servers, ports, flush, close };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const demo = await startDemo({ autotraffic: process.env.TRACEVERSE_DEMO_AUTOTRAFFIC !== '0', endpoint: process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT });
    console.log('TraceVerse real Express demo: http://127.0.0.1:4600 (five local services; demo-labeled spans)');
    for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { void demo.close(); });
  } catch {
    console.error('Demo could not start. Check that ports 4600–4604 are available.'); process.exitCode = 1;
  }
}
