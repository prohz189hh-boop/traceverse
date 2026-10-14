# Contributing to TraceVerse

TraceVerse welcomes small fixes, reproducible bug reports, integration fixtures, documentation, accessibility work, and performance measurements. Start with [the architecture](docs/architecture.md) and [starter contribution ideas](docs/good-first-issues.md); you do not need to understand the entire repository to make a useful change.

## Development setup

Use Node.js 24 LTS, npm, and Git on Windows, Linux, or macOS.

```sh
git clone https://github.com/prohz189hh-boop/traceverse.git
cd traceverse
npm ci
npm run demo
```

Open http://127.0.0.1:5173. Use `npm run dev` when you need only the dashboard and collector. Keep credentials and private telemetry out of fixtures, screenshots, issue attachments, and commits.

For public-demo work, use the separate static build:

```sh
npm run build:demo
npm run preview:demo
```

Open http://127.0.0.1:4173/traceverse/. Verify routes and assets under that repository path, not only at `/`. This build uses bundled synthetic spans; it must never connect to a collector or accept a session containing real telemetry. See [the demo guide](docs/public-demo.md).

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
npm run test:static
```

Run `npm run test:next` for Next.js SDK or example changes. Local browser tests launch the real demo; static tests build and preview the public bundle. Stop separately running servers if their ports conflict. Unit/integration tests cover normalization, graph relationships, ingestion, storage, streaming, and synthetic provenance. Passing a test on one machine does not establish performance or compatibility on every device.

Use focused checks while iterating: `npx vitest run tests/core.test.ts` for graph/model changes, `npm run test:static` for the public experience, and `npm run test:e2e` for the local flow. Run `npm run format:check` before submitting. For rendering changes, use [the measurement harness](docs/performance.md), report the browser/renderer/viewport and test conditions, and distinguish requestAnimationFrame cadence from rendered-frame counts.

Keep pull requests focused. Descriptive commits such as `fix: preserve cross-service parent links` make review and release notes easier. Include actual UI screenshots for visual changes and report any manual accessibility checks. Do not fabricate traces or statistics to make the dashboard look healthier.

## Compatibility and privacy

The supported trace transport is OTLP/HTTP JSON. Avoid quietly expanding claims to Protobuf, gRPC, metrics, logs, or untested frameworks. Integration examples must initialize tracing before framework imports and include a real request that reaches the collector.

Preserve loopback binding, Host/origin validation, payload and storage limits, safe attribute filtering, and the distinction between live, real demo, synthetic, and replay data. Preserve the public build's separate browser storage, collector isolation, and synthetic-only imports. Changes to these controls need explicit tests and corresponding privacy documentation.

Dependency changes should have a clear purpose, use maintained compatible versions, retain a reproducible lockfile, and be checked for license compatibility. React Three Fiber 9 pairs with React 19; do not independently upgrade one side without testing the pair. See [architecture](docs/architecture.md) for upstream references.

The public build redistributes compiled browser dependencies. Run `npm run audit:licenses`, retain upstream licenses, and update generated browser notices when its dependency closure changes. Do not add a cloud account, paid API, key requirement, or hosted database to the public demo.

## Issues and conduct

Search existing issues before opening a new one. Include OS, Node version, the exact command, expected/actual behavior, and a sanitized reproduction. Never post credentials or raw production traces. Use [the security policy](SECURITY.md) for vulnerabilities rather than a public issue.

Follow [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Contributions are provided under the repository's MIT license.

For a first contribution, propose a small scope in an issue before making a broad redesign. Useful labels include `good first issue`, `help wanted`, `documentation`, `accessibility`, `performance`, and `telemetry`; the starter guide describes candidate tasks, not a claim that issues or contributors already exist. Maintainers can mark scoped tasks after checking that the work is still needed.
