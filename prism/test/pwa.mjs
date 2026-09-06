// Prism PWA checks — manifest, icons, service worker, and genuine offline use.
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' };
let served = [];
const server = createServer((q, r) => {
  let p = join(root, q.url === '/' ? 'index.html' : q.url.replace(/\?.*$/, ''));
  if (!existsSync(p)) { r.writeHead(404); return r.end('nf'); }
  served.push(q.url);
  r.writeHead(200, { 'content-type': MIME[extname(p)] || 'text/plain' });
  r.end(readFileSync(p));
});
const sockets = new Set();
server.on('connection', s => { sockets.add(s); s.on('close', () => sockets.delete(s)); });
await new Promise(r => server.listen(0, r));
const url = `http://127.0.0.1:${server.address().port}/`;
let fail = 0; const ok = (c, n) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) fail++; };

const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e)));

// --- manifest ---
await page.goto(url, { waitUntil: 'domcontentloaded' });
const href = await page.getAttribute('link[rel=manifest]', 'href');
ok(href === 'manifest.webmanifest', 'index.html links a manifest');
const mf = await page.evaluate(h => fetch(h).then(r => r.ok ? r.json() : null), href);
ok(!!mf, 'manifest fetches and parses');
ok(mf.display === 'standalone', 'manifest requests a standalone window');
ok(mf.start_url === './' && mf.scope === './', 'start_url and scope are relative (deploys under any path)');
ok((mf.icons || []).some(i => i.purpose === 'maskable'), 'a maskable icon is declared');
ok((mf.shortcuts || []).length >= 2, `${(mf.shortcuts || []).length} home-screen shortcuts declared`);

const icons = await page.evaluate(list => Promise.all(
  list.map(i => fetch(i.src).then(r => ({ src: i.src, ok: r.ok, type: r.headers.get('content-type') })))
), mf.icons);
ok(icons.every(i => i.ok), `every declared icon resolves (${icons.length})`);
ok(icons.filter(i => /\.png$/.test(i.src)).every(i => (i.type || '').includes('image/png')), 'PNG icons are served as images');
const apple = await page.evaluate(() => fetch(document.querySelector('link[rel=apple-touch-icon]').href).then(r => r.ok));
ok(apple, 'apple-touch-icon resolves (iOS home screen)');

// --- service worker ---
await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 15000 })
  .catch(() => {});
const reg = await page.evaluate(() => navigator.serviceWorker.getRegistration().then(r => !!r));
ok(reg, 'service worker registers');
const cached = await page.evaluate(async () => {
  const keys = await caches.keys();
  const shell = keys.find(k => k.startsWith('prism-shell-'));
  if (!shell) return null;
  const c = await caches.open(shell);
  return { name: shell, urls: (await c.keys()).map(r => new URL(r.url).pathname) };
});
ok(!!cached, 'a versioned shell cache exists' + (cached ? ` (${cached.name})` : ''));
ok(cached && cached.name !== 'prism-shell-dev', 'shell cache is content-stamped, not the dev placeholder');
ok(cached && cached.urls.some(u => u.endsWith('/js/data/courses.js')), 'the course library is precached');
ok(cached && cached.urls.some(u => u.endsWith('/css/app.css')), 'the stylesheet is precached');

// --- genuine offline ---
// Emulated offline still lets the worker's own revalidation through, so prove it
// the unambiguous way: take the server away entirely and reload.
await ctx.setOffline(true);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('.cover', { timeout: 10000 }).catch(() => {});
ok(await page.locator('.cover').count() > 0, 'the library renders with the page offline');

server.close();
for (const s of sockets) s.destroy();
await new Promise(r => setTimeout(r, 300));
// probe a path the worker has never cached, so only the network can answer it
const dead = await page.evaluate(u => fetch(u + '__offline_probe__', { cache: 'no-store' })
  .then(() => false, () => true), url);
ok(dead, 'the server really is gone (an uncached request cannot be answered)');

await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('.cover', { timeout: 10000 }).catch(() => {});
ok(await page.locator('.cover').count() > 0, 'the library renders with no server at all');
const n = await page.evaluate(() => (window.COURSES || []).length);
ok(n > 0, `all ${n} courses are available with no server`);
await page.goto(url + '#/stats');
ok(await page.locator('.badges').count() > 0, 'other views still route with no server');
await page.goto(url + '#/paths');
ok(await page.locator('.path-card').count() > 0, 'learning paths render with no server');
await ctx.setOffline(false);

// --- home-screen badge ---
// setAppBadge is not implemented in headless Chromium, so stub it and prove the
// app calls it with the real due count and clears it when nothing is due.
const badge = await page.evaluate(async () => {
  const calls = [];
  navigator.setAppBadge = n => { calls.push(n); return Promise.resolve(); };
  navigator.clearAppBadge = () => { calls.push('clear'); return Promise.resolve(); };
  // no deck yet -> clear
  location.hash = '#/stats';
  await new Promise(r => setTimeout(r, 60));
  const whenEmpty = calls.slice();
  // seed three cards that are due now
  const c = window.COURSES[0], l = c.lessons[0];
  window.Store.addReviewItems(c, l);
  const srs = window.Store.state.srs;
  const keys = Object.keys(srs).slice(0, 3);
  for (const k of Object.keys(srs)) delete srs[k];
  let i = 0;
  for (const k of keys) { srs[k] = { id: k, due: Date.now() - 1000, ivl: 1, ease: 2.5, step: 0, lapses: 0, front: 'f' + i, back: 'b' + (i++) }; }
  calls.length = 0;
  location.hash = '#/';
  await new Promise(r => setTimeout(r, 80));
  return { whenEmpty, whenDue: calls.slice() };
});
ok(badge.whenEmpty.includes('clear'), 'badge is cleared when nothing is due');
ok(badge.whenDue.includes(3), `badge shows the due count (${JSON.stringify(badge.whenDue)})`);

ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs[0] : ''));
await b.close(); server.close();
console.log(fail ? `${fail} FAILED` : 'ALL PASS');
process.exit(fail ? 1 : 0);
