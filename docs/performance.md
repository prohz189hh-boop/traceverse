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

Startup timing describes local navigation until the dashboard/3D scene becomes available on the measured machine. Local asset delivery does not measure a first visit to GitHub Pages over a slow network. Initial-module and lazy-chunk sizes describe build output; transferred compressed bytes and parse/compile cost are separate concerns.

`requestAnimationFrame` callback intervals describe browser scheduling cadence. They are not proof that the WebGL renderer produced that many frames. Actual render counters can show a scene settling while animation-frame callbacks continue. Compare active traffic/camera interaction against paused or reduced-motion idle behavior, and record graphics preset, resolution, renderer, and span/node counts.

Headless Chromium can use a software WebGL renderer. Such observations are useful for regression checks but do not represent a discrete GPU or a normal hardware-accelerated browser session. CPU contention, driver, refresh rate, browser backgrounding, viewport/device pixel ratio, and scenario intensity all affect the result.

## Scope and limits

The public synthetic graph is a small example. It does not benchmark thousands of services, continuous production traffic, or a shared monitoring backend. The collector and browser apply separate count/retention limits, so span statistics describe the retained evidence rather than total application throughput.

For an ordinary laptop, start with balanced. Try low graphics, fewer particles/nodes, reduced motion, or 2D if the scene is costly. A useful performance report includes a reproducible graph/scenario, actual measurements, device/browser/renderer details, and the improvement users can observe. Do not report “60 FPS” from requestAnimationFrame frequency alone.
