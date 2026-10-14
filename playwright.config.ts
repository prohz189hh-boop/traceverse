import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e', timeout: 45000, fullyParallel: false, workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:5173', browserName: 'chromium', viewport: { width: 1536, height: 960 }, trace: 'retain-on-failure', launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } },
  webServer: { command: 'npm run demo', url: 'http://127.0.0.1:5173', reuseExistingServer: !process.env.CI, timeout: 90000, env: { TRACEVERSE_DEMO_AUTOTRAFFIC: '0', TRACEVERSE_DB: ':memory:' } },
});
