# TraceVerse v0.1.0

See your app come alive in 3D.

The first public MIT-licensed release is a free, local-first OpenTelemetry trace explorer. Run `npm install` and `npm run demo` with Node.js 24 LTS, then open http://127.0.0.1:5173.

## Included

- Interactive 3D service universe, selectable dependencies, stable positions, camera controls, filters, and an accessible 2D view.
- Local Fastify collector accepting OTLP/HTTP JSON, SQLite history, validated safe attributes, bounded buffers, retention and deletion.
- Real five-service Express demo with actual HTTP calls, propagated trace context, SQLite queries, deterministic success/slow/failure/recovery scenarios.
- Live, instrumented Demo, explicitly Synthetic and historical Replay modes.
- Service/trace inspection, span waterfall, errors, latency rankings, sanitized reports, session import/export and replay.
- Official Node HTTP/Express instrumentation helpers; tested Fastify and Next.js Node runtime examples.
- Local preferences, reduced motion, quality controls, documentation, contribution/security policies and CI.

## Verification

On Windows: 31 unit/integration tests and all 6 Chromium end-to-end tests passed; strict TypeScript, ESLint, formatting, production build and production startup/ingestion checks passed. A genuine Next.js checkout/database trace reached the collector. Dependency audit reported zero vulnerabilities; locked dependency licenses and credential scan were reviewed.

GitHub Actions also passed checks on Windows, Linux and macOS, and Chromium/Next.js integration on Linux: https://github.com/prohz189hh-boop/traceverse/actions/runs/38527920235.

Screenshots and the attached WebM recording are captured from the actual running application with demo-labeled telemetry.

## Boundaries

OTLP/HTTP JSON traces only: no binary Protobuf, gRPC, metrics or logs. Browser instrumentation and remote authenticated deployments are not included. Next.js verification covers Node runtime with webpack development mode, not Edge/serverless or production Next.js builds. Large-cluster rendering is not benchmarked; Three.js ships in the initial JavaScript bundle. Counts and latency statistics refer to bounded received spans, not request throughput or service uptime.

Next priorities are binary OTLP support, measured graphics budgets and improved graph layouts, and broader framework fixtures.
