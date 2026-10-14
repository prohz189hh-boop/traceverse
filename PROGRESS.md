# TraceVerse progress

Status: MIT-licensed v0.2.0 published; public synthetic-only demo deployed and verified.

## v0.2.0 completed — 2026-10-14

- Resumed existing `main` from `09f36d0`. Preserved and reviewed interrupted dashboard, renderer, documentation, and build changes; no restart or new repository.
- Implemented separate `/traceverse/` public static build, hash navigation, synthetic-only source/import/replay boundaries, separate browser storage, and no collector transport. Five interactive scenarios cover nine entities, with bounded traffic, speed, pause, and replay controls.
- Renderer now has reusable resources, indexed observations, stable category layouts, capped instanced particles, camera controls, readable projected labels, low/balanced/high presets, reduced motion, demand rendering, and 2D fallback. Three.js is lazy loaded.
- Fixed nanosecond duration precision and unsafe numeric OTLP timestamps. Collector WebSocket frames are validated/sanitized before graph processing.
- `npm run check` passed: TypeScript, ESLint, formatting, 51 unit/integration tests, and local production build. Static build passed. Production smoke passed with built dashboard/assets and real ingestion. Official Node HTTP/Express/Fastify fixtures passed; separate Next.js checkout trace passed.
- Six static Chromium tests passed: 3D/inspector/camera, all scenarios, 2D/keyboard/settings, replay/synthetic-only import, hash refresh/assets/notices, mobile/offline. Actual screenshots and `docs/assets/demo-v0.2.webm` captured.
- Final isolated browser verification passed: all six local tests (54.4 seconds) and all six static tests (1.7 minutes). Earlier text assertion failures were corrected; a camera-click timeout under concurrent verification did not recur in the isolated run.
- License audit reviewed 550 locked dependencies with no unresolved expressions; zero npm audit vulnerabilities. Browser builds retain 61 full upstream notices and checked-in source texts. Credential-pattern scan found no matches.
- GitHub Pages enabled with `build_type=workflow` and HTTPS. Workflow builds/tests only the static synthetic output before deployment; no collector or real telemetry is published.
- Benchmark completed: Windows/i7-1165G7, Chromium 156, explicitly selected SwiftShader software WebGL, five-second heavy-scenario samples. Balanced 19.1 actual renders/second; navigation to first 3D frame 2.47–4.50 seconds across presets; all presets settled to zero rendered frames over a three-second pause sample. Low had substantial initial stalls, so the sample cannot rank presets or predict hardware GPU performance. Full measurements: `docs/performance.json`.
- Implementation `0b33c9f`, verification `8b466e6`, mobile fallback-font correction `62701ae`, and CI refinement `aff6c45` pushed to the existing repository. All four final CI jobs passed (Windows, Linux, macOS 15 Intel, Linux Chromium/Next.js): https://github.com/prohz189hh-boop/traceverse/actions/runs/38587481151. After an unassigned ARM macOS job delayed verification, CI moved to GitHub's documented free standard Intel pool with the same checks. ARM macOS is not claimed as v0.2.0 verification.
- Final Pages build/deployment succeeded: https://github.com/prohz189hh-boop/traceverse/actions/runs/38587481264. https://prohz189hh-boop.github.io/traceverse/ returns HTTPS 200 with the correct asset base. All six static browser tests passed against the deployed implementation (1.9 minutes), covering scenarios, camera/inspector, 2D/keyboard, synthetic-only replay imports, hash refresh/assets, mobile/offline, and no collector API/WebSocket traffic. Desktop and mobile checks passed again after the final deployment (16.8 seconds).
- Release published at https://github.com/prohz189hh-boop/traceverse/releases/tag/v0.2.0 with title **TraceVerse v0.2.0 — Explore Your App in 3D**. Tag and release target verified as `aff6c4575bc3b42db293dced9286ff81591da736`.
- Actual video attached: https://github.com/prohz189hh-boop/traceverse/releases/download/v0.2.0/demo-v0.2.webm. Valid WebM/VP9, 1440×900, 10.8 seconds; uploaded size 2,615,322 bytes and SHA-256 `c3baad4be686b8c723f0f0019816bba1a183af5d31f63ae1d58d25b5c334dd7b` match the local file. Repository homepage points to the verified demo.
- No release blocker remains. This completion record is a documentation-only follow-up to the tested/tagged release. Local verification servers have stopped. Limits: OTLP/HTTP JSON traces only; local Node-runtime/webpack Next.js fixture; short software-WebGL performance samples; no hardware GPU/large-cluster frame-rate guarantee. Future roadmap remains optional.

## v0.1.0 verified release history

## Current status

- Environment verified on Windows: Node 24.20.0, npm 11.19.0, Git 2.55.
- GitHub authentication verified. Destination: prohz189hh-boop; traceverse available.
- Implemented: shared core, OTLP/HTTP JSON collector, persisted SQLite history, SDK, real five-service Express demo, React dashboard with 3D/2D, inspector, error/performance views, session replay and exports.
- Dependency peer compatibility checked against npm registry and official R3F/OpenTelemetry documentation.
- Tests: 31 unit/integration tests passed on Windows, including real automatic Node HTTP, Express, Fastify and distributed Express telemetry. Next.js 16.4.0 webpack dev checkout trace reached the collector. Typecheck, ESLint and production build passed.
- Browser tests: all 6 Chromium end-to-end tests passed in one final run (1.4 minutes), including real telemetry, 3D rendering, camera reset, full-trace inspection, error report export, session replay/import/export, local settings, 2D keyboard access, offline synthetic mode, and mobile layout.
- Visual verification: actual screenshots and demo.webm browser recording saved in docs/assets. Nested DOM label roots were replaced with one overlay; camera reset and stale socket callbacks fixed.
- Production smoke test: built collector served the dashboard, JavaScript assets and normalized ingestion successfully.
- License audit: 550 locked dependencies reviewed; notices include separately licensed build tools and optional Next.js libraries. npm audit: zero vulnerabilities.
- Publication complete: public source verified at https://github.com/prohz189hh-boop/traceverse; MIT recognized and all requested topics set. v0.1.0 published at https://github.com/prohz189hh-boop/traceverse/releases/tag/v0.1.0, targeting commit 4570b9b. The demo recording is attached and its uploaded asset was verified.
- CI: all four jobs passed for release commit 4570b9b (Windows, Linux, macOS check/build/license audit; Linux Chromium and Next.js): https://github.com/prohz189hh-boop/traceverse/actions/runs/38528374894.
- README verified in a real browser: logo and both screenshots loaded successfully. Source and release are accessible without authentication. Local servers used for verification have stopped.
- Remaining limitations: OTLP HTTP JSON only, no metrics/logs/browser SDK, Next.js verification covers Node runtime and webpack development, no large-cluster GPU benchmark. Three.js is in the initial ~1.23 MB JavaScript bundle. Browser saved sessions are separate from collector retention.
- Git status: source committed on main, synchronized to origin. Release source is tagged v0.1.0; this completion record is a documentation-only follow-up.
- Next actions (optional roadmap): binary OTLP ingestion, measured rendering budgets and improved graph layout, expanded integration fixtures. No release blocker remains.

This file is updated at release checkpoints. Runtime data and credentials must never be committed.
