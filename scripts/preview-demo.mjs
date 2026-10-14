import { preview } from 'vite';
const server = await preview({ root: 'apps/web', mode: 'public-demo' });
server.printUrls();
console.log(
  'Public demo preview → http://127.0.0.1:4173/traceverse/ (synthetic only; no collector)',
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, () => {
    server.httpServer.close();
  });
