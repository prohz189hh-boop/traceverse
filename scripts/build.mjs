import { build } from 'esbuild';
import { build as viteBuild } from 'vite';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { generateNotices } from './notices.mjs';
const external = [];
for (const group of ['apps', 'packages', 'examples']) {
  for (const name of readdirSync(group)) {
    try {
      const pkg = JSON.parse(readFileSync(resolve(group, name, 'package.json'), 'utf8'));
      external.push(
        ...Object.keys(pkg.dependencies ?? {}).filter((dep) => !dep.startsWith('@traceverse/')),
      );
    } catch {
      /* config-only folders have no dependencies */
    }
  }
}
await generateNotices();
await viteBuild({ root: 'apps/web' });
for (const entry of ['apps/collector', 'examples/express-demo']) {
  await build({
    entryPoints: [`${entry}/src/index.ts`],
    outfile: `${entry}/dist/index.mjs`,
    bundle: true,
    platform: 'node',
    target: 'node24',
    format: 'esm',
    sourcemap: true,
    external: [...new Set(external)],
  });
}
console.log('TraceVerse production build complete. Run npm start → http://127.0.0.1:4318');
