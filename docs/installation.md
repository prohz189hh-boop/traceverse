# Installation and operation

For an immediate browser preview, open **[the public demo](https://prohz189hh-boop.github.io/traceverse/)**. It needs no installation and uses clearly labeled synthetic telemetry. The setup below runs the real local collector/application.

## Requirements

- Node.js **24 LTS** with npm. The application uses Node's built-in SQLite API; older Node releases are not the documented runtime.
- Git for cloning the source.
- A current browser. The 3D scene requires WebGL; use the HTML/2D view when graphics are unavailable or expensive.
- Available loopback ports: 4318 (collector), 5173 (Vite), and 4600–4604 (real demo). The optional Next.js example uses 4700.

Windows is the primary development environment. Linux and macOS are CI targets. The v0.1.0 release passed checks on all three platforms; each v0.2.0 result must be checked separately in [PROGRESS.md](../PROGRESS.md) and GitHub Actions.

## First run

Run these commands in PowerShell, Command Prompt, or a POSIX shell:

```sh
git clone https://github.com/prohz189hh-boop/traceverse.git
cd traceverse
npm install
npm run demo
```

Open http://127.0.0.1:5173. The process supervisor starts the collector, waits for its health endpoint, starts the local instrumented services, and starts Vite with a strict port. Keep the terminal open. `Ctrl+C` shuts down the child processes started by the supervisor.

Demo mode displays spans from real HTTP requests made by the local example services. Visit http://127.0.0.1:4600 to exercise the sample frontend, or use its documented scenario controls. Synthetic mode uses generated data in the dashboard and is explicitly labeled.

Initial dependency installation needs internet access. After installation, no cloud account, Docker daemon, separate database server, or internet connection is required to run the application. Dependencies use the repository lockfile; use `npm ci` for a reproducible clean install once the lockfile is present.

## Monitor your application

```sh
npm run dev
```

This starts only the dashboard and collector. Choose **Live** in the dashboard, then follow [instrumentation](instrumentation.md) to export your app's traces to `http://127.0.0.1:4318/v1/traces` using OTLP/HTTP JSON.

## Production build

```sh
npm run build
npm start
```

Open http://127.0.0.1:4318. The built collector serves the built dashboard and API from that port. `npm start` does not start the demo services or the optional Next.js example. The production build stays a local application with the same local trust boundary; it does not add network authentication.

## Persistence and settings

The collector creates `.traceverse/history.sqlite` under the repository's working directory, with SQLite WAL companion files as needed. Generated databases are ignored by Git. The default limits are 10,000 spans and 60 minutes measured from local receipt time. Imports preserve original timestamps but begin a new local retention period.

Collector retention/count settings can be changed through the dashboard's **Apply collector settings** button or `PATCH /api/settings`. In v0.2.0 those collector settings apply to the running collector and return to defaults when it restarts. Browser preferences and up to six saved sessions persist independently in local storage. Use **Clear collector telemetry** for collector history and individual session deletion for browser copies; exported files remain on disk until you remove them.

The public demo has no collector retention. It stores its synthetic sessions/preferences in a separate browser namespace. Deleting real local collector history does not delete public-demo sessions. Both builds default to balanced graphics; low graphics, reduced motion, and 2D reduce rendering cost.

See [privacy](privacy.md) and [the API](api.md) for limits and data handling.

## Public static build

```sh
npm run build:demo
npm run preview:demo
```

Open **http://127.0.0.1:4173/traceverse/**. `build:demo` writes `apps/web/dist-public` using the `/traceverse/` Vite base and the public-demo build flag. `preview:demo` serves that static output with a strict loopback port. This starts no collector, SDK, SQLite, or example services; the UI permits only Synthetic and synthetic-session Replay.

Routes use fragments, for example `/traceverse/#/traces` and `/traceverse/#/errors`. Keep `/traceverse/` in preview/deployment URLs so static assets load correctly. The GitHub Pages deployment workflow builds and uploads only this public output. [The public demo guide](public-demo.md) explains controls, browser storage, and the privacy boundary.

## Commands

| Command                  | Purpose                                                              |
| ------------------------ | -------------------------------------------------------------------- |
| `npm run demo`           | Dashboard, collector, and real local example services                |
| `npm run dev`            | Dashboard and collector only                                         |
| `npm run build`          | Production dashboard and collector bundles                           |
| `npm start`              | Built collector/dashboard on 4318                                    |
| `npm run build:demo`     | Separate synthetic-only static bundle in `apps/web/dist-public`      |
| `npm run preview:demo`   | Preview the public build on 4173 under `/traceverse/`                |
| `npm run typecheck`      | Strict TypeScript checking                                           |
| `npm run lint`           | ESLint                                                               |
| `npm test`               | Vitest unit/integration tests                                        |
| `npm run check`          | Type checking, lint, formatting, tests, and production build         |
| `npm run test:e2e`       | Chromium browser tests, with automatic demo startup                  |
| `npm run test:static`    | Public static build, scenarios, routes, mobile, and isolation checks |
| `npm run test:next`      | Optional Next.js integration test                                    |
| `npm run benchmark`      | Record static-preview startup and rendering observations             |
| `npm run audit:licenses` | Generate the installed dependency license inventory                  |
| `npm run format`         | Format repository files with Prettier                                |
| `npm run format:check`   | Check formatting without writing files                               |

Before browser tests, run `npx playwright install chromium`. On Linux CI, `npx playwright install --with-deps chromium` also installs system dependencies.

## Windows troubleshooting

**`node` or `npm` is not recognized.** Install Node.js 24 LTS using the official installer, then open a new terminal. Check `node --version` and `npm --version`.

**PowerShell blocks `npm.ps1`.** Use `npm.cmd install` and `npm.cmd run demo`, or use Command Prompt. Changing the machine's execution policy is not required.

**`node:sqlite` is unavailable.** Confirm the terminal is using Node 24 rather than an older installation. Node may print an experimental SQLite warning depending on the installed patch version; an actual startup exception needs investigation.

**A port is already in use.** Stop another TraceVerse terminal or the application that owns the port. The supervisor uses fixed documented ports and fails instead of silently opening the UI on a different one. Do not terminate unrelated processes just to free a port.

**The dashboard says offline.** Open http://127.0.0.1:4318/health. Keep the startup terminal open and inspect its error. Use the default collector URL in dashboard settings and a permitted loopback origin. Vite runs on 5173; production runs on 4318.

**The public demo cannot connect to my app.** This is intentional: the static build accepts synthetic data only. Run `npm run dev` and choose Live to use your application telemetry. Do not point an exporter at the GitHub Pages URL.

**Static preview has missing assets or a blank page.** Build with `npm run build:demo`, start `npm run preview:demo`, and open the complete `http://127.0.0.1:4173/traceverse/` URL. Use a `#/traces` fragment for deep links rather than `/traceverse/traces`.

**Live mode is empty.** Send an actual request to the instrumented application, allow time for batched export, and verify you used the JSON HTTP exporter rather than the binary/gRPC exporter. Check that tracing starts before framework imports and that source is `live` rather than `demo`.

**Some dependencies or parents are missing.** Parent-child links require spans from the same trace and propagated trace context. Sampling, missing instrumentation, retention, and browser limits can produce incomplete graphs. TraceVerse does not invent missing relationships.

**The 3D scene is slow or blank.** Try low quality, fewer particles/nodes, reduced motion, and 2D view. Check browser WebGL support and the graphics driver. A working HTML inspector does not guarantee hardware WebGL support.

**Playwright cannot find Chromium.** Run `npx playwright install chromium`, then rerun `npm run test:e2e`. Stop any separate demo using the test ports first.
