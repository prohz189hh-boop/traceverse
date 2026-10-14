# Contributing to TraceVerse

Thank you for helping make local observability easier to explore. Small fixes, reproducible bug reports, integration fixtures, documentation, accessibility work, and performance measurements are all useful contributions.

## Development setup

Use Node.js 24 LTS, npm, and Git on Windows, Linux, or macOS.

```sh
git clone https://github.com/prohz189hh-boop/traceverse.git
cd traceverse
npm ci
npm run demo
```

Open http://127.0.0.1:5173. Use `npm run dev` when you need only the dashboard and collector. Keep credentials and private telemetry out of fixtures, screenshots, issue attachments, and commits.

The repository uses npm workspaces, strict TypeScript, ESLint, Prettier, Vitest, and Playwright. Keep changes in the workspace that owns the behavior. Shared span and graph behavior belongs in `packages/core`; wire formats and storage belong in `apps/collector`; the UI belongs in `apps/web` and `packages/visualization`.

## Before opening a pull request

1. Explain the user-visible problem and how your change solves it.
2. Add or update meaningful tests for behavior changes. Prefer tiny deterministic spans over private telemetry dumps.
3. Update documentation when commands, supported integrations, API formats, defaults, or limits change.
4. Run the relevant checks and describe exactly which ones ran.

```sh
npm run check
npx playwright install chromium
npm run test:e2e
```

Run `npm run test:next` for Next.js SDK or example changes. Browser tests launch the demo themselves; stop a separately running demo first if the configured ports conflict. Unit/integration tests cover normalization, graph relationships, ingestion, storage, and streaming. End-to-end tests cover the application in Chromium and exercise real demo telemetry. Passing a test on one machine does not establish performance or compatibility on every device.

Keep pull requests focused. Descriptive commits such as `fix: preserve cross-service parent links` make review and release notes easier. Include actual UI screenshots for visual changes and report any manual accessibility checks. Do not fabricate traces or statistics to make the dashboard look healthier.

## Compatibility and privacy

The supported trace transport is OTLP/HTTP JSON. Avoid quietly expanding claims to Protobuf, gRPC, metrics, logs, or untested frameworks. Integration examples must initialize tracing before framework imports and include a real request that reaches the collector.

Preserve loopback binding, Host/origin validation, payload and storage limits, safe attribute filtering, and the distinction between live, demo, synthetic, and replay data. Changes to these controls need explicit tests and corresponding privacy documentation.

Dependency changes should have a clear purpose, use maintained compatible versions, retain a reproducible lockfile, and be checked for license compatibility. React Three Fiber 9 pairs with React 19; do not independently upgrade one side without testing the pair. See [architecture](docs/architecture.md) for upstream references.

## Issues and conduct

Search existing issues before opening a new one. Include OS, Node version, the exact command, expected/actual behavior, and a sanitized reproduction. Never post credentials or raw production traces. Use [the security policy](SECURITY.md) for vulnerabilities rather than a public issue.

Follow [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Contributions are provided under the repository's MIT license.
