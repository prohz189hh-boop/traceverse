import { build } from 'vite';
import { writeFileSync } from 'node:fs';
import { generateNotices } from './notices.mjs';
await generateNotices();
await build({ root: 'apps/web', mode: 'public-demo' });
writeFileSync('apps/web/dist-public/.nojekyll', '');
console.log('Static synthetic-only demo built for /traceverse/. Run npm run preview:demo.');
