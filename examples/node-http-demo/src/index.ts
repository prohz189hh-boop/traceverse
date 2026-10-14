import { createRequire } from 'node:module';
import { startTracing } from '@traceverse/sdk';
const sdk = startTracing('node-http-example', { endpoint: process.env.TRACEVERSE_ENDPOINT });
// Load the framework after instrumentation so official HTTP patching takes effect.
const require = createRequire(import.meta.url);
const { createServer } = require('node:http') as typeof import('node:http');
const server = createServer((_request, response) => {
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ ok: true }));
});
server.listen(Number(process.env.TRACEVERSE_PORT ?? 4800), '127.0.0.1', () => {
  const address = server.address();
  if (address && typeof address !== 'string') console.log(`FRAMEWORK_READY ${address.port}`);
});
process.on('SIGTERM', () => server.close(() => { void sdk.shutdown(); }));
process.on('SIGINT', () => server.close(() => { void sdk.shutdown(); }));
