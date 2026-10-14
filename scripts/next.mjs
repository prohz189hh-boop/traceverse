import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
// Disable framework analytics for this process without altering user/global settings.
process.env.NEXT_TELEMETRY_DISABLED = '1';
const require = createRequire(import.meta.url);
const binary = resolve(dirname(require.resolve('next/package.json')), 'dist/bin/next');
process.argv[1] = binary;
await import(pathToFileURL(binary).href);
