/**
 * sw.test.js — a shell change must ship with a cache bump.
 *
 * The service worker is cache-first, so a deploy that changes the shell but
 * not the cache name leaves returning users on the old code. These tests fail
 * whenever sw.js's stamp no longer matches the files it precaches, and when
 * the precache list drifts from what the pages actually load.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashShell, currentStamp, readShellList } from '../tools/stamp-shell.mjs';

let passed = 0, failed = 0; const failures = [];
const t = (n, f) => { try { f(); passed++; } catch (e) { failed++; failures.push(`${n}\n    ${e.message}`); } };
const eq = (a, b, m = '') => { if (a !== b) throw new Error(`${m} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const ok = (c, m = 'failed') => { if (!c) throw new Error(m); };

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(ROOT, 'sw.js'), 'utf8');
const shell = readShellList(src);

t('the cache name is stamped from the shell, and the stamp is current', () => {
  const have = currentStamp(src);
  ok(have, 'sw.js has no SHELL_HASH stamp');
  eq(have, hashShell(src), 'shell files changed without a cache bump — run: node quoteforge/tools/stamp-shell.mjs.');
  ok(src.includes('const CACHE = `${CACHE_PREFIX}${SHELL_HASH}`'), 'CACHE must derive from SHELL_HASH, or the stamp changes nothing');
});

t('every precached file exists (a rename would silently drop it from offline)', () => {
  for (const entry of shell) {
    if (entry === './') continue;
    ok(existsSync(join(ROOT, entry)), `sw.js precaches ${entry} but it does not exist`);
  }
});

t('everything the pages load is precached', () => {
  // Walk the module graph from the two pages; every local script/stylesheet
  // reached must be in SHELL, or the offline app is missing a piece.
  const seen = new Set();
  const queue = [];
  for (const page of ['./index.html', './intake.html']) {
    ok(shell.includes(page), `${page} must be precached`);
    const html = readFileSync(join(ROOT, page), 'utf8');
    for (const m of html.matchAll(/<link[^>]+href="([^"]+\.css)"/g)) queue.push('./' + m[1]);
    for (const m of html.matchAll(/<script[^>]+src="([^"]+)"/g)) queue.push('./' + m[1]);
    for (const m of html.matchAll(/from '\.\/(js\/[^']+)'/g)) queue.push('./' + m[1]);
  }
  while (queue.length) {
    const entry = queue.pop();
    if (seen.has(entry)) continue;
    seen.add(entry);
    ok(shell.includes(entry), `${entry} is loaded by the app but not precached`);
    if (!entry.endsWith('.js')) continue;
    const js = readFileSync(join(ROOT, entry), 'utf8');
    for (const m of js.matchAll(/from '\.\/([^']+)'/g)) queue.push('./js/' + m[1]);
  }
  ok(seen.size >= 6, `module walk found only ${seen.size} files — the walker is probably broken`);
});

t('activation only ever deletes this app\'s own caches', () => {
  ok(src.includes('k.startsWith(CACHE_PREFIX) && k !== CACHE'), 'activate must filter by CACHE_PREFIX');
});

t('sw.js itself is not in the shell (it must always be fetched fresh)', () => {
  ok(!shell.includes('./sw.js'), 'a cached sw.js could never update itself');
});

console.log(`  sw: ${passed} passed, ${failed} failed`);
for (const f of failures) console.log(`  ✗ ${f}`);
if (failed) process.exit(1);
