import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) throw new Error('Pass a semantic release version');
const files = ['package.json'];
for (const group of ['apps', 'packages', 'examples'])
  for (const name of readdirSync(group)) files.push(`${group}/${name}/package.json`);
for (const file of files) {
  const pkg = JSON.parse(readFileSync(file, 'utf8'));
  pkg.version = version;
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies']) {
    for (const dependency of Object.keys(pkg[field] ?? {}))
      if (dependency.startsWith('@traceverse/')) pkg[field][dependency] = version;
  }
  writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
}
console.log(
  `Set all TraceVerse workspaces to ${version}. Refresh package-lock.json before release.`,
);
