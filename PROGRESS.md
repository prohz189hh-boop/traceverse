# TraceVerse progress

Target: a tested MIT-licensed v0.2.0 upgrade and public synthetic-only GitHub Pages demo.

## v0.2.0 resume checkpoint — 2026-10-14

- Resumed existing `main` from `09f36d0`. Preserved and reviewed interrupted dashboard, renderer, documentation, and build changes; no restart or new repository.
- Implemented separate `/traceverse/` public static build, hash navigation, synthetic-only source/import/replay boundaries, separate browser storage, and no collector transport. Five interactive scenarios cover nine entities, with bounded traffic, speed, pause, and replay controls.
- Renderer now has reusable resources, indexed observations, stable category layouts, capped instanced particles, camera controls, readable projected labels, low/balanced/high presets, reduced motion, demand rendering, and 2D fallback. Three.js is lazy loaded.
- Fixed nanosecond duration precision and unsafe numeric OTLP timestamps. Collector WebSocket frames are validated/sanitized before graph processing.
- `npm run check` passed: TypeScript, ESLint, formatting, 51 unit/integration tests, and local production build. Static build passed. Production smoke passed with built dashboard/assets and real ingestion. Official Node HTTP/Express/Fastify fixtures passed; separate Next.js checkout trace passed.
- Six static Chromium tests passed: 3D/inspector/camera, all scenarios, 2D/keyboard/settings, replay/synthetic-only import, hash refresh/assets/notices, mobile/offline. Actual screenshots and `docs/assets/demo-v0.2.webm` captured.
- Final isolated browser verification passed: all six local tests (54.4 seconds) and all six static tests (1.7 minutes). Earlier text assertion failures were corrected; a camera-click timeout under concurrent verification did not recur in the isolated run.
- License audit reviewed 550 locked dependencies with no unresolved expressions; zero npm audit vulnerabilities. Browser builds retain 61 full upstream notices and checked-in source texts. Credential-pattern scan found no matches.
- GitHub Pages setting successfully enabled with `build_type=workflow` and HTTPS. Workflow builds/tests public output before deployment. No public deployment or v0.2.0 release is claimed yet.
- Benchmark completed: Windows/i7-1165G7, Chromium 156, explicitly selected SwiftShader software WebGL, five-second heavy-scenario samples. Balanced 19.1 actual renders/second; navigation to first 3D frame 2.47–4.50 seconds across presets; all presets settled to zero rendered frames over a three-second pause sample. Low had substantial initial stalls, so the sample cannot rank presets or predict hardware GPU performance. Full measurements: `docs/performance.json`.
- Implementation milestone `0b33c9f` and verification checkpoint `8b466e6` pushed to the existing repository. Initial Pages build/deployment succeeded at https://github.com/prohz189hh-boop/traceverse/actions/runs/38584569441. Windows/Linux checks passed; CI found mobile header overflow with Linux's wider font fallback. Reduced mobile header padding and bounded its source selector; verification is in progress. Remaining: green cross-platform CI for the correction; verify deployed URL; publish tagged release and actual video; record completion.

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
