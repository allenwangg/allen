/**
 * mobile.mjs — the whole funnel, on a phone.
 *
 * Run with:  node quoteforge/test/mobile.mjs
 *
 * The contractor fills the intake form on their phone in a truck; you paste it
 * on whatever you have; the change order gets written and signed at a kitchen
 * table on a phone. The desktop suites cannot see a form that scrolls sideways,
 * a delete button that only appears on hover, or a topbar that eats a fifth
 * of the screen. Every check here was a real defect at 390px.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

async function loadChromium() {
  for (const spec of ['playwright', '/opt/node22/lib/node_modules/playwright/index.mjs']) {
    try { return (await import(spec)).chromium; } catch { /* next */ }
  }
  console.error('Could not find playwright.'); process.exit(2);
}
const chromium = await loadChromium();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.resolve(HERE, '../..');
const EXEC = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = Number(process.env.PORT || 8794);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  let file = path.join(SITE, decodeURIComponent(req.url.split('?')[0]));
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!file.startsWith(SITE) || !fs.existsSync(file)) { res.writeHead(404).end('not found'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  res.end(fs.readFileSync(file));
});
await new Promise((r) => server.listen(PORT, r));
const base = `http://localhost:${PORT}`;

let pass = 0, fail = 0; const failures = []; const errors = [];
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ok    ${name}`); }
  else { fail++; failures.push(`${name} ${extra}`); console.log(`  FAIL  ${name} ${extra}`); }
};

const browser = await chromium.launch({ executablePath: EXEC });
// A real phone: narrow, touch, coarse pointer, no hover, 2x pixels.
const W = 390, H = 844;
const ctx = await browser.newContext({
  viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
});
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

/* Layout probes, evaluated in the page. */
const noSidewaysScroll = () => page.evaluate(() =>
  document.scrollingElement.scrollWidth <= innerWidth + 1 && innerWidth <= 391);
const smallTargets = (sel) => page.evaluate((sel) => [...document.querySelectorAll(sel)]
  .filter((el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    return r.width > 0 && cs.visibility !== 'hidden' && (r.height < 24 || r.width < 24); })
  .map((el) => `${el.tagName.toLowerCase()}#${el.id || ''} ${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`), sel);
const zoomingInputs = () => page.evaluate(() => [...document.querySelectorAll('input,select,textarea')]
  .filter((el) => el.getBoundingClientRect().width > 0 && el.type !== 'range' && el.type !== 'checkbox'
    && parseFloat(getComputedStyle(el).fontSize) < 16)
  .map((el) => `${el.tagName.toLowerCase()}#${el.id || el.dataset.cof || el.dataset.cif || ''} ${getComputedStyle(el).fontSize}`));
const stickyChrome = () => page.evaluate(() => [...document.querySelectorAll('.topbar,.tabs')]
  .reduce((h, el) => h + el.getBoundingClientRect().height, 0));

/* ===================================================== landing & offer === */
console.log('\n  landing and offer on a phone');
await page.goto(`${base}/`, { waitUntil: 'networkidle' });
check('the landing page does not scroll sideways', await noSidewaysScroll());
check('the primary CTA is reachable without scrolling sideways',
  await page.evaluate(() => { const r = document.querySelector('a.btn.primary').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; }));
await page.goto(`${base}/audit.html`, { waitUntil: 'networkidle' });
check('the offer page does not scroll sideways', await noSidewaysScroll());
check('the offer CTA is thumb-sized', (await smallTargets('#auditCta a, #auditCta button, a.btn')).length === 0);

/* ================================================== contractor intake ===== */
console.log('\n  the contractor fills the form in a truck');
await page.goto(`${base}/quoteforge/intake.html`, { waitUntil: 'networkidle' });
await page.locator('#fTitle').fill('Kitchen — Alder St');
await page.locator('#fQuoted').fill('42000');
await page.locator('[data-budget="labor"]').fill('12000');
await page.locator('[data-budget="material"]').fill('9000');
await page.locator('[data-spent="labor"]').fill('15200');
await page.locator('[data-spent="material"]').fill('9400');
await page.locator('#btnAddChange').click();
await page.locator('[data-ctitle]').first().fill('Rot under tub');
await page.locator('[data-camount]').first().fill('2400');
await page.waitForTimeout(300);
check('the intake form does not scroll sideways with a change row open', await noSidewaysScroll(),
  '(two 1fr tracks let the inputs push the row 22px past the screen)');
check('no intake field is small enough to make iOS zoom on focus',
  (await zoomingInputs()).length === 0, (await zoomingInputs()).join(', '));
check('the "they signed" checkbox is big enough to tap',
  (await smallTargets('[data-csigned]')).length === 0, (await smallTargets('[data-csigned]')).join(', '));
check('the remove button on a change row is visible without hover',
  await page.locator('[data-del]').first().isVisible());
await page.locator('#btnFinish').tap();
await page.waitForTimeout(400);
const link = await page.locator('#outLink').inputValue();
check('finishing produces the link', link.includes('#j='));
check('the done pane fits the screen', await noSidewaysScroll());

/* ============================================ audit built from the link === */
console.log('\n  you paste the link and build the audit');
await page.goto(`${base}/quoteforge/`, { waitUntil: 'networkidle' });
check('the app does not scroll sideways', await noSidewaysScroll());
const chrome = await stickyChrome();
check('sticky chrome takes at most a sixth of the screen', chrome <= H / 6, `(${chrome}px of ${H})`);
check('the estimate picker and "Audit a job" are on screen',
  await page.locator('#btnAudit').isVisible() && await page.locator('#estSelect').isVisible());
check('keyboard-shortcut help is not offered on a touch phone',
  !(await page.locator('#btnHelp').isVisible()));
check('nothing in the topbar is a sub-24px target',
  (await smallTargets('.topbar button, .topbar select')).length === 0,
  (await smallTargets('.topbar button, .topbar select')).join(', '));
check('line-row tools are visible without hover (a finger cannot hover)',
  await page.evaluate(() => getComputedStyle(document.querySelector('.items .row-tools')).opacity === '1'));
check('the tab strip scrolls sideways so every tab is reachable',
  await page.evaluate(() => { const t = document.querySelector('.tabs'); return t.scrollWidth > t.clientWidth && getComputedStyle(t).overflowX === 'auto'; }));
await page.evaluate(() => document.querySelector('.tabs').scrollTo({ left: 9999 }));
check('the last tab can be scrolled into view',
  await page.evaluate(() => document.querySelector('.tab[data-tab="settings"]').getBoundingClientRect().right <= innerWidth + 1));

await page.locator('#btnAudit').tap();
await page.waitForTimeout(300);
check('the audit dialog fits the screen',
  await page.evaluate(() => { const r = document.querySelector('#dlgAudit').getBoundingClientRect(); return r.width <= innerWidth && r.height <= innerHeight; }));
await page.locator('#aPaste').fill(link);
await page.waitForTimeout(500);
check('pasting the link fills the form', await page.evaluate(() => Number(document.querySelector('#dlgAudit [data-budget="labor"]')?.value) === 12000));
check('the change row inside the dialog fits',
  await page.evaluate(() => [...document.querySelectorAll('#dlgAudit .change-row *')].every((el) => el.getBoundingClientRect().right <= innerWidth + 1)));
await page.locator('#btnBuildAudit').tap();
await page.waitForTimeout(600);
check('the audit job is built', /Kitchen/.test(await page.locator('#estSelect option:checked').textContent()));
check('the costs pane does not scroll sideways', await noSidewaysScroll());
check('no app field is small enough to make iOS zoom on focus',
  (await zoomingInputs()).length === 0, (await zoomingInputs()).slice(0, 6).join(', '));

/* ============================================ change order on a phone ===== */
console.log('\n  a change order written and signed at the kitchen table');
await page.locator('.tab[data-tab="changes"]').tap();
await page.waitForTimeout(300);
await page.locator('#btnAddCO').tap();
await page.waitForTimeout(300);
await page.locator('[data-cof="title"]').fill('Rotten subfloor at tub wall');
await page.locator('[data-cof="reason"]').fill('Demolition exposed water damage to the subfloor and two joists.');
await page.locator('[data-coadd]').tap();
await page.waitForTimeout(250);
await page.locator('[data-cif="description"]').first().fill('Sister joists');
await page.locator('[data-cif="qty"]').first().fill('6');
await page.locator('[data-cif="unitCost"]').first().fill('85');
await page.waitForTimeout(300);
check('the change order editor does not scroll the page sideways', await noSidewaysScroll());
check('the line grid scrolls inside its own container',
  await page.evaluate(() => getComputedStyle(document.querySelector('#coEditor')).overflowX === 'auto'));
check('the status buttons are thumb-sized',
  (await smallTargets('[data-costatus]')).length === 0, (await smallTargets('[data-costatus]')).join(', '));
check('the order prices on a phone', /\+\$[1-9]/.test(await page.locator('.co-row .amt').last().textContent()));

await page.locator('[data-cosign]').tap();
await page.waitForTimeout(350);
const sbox = await page.locator('#sigPad').boundingBox();
check('the signature pad fits the screen', sbox && sbox.x >= 0 && sbox.x + sbox.width <= W + 1, JSON.stringify(sbox));
// Sign with a finger: a touchscreen sends pointer events with pointerType touch,
// and the page must not scroll while the finger is on the pad.
await page.touchscreen.tap(sbox.x + 30, sbox.y + 90);
await page.evaluate(({ x, y }) => {
  const c = document.querySelector('#sigPad');
  const ev = (type, px, py) => c.dispatchEvent(new PointerEvent(type, { pointerType: 'touch', pointerId: 7, isPrimary: true, clientX: px, clientY: py, bubbles: true, buttons: 1 }));
  ev('pointerdown', x + 30, y + 90);
  for (let i = 0; i < 30; i++) ev('pointermove', x + 30 + i * 8, y + 90 - Math.sin(i / 3) * 30);
  ev('pointerup', x + 270, y + 90);
}, { x: sbox.x, y: sbox.y });
check('the pad refuses to let the page scroll under a finger',
  await page.evaluate(() => getComputedStyle(document.querySelector('#sigPad')).touchAction === 'none'));
await page.locator('#btnSigSave').tap();
await page.waitForTimeout(400);
check('a touch signature approves the change order',
  (await page.locator('.co-row').last().getAttribute('class')).includes('approved'));
check('the signature lands on the authorization document',
  (await page.locator('#coPrint .sign-line img').count()) === 1);

/* =============================================== the rest of the tabs ===== */
console.log('\n  every pane fits');
for (const tab of ['costs', 'jobs', 'settings', 'proposal', 'estimate']) {
  await page.evaluate(() => document.querySelector('.tabs').scrollTo({ left: 9999 }));
  await page.locator(`.tab[data-tab="${tab}"]`).tap();
  await page.waitForTimeout(250);
  check(`${tab} pane does not scroll sideways`, await noSidewaysScroll());
}

/* ========================================================= report ======== */
console.log(`\n  mobile suite: ${pass} passed, ${fail} failed`);
if (errors.length) { console.log('\n  RUNTIME ERRORS:'); [...new Set(errors)].forEach((e) => console.log(`    ${e}`)); }
await browser.close();
server.close();
process.exit(fail || errors.length ? 1 : 0);
