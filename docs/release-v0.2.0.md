# TraceVerse v0.2.0 — Explore Your App in 3D

**See your app come alive in 3D.**

[Try the free interactive demo](https://prohz189hh-boop.github.io/traceverse/) · [Source repository](https://github.com/prohz189hh-boop/traceverse)

This upgrade adds a browser-ready synthetic service universe while preserving the real local OpenTelemetry application. No account, API key, paid service, or cloud database is needed.

## Included

- Separate static GitHub Pages build under `/traceverse/`, with shareable hash routes and no collector API/WebSocket connection.
- Nine-entity synthetic graph, successful sign-in, slow database, API failure, adjustable heavy traffic, and recovery scenarios. Every relationship is supported by bundled span data.
- Refined 3D shapes, flowing links, activity pulses, latency/error highlights, selection, labels, and camera interaction; accessible 2D and HTML controls.
- Responsive Universe, Services, Traces, Errors, Performance, Sessions, and Documentation views.
- Low/balanced/high graphics, balanced default, reduced motion, lazy 3D loading, bounded histories, and rendering that settles when idle.
- Separate public browser sessions/preferences, synthetic-only public replay imports, and preserved real local session/history/export tools.
- Contributor starter guidance, updated architecture/privacy/instrumentation documentation, browser dependency notices, and static-demo browser coverage.

## Run the real local application

With Node.js 24 LTS installed:

```sh
git clone https://github.com/prohz189hh-boop/traceverse.git
cd traceverse
npm install
npm run demo
```

Open http://127.0.0.1:5173. Local Demo runs five actual instrumented Express services with HTTP calls and SQLite queries. Use `npm run dev` and Live mode for your application. The public demo instead uses explicitly synthetic browser data and cannot receive real telemetry.

## Verification record

TypeScript, ESLint, formatting, 51 unit/integration tests, local production build, static build, all six local Chromium tests, and all six static Chromium tests passed on Windows. Real Node HTTP, Express, Fastify, distributed Express/SQLite, separate Next.js checkout ingestion, and built collector/dashboard smoke checks passed. Dependency audit found zero vulnerabilities; 550 locked licenses were reviewed and browser notices retained. A credential-pattern scan found no matches.

The benchmark used explicit SwiftShader software WebGL: balanced rendered 19.1 frames/second during its short heavy-scenario sample and zero frames during a settled three-second pause. These measurements do not predict hardware GPU or remote network performance. [performance.json](performance.json) contains the actual observations; [the performance guide](performance.md) explains the conditions and substantial variance.

[PROGRESS.md](../PROGRESS.md) records CI, deployment, and remote verification. [Watch the actual demonstration](https://github.com/prohz189hh-boop/traceverse/releases/download/v0.2.0/demo-v0.2.webm).

## Boundaries

OTLP/HTTP JSON traces only: no binary Protobuf, gRPC, metrics, logs, or browser SDK. Next.js integration covers local Node runtime with webpack development; Edge/serverless deployment and production Next.js builds are outside that verification. Large-cluster rendering and universal frame rates are not guaranteed. Counts, errors, and percentiles describe bounded observed spans, not complete request rates or service uptime.

TraceVerse's original code remains [MIT licensed](../LICENSE); third-party browser dependency notices are preserved. Next priorities include binary OTLP, measured larger-graph layouts, richer trace queries, and additional framework fixtures.
