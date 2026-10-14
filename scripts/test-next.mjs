import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const children = [];
async function waitFor(url, timeout = 90000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch {
      /* pending */
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
  throw new Error(`Timed out waiting for ${url}`);
}
function launch(args, env = {}) {
  const child = spawn(process.execPath, args, {
    stdio: 'inherit',
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1', ...env },
  });
  children.push(child);
  return child;
}
try {
  let collectorRunning = false;
  try {
    collectorRunning = (await fetch('http://127.0.0.1:4318/health')).ok;
  } catch {
    /* start a temporary collector */
  }
  if (!collectorRunning)
    launch(['--import', 'tsx', 'apps/collector/src/index.ts'], { TRACEVERSE_DB: ':memory:' });
  await waitFor('http://127.0.0.1:4318/health');
  const nextBin = resolve(dirname(require.resolve('next/package.json')), 'dist/bin/next');
  launch([
    nextBin,
    'dev',
    '--webpack',
    '--hostname',
    '127.0.0.1',
    '--port',
    '4700',
    'examples/nextjs-demo',
  ]);
  const response = await waitFor('http://127.0.0.1:4700/api/checkout');
  const checkout = await response.json();
  if (!checkout.ok || !/^[a-f0-9]{32}$/.test(checkout.traceId) || /^0+$/.test(checkout.traceId))
    throw new Error('Next.js route did not create an active span');
  const deadline = Date.now() + 15000;
  let found = false;
  while (Date.now() < deadline) {
    const { spans } = await (await fetch('http://127.0.0.1:4318/api/spans')).json();
    if (
      spans.some(
        (span) =>
          span.traceId === checkout.traceId &&
          span.serviceName === 'nextjs-example' &&
          span.operation === 'checkout',
      )
    ) {
      found = true;
      break;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
  if (!found) throw new Error('Next.js telemetry failed to reach TraceVerse');
  console.log('PASS: genuine Next.js checkout span received by local collector.');
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  for (const child of children.reverse()) child.kill('SIGTERM');
}
