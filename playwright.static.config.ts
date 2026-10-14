import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/static',
  timeout: 45000,
  workers: 1,
  fullyParallel: false,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report/static' }]],
  use: {
    baseURL: process.env.TRACEVERSE_DEPLOYED_URL ?? 'http://127.0.0.1:4173/traceverse/',
    browserName: 'chromium',
    viewport: { width: 1536, height: 960 },
    trace: 'retain-on-failure',
    video:
      process.env.TRACEVERSE_CAPTURE === '1'
        ? { mode: 'on', size: { width: 1440, height: 900 } }
        : 'off',
    launchOptions: {
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    },
  },
  webServer: process.env.TRACEVERSE_DEPLOYED_URL
    ? undefined
    : {
        command: 'npm run build:demo && npm run preview:demo',
        url: 'http://127.0.0.1:4173/traceverse/',
        reuseExistingServer: !process.env.CI,
        timeout: 120000,
      },
});
