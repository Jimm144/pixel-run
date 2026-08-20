import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const swPath = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'sw.js');
const sw = readFileSync(swPath, 'utf8');
const version = `pixel-run-${Date.now()}`;
const updated = sw.replace(/const CACHE_NAME = 'pixel-run-[^']*';/, `const CACHE_NAME = '${version}';`);

if (updated === sw) {
  console.error('bump-sw-version: CACHE_NAME pattern not found in public/sw.js');
  process.exit(1);
}

writeFileSync(swPath, updated);
console.log(`bump-sw-version: ${version}`);
