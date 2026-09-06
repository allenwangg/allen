#!/usr/bin/env node
/**
 * stamp-shell.mjs — derive the service-worker cache name from the app shell.
 *
 * The service worker is cache-first. If a deploy changes app.js but not the
 * cache name, every returning contractor keeps running the OLD app.js until the
 * background refresh happens to win — and a fix you shipped is one they don't
 * have. Bumping the name by hand is exactly the kind of step that gets skipped.
 *
 * So the cache name is a content hash of the precached shell, and this script
 * writes it into sw.js. `sw.test.js` fails whenever the stamp is stale, so a
 * shell change cannot reach a commit without a matching cache bump.
 *
 *   node quoteforge/tools/stamp-shell.mjs          rewrite the stamp
 *   node quoteforge/tools/stamp-shell.mjs --check  exit 1 if stale (no write)
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SW = join(ROOT, 'sw.js');

const STAMP_RE = /const SHELL_HASH = '([0-9a-f]{12})';/;
const SHELL_RE = /const SHELL = \[([\s\S]*?)\];/;

export function readShellList(swSource) {
  const m = SHELL_RE.exec(swSource);
  if (!m) throw new Error('sw.js: could not find the SHELL array');
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

/** Hash the precached files in a fixed order. './' is the directory index. */
export function hashShell(swSource) {
  const h = createHash('sha256');
  for (const entry of readShellList(swSource)) {
    if (entry === './') continue;
    const file = join(ROOT, entry);
    h.update(entry).update('\0').update(readFileSync(file)).update('\0');
  }
  return h.digest('hex').slice(0, 12);
}

export function currentStamp(swSource) {
  const m = STAMP_RE.exec(swSource);
  return m ? m[1] : null;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const src = readFileSync(SW, 'utf8');
  const want = hashShell(src);
  const have = currentStamp(src);
  if (have === want) {
    console.log(`  sw.js stamp is current (${want})`);
  } else if (process.argv.includes('--check')) {
    console.error(`  sw.js stamp is stale: have ${have}, shell hashes to ${want}\n  run: node quoteforge/tools/stamp-shell.mjs`);
    process.exit(1);
  } else {
    if (!STAMP_RE.test(src)) throw new Error('sw.js: could not find SHELL_HASH to rewrite');
    writeFileSync(SW, src.replace(STAMP_RE, `const SHELL_HASH = '${want}';`));
    console.log(`  sw.js stamp ${have} -> ${want}`);
  }
}
