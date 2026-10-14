import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { createServer } from 'node:net';
const require = createRequire(import.meta.url);
const children = [];
let exiting = false;
function launch(args) {
  const child = spawn(process.execPath, args, { stdio: 'inherit', env: process.env });
  children.push(child);
  child.on('error', (error) => {
    console.error(error.message);
    stop(1);
  });
  child.on('exit', (code) => {
    if (!exiting) stop(code || 1);
  });
  return child;
}
function stop(code = 0) {
  if (exiting) return;
  exiting = true;
  process.exitCode = code;
  for (const child of children) child.kill('SIGTERM');
  setTimeout(() => process.exit(code), 500);
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop(0));
const demo = process.argv.includes('--demo');
for (const port of [4318, 5173, ...(demo ? [4600, 4601, 4602, 4603, 4604] : [])]) {
  try {
    await new Promise((resolvePort, reject) => {
      const probe = createServer();
      probe.once('error', reject);
      probe.listen(port, '127.0.0.1', () => probe.close(resolvePort));
    });
  } catch {
    console.error(
      `TraceVerse needs local port ${port}. Stop its existing server or choose an available port before starting this workspace.`,
    );
    process.exit(1);
  }
}
launch(['--import', 'tsx', 'apps/collector/src/index.ts']);
const deadline = Date.now() + 20000;
while (true) {
  try {
    if ((await fetch('http://127.0.0.1:4318/health')).ok) break;
  } catch {
    /* wait for collector */
  }
  if (Date.now() > deadline) {
    console.error('Collector did not start on 127.0.0.1:4318. Check the port and preceding error.');
    stop(1);
    break;
  }
  await new Promise((resolveWait) => setTimeout(resolveWait, 200));
}
if (!exiting) {
  if (demo) launch(['--import', 'tsx', 'examples/express-demo/src/index.ts']);
  launch([
    resolve(dirname(require.resolve('vite/package.json')), 'bin/vite.js'),
    '--host',
    '127.0.0.1',
    '--port',
    '5173',
    '--strictPort',
    'apps/web',
  ]);
  console.log(
    '\nTraceVerse dashboard → http://127.0.0.1:5173\nCollector → http://127.0.0.1:4318/v1/traces\nDemo frontend → http://127.0.0.1:4600\nCtrl+C stops all owned services.\n',
  );
}
