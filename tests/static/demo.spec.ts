import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import type { Session } from '@traceverse/core';

async function openDemo(page: Page) {
  await page.goto('./');
  await expect(page.getByLabel('Data source')).toHaveValue('synthetic');
  await expect(page.locator('.universe-scene[data-renderer="3d"]')).toHaveAttribute(
    'data-ready',
    'true',
  );
  const dismiss = page.getByLabel('Dismiss tutorial');
  if (await dismiss.isVisible()) await dismiss.click();
}

test('public 3D graph, inspector, camera and trace evidence work without a backend', async ({
  page,
  baseURL,
}) => {
  const errors: string[] = [],
    requests: string[] = [],
    sockets: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('request', (request) => requests.push(request.url()));
  page.on('websocket', (socket) => sockets.push(socket.url()));
  await openDemo(page);
  await expect(page.locator('.universe-labels .node-label')).toHaveCount(9);
  await expect(page.locator('.connection')).toContainText('Synthetic');
  await page.getByRole('button', { name: 'frontend', exact: true }).click();
  await expect(
    page.getByTestId('inspector').getByRole('heading', { name: 'frontend', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Focus', exact: true }).click();
  for (const name of ['Zoom in', 'Zoom out', 'Rotate left', 'Rotate right', 'Reset camera'])
    await page.getByLabel(name, { exact: true }).click();
  await expect
    .poll(() =>
      page
        .locator('.node-label')
        .evaluateAll(
          (labels) =>
            labels.filter((label) => (label as HTMLElement).style.visibility === 'visible').length,
        ),
    )
    .toBeGreaterThanOrEqual(7);
  if (process.env.TRACEVERSE_CAPTURE === '1') {
    mkdirSync('docs/assets', { recursive: true });
    await page.screenshot({ path: 'docs/assets/universe-v0.2.png', fullPage: true });
  }
  await page.getByLabel('Scenario', { exact: true }).selectOption('slow');
  await expect(page.getByTestId('inspector')).toContainText('900 ms');
  await page.getByRole('button', { name: 'Inspect scenario trace', exact: true }).click();
  await expect(page.locator('.waterfall-item').first()).toBeVisible();
  if (process.env.TRACEVERSE_CAPTURE === '1')
    await page.screenshot({ path: 'docs/assets/trace-inspector-v0.2.png', fullPage: true });
  const origin = new URL(baseURL!).origin;
  expect(
    requests.filter(
      (url) =>
        !url.startsWith(origin + '/traceverse/') &&
        !url.startsWith('blob:') &&
        !url.startsWith('data:'),
    ),
  ).toEqual([]);
  expect(requests.some((url) => /\/api\/|\/v1\/traces|localhost|:4318/.test(url))).toBe(false);
  expect(sockets).toEqual([]);
  expect(errors).toEqual([]);
  if (process.env.TRACEVERSE_CAPTURE === '1' && page.video()) {
    const video = page.video()!;
    await page.close();
    await video.saveAs('docs/assets/demo-v0.2.webm');
  }
});

test('all scenarios show trace-supported errors, latency and recovery with bounded traffic', async ({
  page,
}) => {
  await openDemo(page);
  const scenario = page.getByLabel('Scenario', { exact: true });
  await scenario.selectOption('error');
  await expect(page.locator('.node-label[data-node-id="api-gateway"]')).toHaveAttribute(
    'data-status',
    'error',
  );
  await expect(page.getByTestId('inspector')).toContainText('API');
  await scenario.selectOption('recovery');
  await expect(page.locator('.node-label[data-node-id="api-gateway"]')).toHaveAttribute(
    'data-status',
    'healthy',
  );
  await expect(page.getByTestId('inspector')).toContainText('earlier');
  await scenario.selectOption('heavy');
  await page.getByLabel('Traffic intensity', { exact: true }).fill('6');
  await page.getByLabel('Playback speed', { exact: true }).selectOption('4');
  await page.getByRole('button', { name: 'Run scenario', exact: true }).click();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export session', exact: true }).click();
  const session = JSON.parse(readFileSync((await (await download).path())!, 'utf8')) as Session;
  expect(session.spans.length).toBeLessThanOrEqual(2400);
  expect(session.spans.length).toBeGreaterThan(40);
  expect(session.spans.every((span) => span.source === 'synthetic')).toBe(true);
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await scenario.selectOption('success');
  await expect(page.locator('.node-label[data-node-id="api-gateway"]')).toHaveAttribute(
    'data-status',
    'healthy',
  );
});

test('2D keyboard selection, filters, graphics and reduced-motion preferences work', async ({
  page,
}) => {
  await openDemo(page);
  await page.getByLabel('2D view', { exact: true }).click();
  await page.getByRole('button', { name: 'Select api-gateway', exact: true }).press('Enter');
  await expect(
    page.getByTestId('inspector').getByRole('heading', { name: 'api-gateway' }),
  ).toBeVisible();
  await page.keyboard.press('/');
  await expect(page.getByLabel('Search universe', { exact: true })).toBeFocused();
  await page.getByLabel('Search services', { exact: true }).fill('order');
  await expect(page.locator('.service-list .service-item')).toHaveCount(1);
  await page.getByLabel('Search services', { exact: true }).fill('');
  await page.getByLabel('Filter service type').selectOption('database');
  await expect(page.locator('.service-list .service-item')).toHaveCount(2);
  await page.getByLabel('Filter service type').selectOption('all');
  await page.getByLabel('3D view', { exact: true }).click();
  await page.getByLabel('Settings', { exact: true }).click();
  await page.getByLabel('Graphics quality').selectOption('low');
  await page.getByLabel('Reduced motion').check();
  await expect(page.getByLabel('Collector URL')).toHaveCount(0);
  await page.getByLabel('Close settings').click();
  await page.reload();
  await page.getByLabel('Settings', { exact: true }).click();
  await expect(page.getByLabel('Graphics quality')).toHaveValue('low');
  await expect(page.getByLabel('Reduced motion')).toBeChecked();
});

test('synthetic export/import/replay works and real telemetry is rejected', async ({ page }) => {
  await openDemo(page);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export session', exact: true }).click();
  const session = JSON.parse(readFileSync((await (await download).path())!, 'utf8')) as Session;
  const realSession = {
    ...session,
    spans: session.spans.map((span) => ({ ...span, source: 'live' })),
  };
  await page.getByLabel('Import session file').setInputFiles({
    name: 'live.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(realSession)),
  });
  await expect(page.getByRole('status')).toContainText('synthetic');
  await expect(page.getByLabel('Data source')).toHaveValue('synthetic');
  await page.getByLabel('Import session file').setInputFiles({
    name: 'synthetic.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(session)),
  });
  await expect(page.getByLabel('Data source')).toHaveValue('replay');
  await page.getByLabel('Replay position').fill('1000');
  await expect(page.getByRole('button', { name: 'frontend', exact: true })).toBeVisible();
  await page.getByLabel('Replay speed').selectOption('2');
  await page.getByLabel('Replay position').fill('0');
  await page.getByRole('button', { name: 'Play replay', exact: true }).click();
  await expect.poll(() => page.getByLabel('Replay position').inputValue()).not.toBe('0');
  await page.getByLabel('Data source').selectOption('synthetic');
  await page.getByRole('button', { name: 'Replay scenario', exact: true }).click();
  await expect(page.getByLabel('Data source')).toHaveValue('replay');
  expect(await page.getByLabel('Data source').locator('option').allTextContents()).toEqual([
    'Demo · Synthetic',
    'Replay',
  ]);
});

test('hash deep links and all navigation survive refreshing under the Pages base path', async ({
  page,
  request,
}) => {
  for (const route of [
    'services',
    'traces',
    'errors',
    'performance',
    'sessions',
    'docs',
    'universe',
  ]) {
    await page.goto(`./#/${route}`);
    await expect(page.locator('.app-shell')).toBeVisible();
    await page.reload();
    await expect(page).toHaveURL(new RegExp(`/traceverse/#/${route}$`));
  }
  expect((await request.get('./logo.svg')).ok()).toBe(true);
  const notices = await request.get('./third-party-notices.txt');
  expect(notices.ok()).toBe(true);
  expect(await notices.text()).toContain('Poimandres');
});

test('mobile touch layout and service inspection stay usable offline', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openDemo(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(
    true,
  );
  await page.getByLabel('Select a service').selectOption('api-gateway');
  await expect(
    page.getByTestId('inspector').getByRole('heading', { name: 'api-gateway' }),
  ).toBeVisible();
  await page.getByLabel('2D view', { exact: true }).click();
  await context.setOffline(true);
  await page.getByLabel('Scenario', { exact: true }).selectOption('slow');
  await expect(page.getByTestId('inspector')).toContainText('900 ms');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(
    true,
  );
});
