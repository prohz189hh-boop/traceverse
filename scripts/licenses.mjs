import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
const accepted = new Set(['MIT', 'ISC', 'BSD-2-Clause', 'BSD-3-Clause', 'Apache-2.0', '0BSD', 'CC0-1.0', 'Unlicense', 'Python-2.0', 'BlueOak-1.0.0']);
const records = [];
const unresolved = [];
for (const [path, pkg] of Object.entries(lock.packages)) {
  if (!path.includes('node_modules/') || pkg.link) continue;
  let license = pkg.license;
  if (!license && existsSync(`${path}/package.json`)) license = JSON.parse(readFileSync(`${path}/package.json`, 'utf8')).license;
  if (typeof license !== 'string') license = license?.type ?? 'UNKNOWN';
  const name = path.split('node_modules/').at(-1);
  // 1.1.1 omits SPDX metadata but ships the complete MIT license.
  if (name === 'webgl-constants' && pkg.version === '1.1.1' && license === 'UNKNOWN' && existsSync(`${path}/LICENSE`) && readFileSync(`${path}/LICENSE`, 'utf8').startsWith('MIT License')) license = 'MIT';
  records.push({ name, version: pkg.version, license });
  // A permissive alternative in an OR expression is compatible; AND requires all operands.
  const allowed = license.split(/\s+OR\s+/).some((branch) => branch.replace(/[()]/g, '').split(/\s+AND\s+/).every((part) => accepted.has(part.trim())));
  const reviewed = (name.startsWith('lightningcss') && license === 'MPL-2.0') ||
    (name === 'caniuse-lite' && license === 'CC-BY-4.0') ||
    (name.startsWith('@img/sharp') && license.includes('LGPL-3.0-or-later'));
  // These exact upstream groups retain their own terms; see docs/licenses.md.
  if (!allowed && !reviewed) unresolved.push({ name, license });
}
records.sort((a,b) => a.name.localeCompare(b.name));
writeFileSync('docs/dependency-licenses.json', `${JSON.stringify({ generatedFrom: 'package-lock.json', dependencies: records }, null, 2)}\n`);
console.log(`Audited ${records.length} locked dependencies; ${unresolved.length} license expressions require review.`);
if (unresolved.length) { console.error(unresolved); process.exitCode = 1; }
