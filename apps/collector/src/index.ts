import { createCollector } from './server.js';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
export { createCollector } from './server.js';
export { CollectorStore } from './store.js';

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.TRACEVERSE_COLLECTOR_PORT ?? 4318);
  const { app } = await createCollector({ port, ...(process.env.TRACEVERSE_DB ? { dbPath: process.env.TRACEVERSE_DB } : {}) });
  try {
    await app.listen({ host: '127.0.0.1', port });
    console.log(`TraceVerse collector: http://127.0.0.1:${port} (OTLP/HTTP JSON: /v1/traces)`);
  } catch {
    console.error('Collector could not start. Check that its local port is available.');
    await app.close(); process.exitCode = 1;
  }
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { void app.close(); });
}
