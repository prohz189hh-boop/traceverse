# Changelog

Changes use [Semantic Versioning](https://semver.org/). Before 1.0, minor releases may change APIs; patch releases aim to preserve them.

## 0.2.0 — 2026-10-14

Explore Your App in 3D.

### Added

- Free GitHub Pages demo with a separate static build, `/traceverse/` asset base, and hash routes.
- Nine-entity synthetic application graph and interactive successful sign-in, slow-database, API-failure, heavy-traffic, and recovery scenarios.
- Synthetic traffic intensity controls and browser-only session capture/replay with separate public-demo storage.
- Low, balanced, and high graphics presets, an expanded responsive control center, and refined 3D category shapes, links, highlights, labels, and selection.
- Static-browser checks for interaction, scenarios, deep links, mobile layout, synthetic imports, and collector isolation.
- Contributor starter guidance, public-demo documentation, and reproducible performance measurement instructions.

### Changed

- Load the Three.js visualization lazily instead of including it in the initial dashboard module.
- Reduce scene rendering when idle, paused, or reduced motion is enabled; retain bounded data and configurable graphics limits.
- Preserve the real local OpenTelemetry/Express/SQLite pipeline, live/demo/synthetic/replay modes, trace inspector, 2D graph, history, and exports.

### Scope

Public-demo telemetry is synthetic and remains in the browser; the static build does not host or contact the collector. Transport support remains OTLP/HTTP JSON traces only. Next.js support remains the local Node runtime/webpack development fixture. No large-cluster or cross-device frame-rate guarantee is made. See [release notes](docs/release-v0.2.0.md) and [PROGRESS.md](PROGRESS.md) for actual verification.

## 0.1.0 — 2026-10-14

Initial local-first release.

### Added

- React and Three.js service universe with selection, filtering, trace inspection, duration waterfall, and a 2D alternative.
- Local Fastify collector for OTLP/HTTP JSON traces, bounded WebSocket streaming, and SQLite history.
- Shared span normalization and graph generation from parent relationships and supported client/database spans.
- Official OpenTelemetry Node SDK helper and instrumented local example services.
- Separate Live, real Demo, Synthetic, and Replay modes; session import/export and configurable retention.
- Local graphics/accessibility preferences and privacy defaults.
- Unit/integration/browser test suites, cross-platform CI configuration, and MIT open-source project documentation.

### Scope

Trace transport is HTTP JSON only. Binary Protobuf, gRPC, metrics/logs, browser SDKs, authenticated remote deployment, and large-cluster performance guarantees are not included. Counts and latency are statistics over observed bounded spans, not complete request-level service metrics. The Next.js example's verification status is documented in the integration guide.
