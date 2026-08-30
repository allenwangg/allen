/**
 * stamp-sw.mjs — Write a content hash of the app shell into sw.js.
 *
 * A service worker only installs a new cache when its own bytes change. If
 * VERSION is hand-edited, someone eventually forgets and every existing
 * installation is pinned to the old build forever, with no way to push a fix.
 *
 * Run before deploying: `npm run stamp-sw`.
 * `npm run stamp-sw -- --check` verifies the stamp is current without writing,
 * which is what CI runs.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SW = path.join(ROOT, 'app/sw.js');

const source = readFileSync(SW, 'utf8');

// Hash exactly the files the shell pins, plus the shell list itself, so adding
// a file to SHELL also changes the version.
const shellMatch = source.match(/const SHELL = \[([\s\S]*?)\];/);
if (!shellMatch) {
  console.error('stamp-sw: could not find the SHELL list in app/sw.js');
  process.exit(1);
}
const files = [...shellMatch[1].matchAll(/'([^']+)'/g)]
  .map((m) => m[1])
  .filter((f) => f !== './');

const hash = createHash('sha256');
hash.update(shellMatch[1]);
for (const rel of files.sort()) {
  hash.update(rel);
  try {
    hash.update(readFileSync(path.join(ROOT, 'app', rel.replace(/^\.\//, ''))));
  } catch (err) {
    console.error(`stamp-sw: shell file missing: ${rel}`);
    process.exit(1);
  }
}
const version = `vitalarc-${hash.digest('hex').slice(0, 16)}`;

const current = source.match(/const VERSION = '([^']+)'/)?.[1];
const check = process.argv.includes('--check');

if (current === version) {
  console.log(`stamp-sw: up to date (${version})`);
  process.exit(0);
}
if (check) {
  console.error(
    `stamp-sw: STALE.\n  sw.js says : ${current}\n  shell hashes: ${version}\n`
    + '  Run `npm run stamp-sw` and commit the result, or every existing\n'
    + '  installation will keep serving the previous build forever.'
  );
  process.exit(1);
}
writeFileSync(SW, source.replace(/const VERSION = '[^']+'/, `const VERSION = '${version}'`));
console.log(`stamp-sw: ${current} -> ${version}`);
