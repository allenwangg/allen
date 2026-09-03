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

// --- first-visit tour ---
ok(await page.locator('#tour-go').count() === 1, 'first-visit tour shows');
await page.locator('#tour-go').click();
await page.reload({ waitUntil: 'networkidle' });
ok(await page.locator('#tour-go').count() === 0, 'tour stays dismissed');

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

// --- match bonus round ---
if (await page.locator('#btn-match').count()) {
  await page.locator('#btn-match').click();
  await page.waitForSelector('.match-grid');
  const nPairs = await page.locator('.match-tile[data-side="l"]').count();
  for (let i = 0; i < nPairs; i++) {
    await page.locator(`.match-tile[data-side="l"][data-i="${i}"]`).click();
    await page.locator(`.match-tile[data-side="r"][data-i="${i}"]`).click();
    await page.waitForTimeout(60);
  }
  await page.waitForSelector('.done-card');
  ok(true, `match round completes (${nPairs} pairs)`);
  ok(await page.locator('#btn-match').count() === 0, 'match button hidden after play');
} else {
  ok(false, 'match bonus button present on completion');
}

// --- lesson resume ---
const l2 = await page.evaluate(() => window.COURSES[0].lessons[1].id);
await page.goto(url + '#/lesson/' + await page.evaluate(() => window.COURSES[0].id) + '/' + l2);
await page.waitForSelector('.card');
for (let i = 0; i < 3; i++) {
  if (await page.locator('#btn-next').count()) await page.locator('#btn-next').click();
  else if (await page.locator('.choice:not(:disabled)').count()) {
    await page.locator('.choice').first().click();
    await page.waitForSelector('#btn-next');
    await page.locator('#btn-next').click();
  } else if (await page.locator('#btn-reveal').count()) {
    await page.locator('#btn-reveal').click();
    await page.locator('#btn-next').click();
  }
  await page.waitForTimeout(60);
}
await page.goto(url + '#/');
await page.waitForSelector('.actions');
const contText = await page.locator('.continue-card h3').textContent().catch(() => '');
ok(/Resume/.test(contText || ''), `home offers resume (${(contText || '').trim()})`);

// --- resume must not re-award XP (exit/reopen farm loop) ---
const xpFarm0 = await page.evaluate(() => JSON.parse(localStorage.getItem('prism.v1')).xp);
for (let i = 0; i < 3; i++) {
  await page.locator('.continue-card').click();
  await page.waitForSelector('.card');
  await page.waitForTimeout(120);
  await page.goto(url + '#/');
  await page.waitForSelector('.actions');
}
const xpFarm1 = await page.evaluate(() => JSON.parse(localStorage.getItem('prism.v1')).xp);
ok(xpFarm1 === xpFarm0, `resume reopen loop banks no XP (${xpFarm0} -> ${xpFarm1})`);

// --- practice mode ---
await page.goto(url + '#/practice');
await page.waitForSelector('.card, .empty');
let pracSteps = 0;
while (pracSteps++ < 30 && !(await page.locator('.done-card').count())) {
  if (await page.locator('.choice:not(:disabled)').count()) {
    await page.locator('.choice').first().click();
    await page.waitForSelector('#btn-next');
    await page.locator('#btn-next').click();
  }
  await page.waitForTimeout(50);
}
ok(await page.locator('.done-card').count() === 1, `practice session completes (${pracSteps} questions)`);

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
ok(await page.locator('.badge-card').count() >= 10, 'achievements gallery renders');
ok(await page.locator('.badge-card.earned').count() >= 1, 'first-lesson badge earned');
ok(await page.locator('.forecast .fc-col').count() === 7, 'review forecast renders 7 days');

// --- search ---
await page.goto(url + '#/search');
await page.waitForSelector('#search-in');
await page.fill('#search-in', 'anchor');
await page.waitForTimeout(120);
ok(await page.locator('.search-hit').count() >= 1, 'search finds lessons for "anchor"');
ok((await page.locator('.search-hit mark').count()) >= 1, 'search highlights matches');
// ranking: every term must appear, short terms need a word boundary, phrases win
const ph = await page.getAttribute('#search-in','placeholder');
ok(/across \d{2,} courses/.test(ph||''), `the placeholder names the real library size (${ph})`);
async function find(q){ await page.fill('#search-in', q); await page.waitForTimeout(180);
  return { n: Number(((await page.locator('.search-count').textContent().catch(()=>'0'))||'0').match(/\d+/)?.[0]||0),
           top: (await page.locator('.search-hit b').allTextContents()).slice(0,3) }; }
const two = await find('memory spacing');
ok(two.n>0 && two.n<12, `a two-word query narrows rather than widens (${two.n} lessons)`);
const impossible = await find('memory zzzqx');
ok(impossible.n===0, 'a query with one absent term returns nothing');
const short = await find('art');
ok(short.n>0, `a short word still matches (${short.n} lessons)`);
ok(short.top.every(t=>t.length>0), 'short-word results are real lessons');
const substr = await find('artes');
ok(substr.n===0, 'a short word does not match inside other words (no "Descartes" for "artes")');
const prefix = await find('epistem');
ok(prefix.n>0, `a prefix still matches the whole word (${prefix.n} lessons for "epistem")`);
await page.fill('#search-in','entropy'); await page.waitForTimeout(180);
ok((await page.locator('.search-count').textContent()||'').includes('lesson'), 'the result count is shown');
const xpBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('prism.v1')).xp);
await page.reload({ waitUntil: 'networkidle' });
const xpAfter = await page.evaluate(() => JSON.parse(localStorage.getItem('prism.v1')).xp);
ok(xpBefore > 0 && xpBefore === xpAfter, `XP persists across reload (${xpAfter})`);

// --- settings modal + theme ---
await page.goto(url + '#/');
await page.locator('#btn-settings').click();
await page.waitForSelector('.modal');
ok(await page.locator('#set-sound').count() === 1, 'sound setting present');
ok(await page.locator('#bk-copy').count() === 1, 'backup controls present');
await page.selectOption('#set-theme', 'dark');
await page.locator('#set-save').click();
ok(await page.evaluate(() => document.documentElement.getAttribute('data-theme')) === 'dark', 'dark theme applies');

// --- backup roundtrip ---
const blob = await page.evaluate(() => localStorage.getItem('prism.v1'));
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'domcontentloaded' });
if (await page.locator('#tour-go').count()) await page.locator('#tour-go').click();  // fresh state → tour returns
await page.locator('#btn-settings').click();
await page.waitForSelector('.modal');
await page.locator('.backup summary').click();
await page.locator('#bk-paste').click();          // reveals textarea
await page.fill('#bk-text', blob);
page.once('dialog', d => d.accept());
await page.locator('#bk-paste').click();
await page.waitForTimeout(200);
const restored = await page.evaluate(() => JSON.parse(localStorage.getItem('prism.v1')).xp);
ok(restored > 0, `backup restore round-trips XP (${restored})`);

ok(errors.length === 0, 'no console/page errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));

await browser.close();
server.close();
console.log(failures ? `${failures} FAILURE(S)` : 'ALL PASS');
process.exit(failures ? 1 : 0);
