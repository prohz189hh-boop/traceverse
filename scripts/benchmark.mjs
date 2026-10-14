import { chromium } from '@playwright/test';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { platform, release, cpus } from 'node:os';

const url = 'http://127.0.0.1:4173/traceverse/';
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const results = [];
try {
  for (const quality of ['low', 'balanced', 'high']) {
    const context = await browser.newContext({
      viewport: { width: 1536, height: 960 },
      deviceScaleFactor: 1,
    });
    await context.addInitScript(
      (quality) =>
        localStorage.setItem(
          'traceverse-public-preferences-v2',
          JSON.stringify({ state: { settings: { quality } }, version: 0 }),
        ),
      quality,
    );
    const page = await context.newPage();
    const started = performance.now();
    await page.goto(url);
    await page.locator('.universe-scene[data-renderer="3d"][data-ready="true"]').waitFor();
    const startupMs = performance.now() - started;
    await page.getByLabel('Dismiss tutorial').click();
    await page.getByLabel('Scenario', { exact: true }).selectOption('heavy');
    const sample = await page.evaluate(async () => {
      const root = document.querySelector('.universe-scene');
      const frameCount = () => Number(root.getAttribute('data-frame-count'));
      const initialFrames = frameCount(),
        start = performance.now();
      const intervals = [];
      let previous = start;
      await new Promise((resolve) => {
        function tick(now) {
          intervals.push(now - previous);
          previous = now;
          if (now - start >= 5000) resolve();
          else requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      });
      const elapsedMs = performance.now() - start;
      const canvas = root.querySelector('canvas'),
        gl = canvas.getContext('webgl2');
      const debug = gl?.getExtension('WEBGL_debug_renderer_info');
      const sorted = intervals.slice(1).sort((a, b) => a - b);
      return {
        elapsedMs,
        renderedFrames: frameCount() - initialFrames,
        renderFps: ((frameCount() - initialFrames) * 1000) / elapsedMs,
        rafMedianMs: sorted[Math.floor(sorted.length / 2)],
        rafP95Ms: sorted[Math.floor(sorted.length * 0.95)],
        renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : 'unavailable',
        drawCalls: Number(root.getAttribute('data-draw-calls')),
        triangles: Number(root.getAttribute('data-triangles')),
        particleLimit: Number(root.getAttribute('data-particle-limit')),
        nodes: Number(root.getAttribute('data-visible-nodes')),
        drawingBuffer: [canvas.width, canvas.height],
      };
    });
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await page.waitForTimeout(1500);
    const pausedFrames = await page.evaluate(async () => {
      const root = document.querySelector('.universe-scene');
      const before = Number(root.getAttribute('data-frame-count'));
      await new Promise((resolve) => setTimeout(resolve, 3000));
      return Number(root.getAttribute('data-frame-count')) - before;
    });
    const result = { quality, startupMs, ...sample, pausedFramesOver3Seconds: pausedFrames };
    results.push(result);
    console.log(
      `${quality}: startup ${startupMs.toFixed(0)} ms; actual renders ${sample.renderFps.toFixed(1)}/s; paused ${pausedFrames} frames/3s`,
    );
    await context.close();
  }
  const chunks = readdirSync('apps/web/dist-public/assets')
    .filter((name) => name.endsWith('.js'))
    .map((name) => {
      const bytes = readFileSync(`apps/web/dist-public/assets/${name}`);
      return { name, bytes: bytes.length, gzipBytes: gzipSync(bytes).length };
    });
  const record = {
    measuredAt: new Date().toISOString(),
    version: '0.2.0',
    environment: {
      os: `${platform()} ${release()}`,
      cpu: cpus()[0]?.model,
      browser: browser.version(),
      viewport: [1536, 960],
      deviceScaleFactor: 1,
      acceleration: 'SwiftShader software WebGL explicitly selected',
    },
    conditions:
      'One fresh browser context per quality; local production static preview; heavy scenario at intensity 1 and speed 1; 5-second active samples and 3-second settled pause samples. No concurrent tests. Startup includes lazy 3D load. These results are not hardware GPU or remote network benchmarks.',
    chunks,
    results,
  };
  writeFileSync('docs/performance.json', JSON.stringify(record, null, 2) + '\n');
} finally {
  await browser.close();
}
