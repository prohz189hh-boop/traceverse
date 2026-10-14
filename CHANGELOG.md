# Changelog

Changes use [Semantic Versioning](https://semver.org/). Before 1.0, minor releases may change APIs; patch releases aim to preserve them.

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
