import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
/** Retain upstream license texts alongside the publicly distributed browser build. */
export async function generateNotices() {
  const queue = ['apps/web/package.json', 'packages/visualization/package.json'];
  const seen = new Set();
  const notices = [];
  const missing = [];
  while (queue.length) {
    const manifestPath = resolve(queue.shift());
    const pkg = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const key = `${pkg.name}@${pkg.version}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const folder = dirname(manifestPath);
    const licenses = readdirSync(folder).filter((name) =>
      /^(licen[cs]e|copying)(\.|$)/i.test(name),
    );
    const texts = licenses
      .filter((file) => !file.endsWith('.json'))
      .map((file) => readFileSync(join(folder, file), 'utf8'));
    if (!texts.length && pkg.name.startsWith('@traceverse/'))
      texts.push(readFileSync('LICENSE', 'utf8'));
    const fallback = resolve('docs/license-sources', `${key.replaceAll('/', '_')}.txt`);
    if (!texts.length && existsSync(fallback)) texts.push(readFileSync(fallback, 'utf8'));
    if (!texts.length && !pkg.name.startsWith('@types/'))
      missing.push({ key, repository: pkg.repository });
    if (texts.length) notices.push({ key, text: texts.join('\n\n') });
    const require = createRequire(pathToFileURL(manifestPath));
    for (const dependency of Object.keys(pkg.dependencies ?? {})) {
      // Native build tooling is not shipped in the browser. Generated Tailwind CSS is covered above.
      if (dependency === '@tailwindcss/vite') continue;
      // Drei's unused StatsGl widget is not imported or distributed by this app.
      if (dependency === 'stats-gl') continue;
      let entry;
      try {
        entry = require.resolve(`${dependency}/package.json`);
      } catch {
        entry = require.resolve(dependency);
      }
      let parent = dirname(entry);
      while (true) {
        const candidate = join(parent, 'package.json');
        if (existsSync(candidate)) {
          const metadata = JSON.parse(readFileSync(candidate, 'utf8'));
          if (metadata.name === dependency) {
            queue.push(candidate);
            break;
          }
        }
        const upper = dirname(parent);
        if (upper === parent) throw new Error(`Cannot locate license manifest for ${dependency}`);
        parent = upper;
      }
    }
  }
  if (missing.length) throw new Error(`Missing upstream license texts: ${JSON.stringify(missing)}`);
  notices.sort((a, b) => a.key.localeCompare(b.key));
  const header =
    'TraceVerse browser distribution — third-party notices\n\nThese are the installed browser dependency closure license texts. Some optional submodules may not appear in a particular optimized bundle. Upstream licenses apply to their respective components; TraceVerse code is MIT.\n\n';
  writeFileSync(
    'apps/web/public/third-party-notices.txt',
    header +
      notices
        .map((item) => `${'='.repeat(72)}\n${item.key}\n${'='.repeat(72)}\n${item.text}`)
        .join('\n\n'),
  );
  console.log(`Preserved ${notices.length} browser-package license notices.`);
}
