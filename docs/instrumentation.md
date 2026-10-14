# Connect an application

Start TraceVerse with `npm run dev`, open http://127.0.0.1:5173, and choose **Live**. Your application needs an OpenTelemetry SDK and a **JSON HTTP** trace exporter pointed at `http://127.0.0.1:4318/v1/traces`.

TraceVerse does not automatically instrument an arbitrary running application. Instrumentation must run in the application process before HTTP/framework modules are loaded, and downstream services need compatible context propagation to share a trace.

## Supported integration boundary

| Runtime/framework    | Integration                                                                                    |
| -------------------- | ---------------------------------------------------------------------------------------------- |
| Node.js 24.20.0 HTTP | Official `@opentelemetry/instrumentation-http`; actual local integration verified              |
| Express 5.3.0        | Official HTTP and Express instrumentations; real local demo fixture                            |
| Fastify 5.12.7       | HTTP instrumentation plus maintained `@fastify/otel` 0.21.2; actual local integration verified |
| Next.js 16.4.0       | Node runtime `instrumentation.ts`; local webpack development integration verified              |

These are the repository fixture families, not a promise of every historical or future version. Exact installed dependency versions are recorded in `package-lock.json` and the [dependency license inventory](dependency-licenses.json). The SDK/exporter baseline is 0.223.0 with OpenTelemetry resources 2.12.0. Browser and Next.js Edge runtime tracing are outside this release. Local Windows verification includes actual framework requests through the collector. Next.js 16.4.0 was verified in webpack development mode with checkout and SQLite spans; deployed/serverless/Edge behavior and Next.js production builds were not part of that check. [PROGRESS.md](../PROGRESS.md) records release verification.

The repository also provides working local fixtures. With `npm run dev` running in one terminal, use another terminal for:

```sh
npm run dev --workspace examples/node-http-demo
```

Visit http://127.0.0.1:4800. For Fastify instead:

```sh
npm run dev --workspace examples/fastify-demo
```

Visit http://127.0.0.1:4801/tested. The services are named `node-http-example` and `fastify-example`; both emit **Live** spans and have been exercised through the local collector. They are optional and are not started by `npm run demo`.

## Standalone Node.js and Express setup

The following examples use CommonJS files deliberately so instrumentation can patch dependencies before application imports. They can live in an existing project even when its package has `"type": "module"`, because `.cjs` remains CommonJS.

Install the official packages in **your application directory**:

```sh
npm install @opentelemetry/api@1.9.1 @opentelemetry/sdk-node@0.223.0 @opentelemetry/resources@2.12.0 @opentelemetry/exporter-trace-otlp-http@0.223.0 @opentelemetry/instrumentation-http@0.223.0 @opentelemetry/instrumentation-express@0.71.0
```

Create `instrumentation.cjs`:

```js
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { resourceFromAttributes } = require('@opentelemetry/resources');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');
const { ExpressInstrumentation } = require('@opentelemetry/instrumentation-express');

const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    'service.name': 'my-api',
    'traceverse.source': 'live',
  }),
  autoDetectResources: false,
  traceExporter: new OTLPTraceExporter({
    url: 'http://127.0.0.1:4318/v1/traces',
    timeoutMillis: 5000,
  }),
  metricReaders: [],
  logRecordProcessors: [],
  instrumentations: [new HttpInstrumentation(), new ExpressInstrumentation()],
});
sdk.start();

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    sdk.shutdown().finally(() => process.exit(0));
  });
}
```

This uses only trace export and disables automatic process/environment resource detection. Your application can still set safe resource attributes explicitly. Review upstream defaults if you add more instrumentation or another exporter. The OpenTelemetry [Node.js guide](https://opentelemetry.io/docs/languages/js/getting-started/nodejs/), [resource guide](https://opentelemetry.io/docs/languages/js/resources/), and [exporter guide](https://opentelemetry.io/docs/languages/js/exporters/) explain the underlying SDK setup.

### Node.js HTTP

Create `server.cjs`:

```js
const http = require('node:http');

http
  .createServer((request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ message: 'Hello from my-api' }));
  })
  .listen(4800, '127.0.0.1');
```

Start tracing first, then make a real request:

```sh
node --require ./instrumentation.cjs ./server.cjs
```

Visit http://127.0.0.1:4800 in a browser. Allow a few seconds for the SDK's batch export, then inspect `my-api` in Live mode. Incoming HTTP requests produce server spans; outgoing Node HTTP requests produce client spans and propagate context when supported.

### Express

Install Express in your application: `npm install express@5`. Replace `server.cjs` with:

```js
const express = require('express');
const app = express();

app.get('/hello', (_request, response) => response.json({ message: 'Hello' }));
app.get('/slow', async (_request, response) => {
  await new Promise((resolve) => setTimeout(resolve, 650));
  response.json({ message: 'Completed a slow operation' });
});
app.get('/fail', (_request, response) => {
  response.status(503).json({ error: 'Example service unavailable' });
});
app.listen(4800, '127.0.0.1');
```

Run the same preload command and visit `/hello`, `/slow`, and `/fail`. The HTTP/Express spans describe observed requests and routes. A 5xx HTTP response is classified by the instrumentation; application exceptions require an error status or exception event to be observable.

## Fastify

Use the maintained Fastify-owned [@fastify/otel plugin](https://github.com/fastify/otel). Install it and Fastify in the application:

```sh
npm install fastify@5.12.7 @fastify/otel@0.21.2
```

In `instrumentation.cjs`, add:

```js
const FastifyOtelInstrumentation = require('@fastify/otel');
const fastifyOtelInstrumentation = new FastifyOtelInstrumentation({
  instrumentHooks: false,
});
```

Add it to the SDK's instrumentation list while keeping HTTP instrumentation for upstream/downstream propagation:

```js
instrumentations: [
  new HttpInstrumentation(),
  fastifyOtelInstrumentation,
],
```

At the end of `instrumentation.cjs`, export the instance:

```js
module.exports = { fastifyOtelInstrumentation };
```

Create `server.cjs`:

```js
const { fastifyOtelInstrumentation } = require('./instrumentation.cjs');
const app = require('fastify')();

async function main() {
  await app.register(fastifyOtelInstrumentation.plugin());
  app.get('/hello', async () => ({ message: 'Hello from Fastify' }));
  await app.listen({ host: '127.0.0.1', port: 4800 });
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
```

Start with `node --require ./instrumentation.cjs ./server.cjs` and visit http://127.0.0.1:4800/hello. Register tracing before creating the Fastify instance and defining routes. The TraceVerse helper's default instrumentation list covers HTTP and Express; Fastify's framework spans require this explicit plugin integration.

## Local TraceVerse helper

`@traceverse/sdk` is a private source workspace, **not an npm registry package** in v0.1.0. Inside this repository, import it directly. In an external TypeScript app, install its local folder and use a TypeScript-aware runtime/build pipeline:

```sh
npm install "C:/path/to/traceverse/packages/sdk"
npm install --save-dev tsx
```

Replace the example path with your actual checkout. On Linux/macOS use the absolute local folder path. Create `instrumentation.ts`:

```ts
import { startTracing } from '@traceverse/sdk';

export const tracing = startTracing('my-api', {
  source: 'live',
  endpoint: 'http://127.0.0.1:4318/v1/traces',
});
```

Start before your application: `node --import tsx --import ./instrumentation.ts ./server.ts`. ESM framework auto-instrumentation needs the OpenTelemetry instrumentation loader as well; see the [official ESM support guide](https://github.com/open-telemetry/opentelemetry-js/blob/main/doc/esm-support.md). TypeScript loaders can interact with that hook. Use the verified repository fixture or the CommonJS preload example above if module patching is uncertain.

`startTracing` starts one official Node SDK per process and returns it with `flush()` and `shutdown()` methods. Default export is local HTTP JSON, batched every 250 ms with a bounded queue. It refuses nonlocal/non-HTTP destinations. Options include `source`, `endpoint`, and a custom `instrumentations` list (or `false` for framework-managed/manual spans). Do not initialize multiple global SDKs in the same process.

For an explicit operation:

```ts
import { withSpan } from '@traceverse/sdk';

await withSpan(
  'SELECT orders',
  async () => {
    return database.prepare('SELECT count(*) AS count FROM orders').get();
  },
  { 'db.system': 'sqlite', 'db.name': 'orders', 'db.operation': 'SELECT' },
);
```

The helper records exception type and error status while omitting exception messages/stack traces. It does not automatically instrument every database driver. A manual span is meaningful only when it wraps real work.

## Next.js Node runtime

The repository includes `examples/nextjs-demo` as a local fixture. Verify it separately with:

```sh
npm run test:next
```

To run it manually, first start the collector with `npm run dev`, then run in another terminal:

```sh
npm run dev --workspace @traceverse/nextjs-demo
```

The repository launcher selects webpack and disables Next.js's separate framework usage analytics through `NEXT_TELEMETRY_DISABLED=1`. For your own Next.js app, set `$env:NEXT_TELEMETRY_DISABLED = '1'` in PowerShell before launch, or use a `NEXT_TELEMETRY_DISABLED=1` prefix in a POSIX shell. This is a process environment setting; no global telemetry preference change is required. See [Next.js's telemetry documentation](https://nextjs.org/telemetry).

Open http://127.0.0.1:4700. The example is installed through the root workspace; it does not require a registry-published TraceVerse package.

For your own Next.js application, install the SDK locally and configure Next to transpile it:

```ts
// next.config.ts
import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: ['@traceverse/sdk'],
  serverExternalPackages: [
    '@opentelemetry/sdk-node',
    '@opentelemetry/instrumentation-http',
    '@opentelemetry/instrumentation-express',
  ],
};
export default config;
```

Create `instrumentation.ts` at the application root (or under `src` if your app uses it):

```ts
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startTracing } = await import('@traceverse/sdk');
    startTracing('my-next-app', {
      endpoint: 'http://127.0.0.1:4318/v1/traces',
    });
  }
}
```

This setup matches the repository fixture's default helper instrumentation. Next.js may load some modules before `register`; framework-owned request spans and explicit route operations provide the verified path. Route handlers and server-side work can add `withSpan` operations. Set `export const runtime = 'nodejs'` on the route that uses the helper. The [official Next.js instrumentation API](https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation) explains lifecycle and runtime behavior.

This integration covers local Node runtime traces. It does not claim Edge/browser tracing, production hosting compatibility, or automatic tracing of every server component/library. Send a real request and confirm the resulting service/span in Live mode.

## Common pitfalls

- **Wrong transport:** the `-otlp-http` exporter sends JSON; the `-otlp-proto` and `-otlp-grpc` exporters are unsupported.
- **No requests:** initializing a SDK alone does not create application activity.
- **Late initialization:** framework imports before tracing can bypass automatic patches.
- **Missing context:** each downstream service needs instrumentation and propagated context; spans from unrelated trace IDs do not create a parent link.
- **Export lag:** span processors batch. Use `await tracing.flush()` in a deterministic fixture or `shutdown()` during a clean exit.
- **Wrong mode:** spans with resource source `demo` appear under Demo. Normal application telemetry should use `live`.
- **Missing attributes:** TraceVerse drops SQL statements, arbitrary custom values, and sensitive headers by design. See [privacy](privacy.md).
