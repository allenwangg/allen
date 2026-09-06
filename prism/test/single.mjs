// Prism single-file build — the shareable copy has no sibling files and is
// usually opened straight off disk, so it is exercised here over file://
// exactly as a recipient would open it.
import { existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const file = join(root, 'dist/prism.html');
let fail = 0; const ok = (c, n) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) fail++; };

if (!existsSync(file)) { console.log('FAIL dist/prism.html missing — run node build.mjs'); process.exit(1); }
const { chromium } = await import(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const page = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const errs = [];
page.on('pageerror', e => errs.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

ok(statSync(file).size < 16 * 1024 * 1024, `the bundle fits an artifact (${(statSync(file).size / 1048576).toFixed(1)} MB of 16)`);

await page.goto('file://' + file, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.cover, .hero', { timeout: 25000 });
await page.evaluate(() => Store.markToured());
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('.cover', { timeout: 25000 });
const n = await page.locator('.cover').count();
ok(n > 0, `the whole library renders from file:// (${n} courses)`);
ok(await page.evaluate(() => !!window.COURSES_FULL), 'card text is inlined, not fetched from a sibling file');

const [cid, lid] = await page.evaluate(() => [COURSES[0].id, COURSES[0].lessons[0].id]);
await page.evaluate(a => { location.hash = '#/lesson/' + a[0] + '/' + a[1]; }, [cid, lid]);
await page.waitForSelector('.card', { timeout: 10000 });
ok(await page.locator('.card').count() > 0, 'a lesson opens with no server');
for (let i = 0; i < 70; i++) {
  if (await page.locator('.done-card').count()) break;
  if (await page.locator('.choice:not([disabled])').count()) await page.locator('.choice:not([disabled])').first().click();
  else await page.keyboard.press('Enter');
  await page.waitForTimeout(140);
}
ok(await page.locator('.done-card').count() > 0, 'the lesson plays through to completion');

await page.evaluate(() => { location.hash = '#/search'; });
await page.waitForSelector('#search-in');
await page.fill('#search-in', 'entropy');
await page.waitForTimeout(280);
ok(await page.locator('.search-hit').count() > 0, 'search works offline in the bundle');
await page.evaluate(() => { location.hash = '#/stats'; });
await page.waitForTimeout(320);
ok(await page.locator('.badges').count() > 0, 'stats renders');
await page.evaluate(() => { location.hash = '#/paths'; });
await page.waitForTimeout(320);
ok(await page.locator('.path-card').count() > 0, 'learning paths render');
ok(errs.length === 0, 'no page or console errors' + (errs.length ? ': ' + errs[0] : ''));

await b.close();
console.log(fail ? `${fail} FAILED` : 'ALL PASS');
process.exit(fail ? 1 : 0);
