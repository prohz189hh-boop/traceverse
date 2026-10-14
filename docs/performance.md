# Performance measurements

TraceVerse v0.2.0 separates the dashboard entry module from the lazily loaded Three.js scene, bounds browser histories/node counts, and provides low, balanced, and high graphics presets. Paused, idle, or reduced-motion scenes can settle; camera, selection, and new data request renders. Balanced is the default. Optional particles can be reduced, and 2D avoids the WebGL scene.

These changes reduce unnecessary work. They do not establish a frame-rate guarantee on every browser, laptop, or graph size.

## Reproduce a measurement

Install dependencies and Chromium, build the public demo, and start its preview:

```sh
npm ci
npx playwright install chromium
npm run build:demo
npm run preview:demo
```

In another terminal:

```sh
npm run benchmark
```

The harness measures the public preview at `http://127.0.0.1:4173/traceverse/`. Its output is recorded in [performance.json](performance.json). Check the script and recorded metadata for the precise run conditions. Use the same build/browser/viewport when comparing a change, and stop other test/server runs that would distort the result.

## Interpret the result

## Recorded v0.2.0 run

Measured on Windows, Intel i7-1165G7, Chromium 156, 1536×960 viewport and device scale factor 1. SwiftShader **software** WebGL was explicitly selected; these are not measurements of the laptop's hardware GPU. The nine-node heavy scenario ran at intensity 1 and speed 1. Each quality used one fresh context and one five-second active sample.

| Preset   | Navigation to first 3D frame | Actual renders/second | Draw calls | Triangles | Settled pause, 3 seconds |
| -------- | ---------------------------: | --------------------: | ---------: | --------: | -----------------------: |
| Low      |                       2.47 s |                   3.5 |         25 |     3,462 |                 0 frames |
| Balanced |                       4.50 s |                  19.1 |         26 |     6,982 |                 0 frames |
| High     |                       3.99 s |                  18.3 |         26 |     6,982 |                 0 frames |

The first low sample had substantial stalls (animation-frame p95 1.8 seconds), so this short run cannot rank the presets or predict sustained hardware performance. All samples include initial scenario activity; shader compilation and scheduling can affect them. Balanced and high used the same drawing-buffer dimensions because device scale factor was 1. Neither result establishes 60 FPS.

The public entry module is 305,718 bytes; the separate lazy 3D module is 937,385 bytes (gzip 93,446 and 247,728 bytes with Node's default gzip settings). The v0.1.0 build placed about 1.23 MB in its initial JavaScript module. Splitting defers Three.js parsing/loading for non-3D views; opening 3D still loads the large scene module. The complete result and conditions are in [performance.json](performance.json).

Startup timing describes local navigation until the dashboard/3D scene becomes available on the measured machine. Local asset delivery does not measure a first visit to GitHub Pages over a slow network. Initial-module and lazy-chunk sizes describe build output; transferred compressed bytes and parse/compile cost are separate concerns.

`requestAnimationFrame` callback intervals describe browser scheduling cadence. They are not proof that the WebGL renderer produced that many frames. Actual render counters can show a scene settling while animation-frame callbacks continue. Compare active traffic/camera interaction against paused or reduced-motion idle behavior, and record graphics preset, resolution, renderer, and span/node counts.

Headless Chromium can use a software WebGL renderer. Such observations are useful for regression checks but do not represent a discrete GPU or a normal hardware-accelerated browser session. CPU contention, driver, refresh rate, browser backgrounding, viewport/device pixel ratio, and scenario intensity all affect the result.

## Scope and limits

The public synthetic graph is a small example. It does not benchmark thousands of services, continuous production traffic, or a shared monitoring backend. The collector and browser apply separate count/retention limits, so span statistics describe the retained evidence rather than total application throughput.

For an ordinary laptop, start with balanced. Try low graphics, fewer particles/nodes, reduced motion, or 2D if the scene is costly. A useful performance report includes a reproducible graph/scenario, actual measurements, device/browser/renderer details, and the improvement users can observe. Do not report “60 FPS” from requestAnimationFrame frequency alone.
