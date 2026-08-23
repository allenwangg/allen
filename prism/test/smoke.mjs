// Prism end-to-end smoke test (Chromium via playwright-core).
// Usage: PLAYWRIGHT_CORE=<path-to-playwright-core> CHROMIUM=<path-to-chromium> node test/smoke.mjs
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(process.env.PLAYWRIGHT_CORE || 'playwright-core');

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };
const server = createServer((req, res) => {
  let p = join(root, req.url === '/' ? 'index.html' : req.url.replace(/\?.*$/, ''));
  if (!existsSync(p)) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'content-type': MIME[extname(p)] || 'text/plain' });
  res.end(readFileSync(p));
});
await new Promise(r => server.listen(0, r));
const url = `http://127.0.0.1:${server.address().port}/`;

let failures = 0;
const ok = (cond, name) => { console.log((cond ? 'PASS ' : 'FAIL ') + name); if (!cond) failures++; };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  // ignore failed external resource loads (e.g. Google Fonts offline) — only local errors matter
  const u = (m.location() || {}).url || '';
  if (u.startsWith('http://127.0.0.1') || u === '') errors.push(m.text());
});

await page.goto(url, { waitUntil: 'networkidle' });

// --- home ---
ok(await page.locator('.brand').count() === 1, 'home renders brand');
const nCourses = await page.locator('.cover').count();
ok(nCourses >= 1, `home shows course covers (${nCourses})`);

// --- course page ---
await page.locator('.cover').first().click();
await page.waitForSelector('.lesson-row');
const nLessons = await page.locator('.lesson-row').count();
ok(nLessons >= 1, `course page lists lessons (${nLessons})`);

// --- play a full lesson ---
await page.locator('.lesson-row').first().click();
await page.waitForSelector('.card');
let steps = 0, sawQuiz = false, sawWrongPath = false;
while (steps++ < 80) {
  if (await page.locator('.done-card').count()) break;
  if (await page.locator('#btn-reveal').count()) {
    await page.locator('#btn-reveal').click();
    await page.locator('#btn-next').click();
  } else if (await page.locator('.choice:not(:disabled)').count()) {
    sawQuiz = true;
    // answer first choice; engine must handle both right and wrong paths
    await page.locator('.choice').first().click();
    if (await page.locator('.explain.bad').count()) sawWrongPath = true;
    await page.waitForSelector('#btn-next');
    await page.locator('#btn-next').click();
  } else if (await page.locator('#btn-next').count()) {
    await page.locator('#btn-next').click();
  } else break;
  await page.waitForTimeout(60);
}
ok(await page.locator('.done-card').count() === 1, `lesson completes (${steps} steps, quiz=${sawQuiz}, wrong-path=${sawWrongPath})`);
const xpText = await page.locator('.done-stats .stat b').first().textContent();
ok(/\+\d+/.test(xpText || ''), `completion shows XP earned (${(xpText || '').trim()})`);

// --- review session ---
await page.goto(url + '#/review');
await page.waitForSelector('.card, .empty');
if (await page.locator('.flash').count()) {
  let guard = 0;
  while (guard++ < 60 && !(await page.locator('.done-card').count())) {
    if (await page.locator('#btn-flip').count()) await page.locator('#btn-flip').click();
    else if (await page.locator('.grade.g2').count()) await page.locator('.grade.g2').click();
    await page.waitForTimeout(40);
  }
  ok(await page.locator('.done-card').count() === 1, 'review session completes');
} else {
  ok(false, 'review had due cards after lesson completion');
}

// --- stats + persistence ---
await page.goto(url + '#/stats');
await page.waitForSelector('.stat-grid');
ok(await page.locator('.panel').count() >= 4, 'stats page renders panels');
const xpBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('prism.v1')).xp);
await page.reload({ waitUntil: 'networkidle' });
const xpAfter = await page.evaluate(() => JSON.parse(localStorage.getItem('prism.v1')).xp);
ok(xpBefore > 0 && xpBefore === xpAfter, `XP persists across reload (${xpAfter})`);

// --- settings modal + theme ---
await page.goto(url + '#/');
await page.locator('#btn-settings').click();
await page.waitForSelector('.modal');
await page.selectOption('#set-theme', 'dark');
await page.locator('#set-save').click();
ok(await page.evaluate(() => document.documentElement.getAttribute('data-theme')) === 'dark', 'dark theme applies');

ok(errors.length === 0, 'no console/page errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));

await browser.close();
server.close();
console.log(failures ? `${failures} FAILURE(S)` : 'ALL PASS');
process.exit(failures ? 1 : 0);
