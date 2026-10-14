import { createRequire } from 'node:module';
import { startTracing } from '@traceverse/sdk';
import FastifyOtelInstrumentation from '@fastify/otel';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
const instrumentation = new FastifyOtelInstrumentation({ instrumentHooks: false });
const sdk = startTracing('fastify-example', {
  endpoint: process.env.TRACEVERSE_ENDPOINT,
  instrumentations: [new HttpInstrumentation(), instrumentation],
});
const require = createRequire(import.meta.url);
const Fastify = require('fastify') as typeof import('fastify').default;
const app = Fastify({ logger: false });
await app.register(instrumentation.plugin());
app.get('/tested', async () => ({ ok: true, framework: 'Fastify' }));
await app.listen({ host: '127.0.0.1', port: Number(process.env.TRACEVERSE_PORT ?? 4801) });
const address = app.server.address();
if (address && typeof address !== 'string') console.log(`FRAMEWORK_READY ${address.port}`);
async function stop() { await app.close(); await sdk.shutdown(); }
process.on('SIGTERM', () => { void stop(); });
process.on('SIGINT', () => { void stop(); });
