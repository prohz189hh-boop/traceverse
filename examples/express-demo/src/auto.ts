import { createRequire } from 'node:module';
import { startTracing } from '@traceverse/sdk';
const sdk = startTracing('express-auto-example', { endpoint: process.env.TRACEVERSE_ENDPOINT });
const require = createRequire(import.meta.url);
const express = require('express') as typeof import('express');
const app = express();
app.get('/tested', (_request, response) => response.json({ ok: true, framework: 'Express' }));
const server = app.listen(Number(process.env.TRACEVERSE_PORT ?? 4802), '127.0.0.1', () => {
  const address = server.address();
  if (address && typeof address !== 'string') console.log(`FRAMEWORK_READY ${address.port}`);
});
process.on('SIGTERM', () =>
  server.close(() => {
    void sdk.shutdown();
  }),
);
process.on('SIGINT', () =>
  server.close(() => {
    void sdk.shutdown();
  }),
);
