import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
const port = await new Promise((resolvePort) => {
  const probe = createServer();
  probe.listen(0, '127.0.0.1', () => {
    const selected = probe.address().port;
    probe.close(() => resolvePort(selected));
  });
});
const child = spawn(process.execPath, ['apps/collector/dist/index.mjs'], {
  stdio: 'inherit',
  env: { ...process.env, TRACEVERSE_DB: ':memory:', TRACEVERSE_COLLECTOR_PORT: String(port) },
});
try {
  const root = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 15000;
  let ready = false;
  while (Date.now() < deadline) {
    try {
      ready = (await fetch(`${root}/health`)).ok;
    } catch {
      /* starting */
    }
    if (ready) break;
    await new Promise((resolveWait) => setTimeout(resolveWait, 200));
  }
  if (!ready) throw new Error('Production collector did not start');
  const response = await fetch(root);
  const html = await response.text();
  if (!response.ok || !html.includes('TraceVerse'))
    throw new Error('Production dashboard not served');
  const asset = html.match(/src="([^"]+\.js)"/)[1];
  if (!(await fetch(new URL(asset, root))).ok)
    throw new Error('Production JavaScript asset not served');
  const timestamp = BigInt(Date.now()) * 1000000n;
  const payload = {
    resourceSpans: [
      {
        resource: {
          attributes: [{ key: 'service.name', value: { stringValue: 'production-smoke' } }],
        },
        scopeSpans: [
          {
            spans: [
              {
                traceId: 'a'.repeat(32),
                spanId: 'b'.repeat(16),
                name: 'smoke operation',
                startTimeUnixNano: String(timestamp),
                endTimeUnixNano: String(timestamp + 12000000n),
                kind: 2,
                status: { code: 1 },
              },
            ],
          },
        ],
      },
    ],
  };
  const ingest = await fetch(`${root}/v1/traces`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const { spans } = await (await fetch(`${root}/api/spans`)).json();
  if (!ingest.ok || spans.length !== 1 || spans[0].durationMs !== 12)
    throw new Error('Production ingestion failed');
  console.log('PASS: built collector serves dashboard/assets and receives telemetry.');
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  child.kill('SIGTERM');
}
