import { test, expect } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import type { NormalizedSpan, Session } from '@traceverse/core';

const collector = 'http://127.0.0.1:4318';
const demo = 'http://127.0.0.1:4600';
test.beforeEach(async ({ request }) => {
  await expect
    .poll(async () => {
      try {
        return (await request.get(`${demo}/health`)).ok();
      } catch {
        return false;
      }
    })
    .toBe(true);
  expect((await request.delete(`${collector}/api/session`)).ok()).toBe(true);
});

test('demo startup discovers actual services and renders a working 3D scene', async ({
  page,
  request,
}) => {
  const failures: string[] = [];
  page.on('pageerror', (error) => failures.push(error.message));
  for (const scenario of ['success', 'slow', 'multi', 'error', 'recovery']) {
    const response = await request.get(`${demo}/scenario/${scenario}`);
    expect(response.status()).toBe(scenario === 'error' ? 500 : 200);
  }
  const { spans } = (await (await request.get(`${collector}/api/spans`)).json()) as {
    spans: NormalizedSpan[];
  };
  expect(new Set(spans.map((span) => span.serviceName)).size).toBe(5);
  expect(spans.every((span) => span.source === 'demo')).toBe(true);
  expect(spans.some((span) => span.parentSpanId)).toBe(true);
  expect(spans.some((span) => span.attributes['db.system.name'] === 'sqlite')).toBe(true);
  expect(spans.some((span) => span.durationMs >= 400)).toBe(true);
  expect(spans.some((span) => span.status === 'error')).toBe(true);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'web-frontend', exact: true })).toBeVisible();
  await expect(page.getByTestId('universe').locator('canvas')).toBeVisible();
  await expect(page.locator('.universe-footer')).toContainText(
    'Real spans from local demo services',
  );
  await page.getByRole('button', { name: 'web-frontend', exact: true }).click();
  await expect(
    page.getByTestId('inspector').getByRole('heading', { name: 'web-frontend' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Focus', exact: true }).click();
  await page.getByRole('button', { name: 'Reset camera' }).click();
  await expect
    .poll(async () =>
      page
        .locator('.universe-labels .node-label')
        .evaluateAll(
          (labels) =>
            labels.filter((label) => (label as HTMLElement).style.visibility === 'visible').length,
        ),
    )
    .toBe(6);
  if (process.env.TRACEVERSE_CAPTURE === '1') {
    mkdirSync('docs/assets', { recursive: true });
    await page.screenshot({ path: 'docs/assets/universe.png', fullPage: true });
  }
  await page.getByRole('button', { name: 'Traces', exact: true }).click();
  const row = page.getByRole('row', { name: /Inspect trace/ }).first();
  await expect(row).toBeVisible();
  await expect(row.locator('td').nth(1)).toHaveText('5');
  await row.click();
  await expect(
    page.getByTestId('inspector').getByText('Span waterfall', { exact: false }),
  ).toBeVisible();
  expect(await page.locator('.waterfall-item').count()).toBeGreaterThan(5);
  if (process.env.TRACEVERSE_CAPTURE === '1')
    await page.screenshot({ path: 'docs/assets/trace-inspector.png', fullPage: true });
  expect(failures).toEqual([]);
  if (process.env.TRACEVERSE_CAPTURE === '1' && page.video()) {
    const video = page.video()!;
    await page.close();
    await video.saveAs('docs/assets/demo.webm');
  }
});

test('errors show evidence and export a sanitized report', async ({ page, request }) => {
  await request.get(`${demo}/scenario/error`);
  await page.goto('/');
  await page.getByRole('button', { name: /^Errors\b/ }).click();
  await expect(page.locator('.error-row').first()).toBeVisible();
  await page.locator('.error-row').first().click();
  await expect(
    page.getByTestId('inspector').getByText('exception · DemoFailure').first(),
  ).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export sanitized report', exact: true }).click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).toBeTruthy();
  const report = JSON.parse(readFileSync(path!, 'utf8'));
  expect(report.spans.some((span: NormalizedSpan) => span.status === 'error')).toBe(true);
  expect(JSON.stringify(report)).not.toMatch(
    /authorization|password|http.request.body|db.statement|exception.message/,
  );
});

test('sessions export, import, scrub, replay, and delete locally', async ({ page, request }) => {
  await request.get(`${demo}/scenario/success`);
  await request.get(`${demo}/scenario/multi`);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'web-frontend', exact: true })).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export session', exact: true }).click();
  const path = await (await downloadPromise).path();
  const session = JSON.parse(readFileSync(path!, 'utf8')) as Session;
  expect(session.version).toBe(1);
  expect(session.spans.length).toBeGreaterThan(10);
  await page.getByLabel('Import session file').setInputFiles({
    name: 'recorded.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(session)),
  });
  await expect(page.getByLabel('Data source')).toHaveValue('replay');
  await page.getByLabel('Replay position').fill('1000');
  await expect(page.getByRole('button', { name: 'web-frontend', exact: true })).toBeVisible();
  await page.getByLabel('Replay speed').selectOption('4');
  await page.getByRole('button', { name: 'Play replay', exact: true }).click();
  await expect
    .poll(async () => Number(await page.getByLabel('Replay position').inputValue()))
    .toBeGreaterThan(0);
  // A short real session can finish before the next browser command at 4x.
  const pauseReplay = page.getByRole('button', { name: 'Pause', exact: true });
  if (await pauseReplay.isVisible()) await pauseReplay.click();
  await page.getByRole('button', { name: 'Sessions', exact: true }).click();
  await expect(page.locator('.saved-session')).toHaveCount(1);
  await page.getByRole('button', { name: /^Delete Imported/ }).click();
  await expect(page.locator('.saved-session')).toHaveCount(0);
});

test('accessible graph, filtering, pause, and persisted performance settings work', async ({
  page,
  request,
}) => {
  await request.get(`${demo}/scenario/success`);
  await page.goto('/');
  await page.getByRole('button', { name: '2D view', exact: true }).click();
  await expect(page.getByRole('img', { name: /Service dependency graph/ })).toBeVisible();
  await page.getByRole('button', { name: 'Select api-service', exact: true }).press('Enter');
  await expect(
    page.getByTestId('inspector').getByRole('heading', { name: 'api-service' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Incoming', exact: true }).click();
  await page.getByRole('button', { name: 'Isolate', exact: true }).click();
  await page.getByRole('button', { name: 'Show all', exact: true }).click();
  await page.getByLabel('Search services').fill('order');
  await expect(page.locator('.service-list .service-item')).toHaveCount(1);
  await page.getByLabel('Search services').fill('');
  await page.getByLabel('Filter service type').selectOption('database');
  await expect(page.locator('.service-list .service-item')).toHaveCount(1);
  await page.getByLabel('Filter service type').selectOption('all');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.getByText('Paused · resume to continue', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Graphics quality').selectOption('low');
  await page.getByLabel('Reduced motion').check();
  await page.getByLabel('Event retention minutes').fill('10');
  await page.getByRole('button', { name: 'Apply collector settings', exact: true }).click();
  await expect
    .poll(
      async () =>
        (await (await request.get(`${collector}/health`)).json()).settings.retentionMinutes,
    )
    .toBe(10);
  await page.getByRole('button', { name: 'Close settings', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByLabel('Graphics quality')).toHaveValue('low');
  await expect(page.getByLabel('Reduced motion')).toBeChecked();
});

test('synthetic sample works offline without mixing it with live telemetry', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await page.getByLabel('Data source').selectOption('live');
  await expect(
    page.getByText('Your universe starts with one trace.', { exact: true }),
  ).toBeVisible();
  await page.getByLabel('Data source').selectOption('synthetic');
  await expect(page.getByTestId('scenario-controls')).toContainText('SYNTHETIC');
  await expect(page.getByRole('button', { name: 'api-gateway', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '2D view', exact: true }).click();
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Select api-gateway', exact: true }).click();
  await expect(
    page.getByTestId('inspector').getByRole('heading', { name: 'api-gateway' }),
  ).toBeVisible();
  await context.setOffline(false);
  await page.getByLabel('Data source').selectOption('live');
  await expect(
    page.getByText('Your universe starts with one trace.', { exact: true }),
  ).toBeVisible();
});

test('small screens stay usable and hostile session imports are rejected', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByLabel('Data source').selectOption('synthetic');
  await page.getByRole('button', { name: '2D view', exact: true }).click();
  await expect(page.getByTestId('universe')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(
    true,
  );
  await page.getByLabel('Import session file').setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ version: 999, spans: [] })),
  });
  await expect(page.getByRole('status')).toContainText('Unsupported or invalid session');
  await expect(page.getByLabel('Data source')).toHaveValue('synthetic');
});
