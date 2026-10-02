import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Patches the BUILT service worker (dist/sw.js) only. public/sw.js stays
// untouched so builds never dirty the working tree.
const swPath = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'sw.js');

let sw;
try {
  sw = readFileSync(swPath, 'utf8');
} catch (err) {
  if (err.code === 'ENOENT') {
    console.error(`bump-sw-version: ${swPath} not found - run "vite build" first`);
  } else {
    console.error(`bump-sw-version: failed to read ${swPath}: ${err.message}`);
  }
  process.exit(1);
}

const version = `pixel-run-${Date.now()}`;
const updated = sw.replace(/const CACHE_NAME = 'pixel-run-[^']*';/, `const CACHE_NAME = '${version}';`);

if (updated === sw) {
  console.error('bump-sw-version: CACHE_NAME pattern not found in dist/sw.js');
  process.exit(1);
}

writeFileSync(swPath, updated);
console.log(`bump-sw-version: ${version}`);
