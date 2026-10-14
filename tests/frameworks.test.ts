import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { createCollector } from '../apps/collector/src/server.js';

describe('official framework integrations', () => {
  for (const [example, service, route] of [
    ['node-http-demo', 'node-http-example', '/tested'],
    ['fastify-demo', 'fastify-example', '/tested'],
    ['express-demo', 'express-auto-example', '/tested'],
  ]) {
    it(`receives genuine ${service} request spans`, async () => {
      const { app, store } = await createCollector({ dbPath: ':memory:' });
      await app.listen({ host: '127.0.0.1', port: 0 });
      const address = app.server.address();
      if (!address || typeof address === 'string') throw new Error('Collector did not bind TCP');
      const child = spawn(
        process.execPath,
        [
          '--import',
          'tsx',
          `examples/${example}/src/${example === 'express-demo' ? 'auto' : 'index'}.ts`,
        ],
        {
          env: {
            ...process.env,
            TRACEVERSE_PORT: '0',
            TRACEVERSE_ENDPOINT: `http://127.0.0.1:${address.port}/v1/traces`,
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      let output = '';
      child.stderr.on('data', (data) => {
        output += String(data);
      });
      try {
        const port = await new Promise<number>((resolveReady, reject) => {
          const timer = setTimeout(
            () => reject(new Error(`Framework startup timed out: ${output}`)),
            12000,
          );
          child.stdout.on('data', (data) => {
            output += String(data);
            const match = output.match(/FRAMEWORK_READY (\d+)/);
            if (match) {
              clearTimeout(timer);
              resolveReady(Number(match[1]));
            }
          });
          child.once('error', reject);
          child.once('exit', (code) => {
            clearTimeout(timer);
            reject(new Error(`Framework exited ${code}: ${output}`));
          });
        });
        const result = await fetch(`http://127.0.0.1:${port}${route}`);
        expect(result.ok).toBe(true);
        expect(await result.json()).toMatchObject({ ok: true });
        await expect
          .poll(() => store.all().filter((span) => span.serviceName === service).length, {
            timeout: 8000,
          })
          .toBeGreaterThan(0);
        expect(
          store
            .all()
            .filter((span) => span.serviceName === service)
            .some((span) => span.kind === 2),
        ).toBe(true);
        expect(store.all().every((span) => span.source === 'live')).toBe(true);
      } finally {
        child.kill('SIGTERM');
        await app.close();
      }
    });
  }
});
