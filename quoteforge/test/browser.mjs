/**
 * browser.mjs — end-to-end suite driving the real app in a real browser.
 *
 * Run with:  node quoteforge/test/browser.mjs
 * Requires playwright and a chromium build. Set CHROMIUM to override the path.
 *
 * These exist because the unit suites cannot see the failures that actually
 * make the product unusable or embarrassing: a grid that eats keystrokes, a
 * proposal that leaks your cost to the client, a print layout that wastes a
 * page. Every check below corresponds to a bug that was real at some point.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Playwright may be installed locally or globally. ESM ignores NODE_PATH, so
 * resolve it explicitly rather than failing with an unhelpful module error.
 */
async function loadChromium() {
  const candidates = [
    'playwright',
    '/opt/node22/lib/node_modules/playwright/index.mjs',
    `${process.env.npm_config_prefix || '/usr/local'}/lib/node_modules/playwright/index.mjs`,
  ];
  for (const spec of candidates) {
    try { return (await import(spec)).chromium; } catch { /* try the next */ }
  }
  console.error(
    'Could not find playwright. Install it (npm i -D playwright) or set '
    + 'NODE_PATH-independent resolution by running from a directory that has it.',
  );
  process.exit(2);
}
const chromium = await loadChromium();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.resolve(HERE, '../..');          // repo root: serves / and /quoteforge/
const EXEC = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = Number(process.env.PORT || 8790);

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
};

const server = http.createServer((req, res) => {
  let file = path.join(SITE, decodeURIComponent(req.url.split('?')[0]));
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!file.startsWith(SITE) || !fs.existsSync(file)) { res.writeHead(404).end('not found'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  res.end(fs.readFileSync(file));
});
await new Promise((r) => server.listen(PORT, r));
const base = `http://localhost:${PORT}`;

let pass = 0, fail = 0;
const failures = [];
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ok    ${name}`); }
  else { fail++; failures.push(`${name} ${extra}`); console.log(`  FAIL  ${name} ${extra}`); }
};

const browser = await chromium.launch({ executablePath: EXEC });
const errors = [];

async function newPage(w = 1440, h = 950) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  return page;
}

/* ===================================================== estimator ========= */
console.log('\n  estimator');
{
  const page = await newPage();
  await page.goto(`${base}/quoteforge/`, { waitUntil: 'networkidle' });

  check('sample estimate seeds line items', (await page.locator('.items tbody tr').count()) > 10);
  const total0 = await page.locator('.figure.total .value').textContent();
  check('a total is computed', /\$[\d,]+/.test(total0));
  check('the margin coach is actionable', (await page.locator('.coach').textContent()).trim().length > 40);

  await page.locator('.items tbody tr').first().locator('[data-f="qty"]').fill('99');
  await page.waitForTimeout(120);
  check('editing a quantity changes the total',
    (await page.locator('.figure.total .value').textContent()) !== total0);

  // A grid that loses the caret on every keystroke is unusable on a job site.
  const qty = page.locator('.items tbody tr').first().locator('[data-f="qty"]');
  await qty.click();
  await qty.press('Backspace');
  await page.waitForTimeout(80);
  check('focus stays in the cell while typing',
    (await page.evaluate(() => document.activeElement?.dataset?.f)) === 'qty');

  const before = await page.locator('.gauge-legend strong').textContent();
  await page.locator('[data-fix="lift"]').click();
  await page.waitForTimeout(200);
  const after = await page.locator('.gauge-legend strong').textContent();
  const target = await page.locator('.gauge-legend span:last-child').textContent();
  check('reprice-to-target moves the margin', before !== after, `(${before} -> ${after})`);
  check('reprice lands on the target margin',
    Math.abs(parseFloat(after) - parseFloat(target.replace(/[^\d.]/g, ''))) < 0.6,
    `(landed ${after}, target ${target})`);
  // Pass-through lines must survive a reprice at zero markup.
  const zeroMarkupLines = await page.locator('.items tbody [data-f="markup"]')
    .evaluateAll((els) => els.filter((e) => e.value === '0').length);
  check('reprice leaves pass-through lines at cost', zeroMarkupLines >= 1,
    `(found ${zeroMarkupLines} zero-markup lines)`);

  await page.keyboard.press('k');
  await page.waitForTimeout(150);
  check('price book opens on K', await page.locator('#dlgPriceBook').isVisible());
  await page.locator('#pbQuery').fill('tile');
  await page.waitForTimeout(120);
  check('price book search finds tile items', (await page.locator('.pb-row').count()) >= 2);
  const n0 = await page.locator('.items tbody tr').count();
  await page.locator('.pb-row').first().click();
  await page.waitForTimeout(200);
  check('clicking a price book row adds a line', (await page.locator('.items tbody tr').count()) === n0 + 1);

  await page.locator('#btnAssembly').click();
  await page.waitForTimeout(150);
  check('assemblies are listed', (await page.locator('.assembly-card').count()) === 5);
  const n1 = await page.locator('.items tbody tr').count();
  await page.locator('[data-asm="asm-deck"]').click();
  await page.waitForTimeout(250);
  check('an assembly adds its whole scope', (await page.locator('.items tbody tr').count()) > n1 + 5);

  await page.keyboard.press('Control+z');
  await page.waitForTimeout(200);
  check('undo removes the whole assembly', (await page.locator('.items tbody tr').count()) === n1);

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(250);
  check('work survives a reload', (await page.locator('.items tbody tr').count()) > 10);

  await page.locator('.tab[data-tab="jobs"]').click();
  await page.waitForTimeout(200);
  check('jobs dashboard shows pipeline stats', (await page.locator('.stat').count()) === 4);

  await page.locator('.tab[data-tab="settings"]').click();
  await page.waitForTimeout(200);
  check('settings shows the markup needed for the target',
    /markup/i.test(await page.locator('#targetHint').textContent()));
  check('category markup editors render', (await page.locator('[data-catmk]').count()) === 5);

  await page.context().close();
}

/* ====================================================== proposal ========= */
console.log('\n  proposal');
{
  const page = await newPage();
  await page.goto(`${base}/quoteforge/`, { waitUntil: 'networkidle' });
  await page.locator('.tab[data-tab="proposal"]').click();
  await page.waitForTimeout(300);

  const text = await page.locator('#proposal').textContent();
  check('renders scope, schedule, and acceptance',
    text.includes('Included work') && text.includes('Payment schedule') && text.includes('Acceptance'));
  check('never leaks cost, markup, margin, or contingency to the client',
    !/margin|markup|overhead|contingency/i.test(text));
  check('shows optional upgrades separately', text.includes('Optional upgrades'));
  check('shows the job site address', text.includes('Alder Street'));

  const heads = await page.locator('.group-head td').allTextContents();
  check('groups by trade', heads.includes('Tile') && heads.includes('Electrical'), `(${heads.join(', ')})`);
  check('never labels work "Subcontractor" to the client',
    !heads.some((h) => /subcontractor/i.test(h)));

  // Signature capture.
  await page.locator('#btnSign').click();
  await page.waitForTimeout(300);
  check('signed-by prefills from the client name',
    (await page.locator('#sigName').inputValue()) === 'Sample Client');
  await page.locator('#btnSigSave').click();
  await page.waitForTimeout(200);
  check('refuses to save an empty signature', await page.locator('#dlgSign').isVisible());

  const box = await page.locator('#sigPad').boundingBox();
  await page.mouse.move(box.x + 40, box.y + 110);
  await page.mouse.down();
  for (let i = 0; i < 40; i++) await page.mouse.move(box.x + 40 + i * 7, box.y + 110 - Math.sin(i / 4) * 38);
  await page.mouse.up();
  await page.locator('#btnSigSave').click();
  await page.waitForTimeout(350);

  const dims = await page.locator('.sign-line img').evaluate((el) => ({ w: el.naturalWidth, h: el.naturalHeight }));
  check('signature renders with real pixels', dims.w > 100 && dims.h > 50, JSON.stringify(dims));
  check('acceptance date is recorded',
    /Accepted \w+ \d+, \d{4}/.test(await page.locator('.pr-section').last().textContent()));

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  await page.locator('.tab[data-tab="jobs"]').click();
  await page.waitForTimeout(250);
  check('signing marks the job accepted and persists',
    (await page.locator('.status-select').first().inputValue()) === 'accepted');

  // Print is the delivery mechanism, so it gets checked like a feature.
  await page.locator('.tab[data-tab="proposal"]').click();
  await page.waitForTimeout(250);
  const pdf = await page.pdf({ format: 'Letter', printBackground: true,
    margin: { top: '0.5in', bottom: '0.5in', left: '0.5in', right: '0.5in' } });
  check('print produces a real PDF', pdf.length > 20000, `(${pdf.length} bytes)`);

  await page.context().close();
}

/* ======================================================= landing ========= */
console.log('\n  landing page');
{
  const page = await newPage(1280, 900);
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  const read = async () => ({
    quote: await page.locator('#rQuote').textContent(),
    margin: await page.locator('#rMargin').textContent(),
    needed: await page.locator('#rNeeded').textContent(),
    gap: await page.locator('#rGap').textContent(),
  });

  check('loads', (await page.locator('h1').textContent()).includes('20% markup'));
  let r = await read();
  check('quote = cost x 1.20', r.quote === '$38,400', `(${r.quote})`);
  check('20% markup shows as 16.7% margin', r.margin === '16.7%', `(${r.margin})`);
  check('price for a 25% margin is cost/0.75', r.needed === '$42,667', `(${r.needed})`);
  check('annual gap = (needed - quote) x jobs', r.gap === '$51,200', `(${r.gap})`);

  await page.locator('#cMarkup').fill('40');
  await page.waitForTimeout(80);
  r = await read();
  check('40% markup clears a 25% target', r.margin === '28.6%', `(${r.margin})`);
  check('gap goes to zero above target', r.gap === '$0', `(${r.gap})`);
  check('verdict turns positive on target',
    (await page.locator('#verdict').getAttribute('class')).includes('good'));

  await page.locator('#cCost').fill('0');
  await page.waitForTimeout(80);
  r = await read();
  check('zero cost does not produce NaN',
    !/NaN|Infinity/.test(Object.values(r).join('')), JSON.stringify(r));

  await page.locator('#cCost').fill('32000');
  await page.locator('#cTarget').fill('60');
  await page.waitForTimeout(80);
  check('a 60% target stays finite', (await page.locator('#rNeeded').textContent()) === '$80,000');

  await page.locator('a.btn.primary').first().click();
  await page.waitForTimeout(700);
  check('CTA reaches a working app',
    page.url().includes('quoteforge') && (await page.locator('.items tbody tr').count()) > 5);

  await page.context().close();
}

/* ======================================================== mobile ========= */
console.log('\n  mobile (390x844)');
{
  const page = await newPage(390, 844);
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  const hScroll = await page.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  check('landing page does not scroll sideways', !hScroll);

  await page.goto(`${base}/quoteforge/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  check('app renders its line grid on a phone', (await page.locator('.items tbody tr').count()) > 5);
  check('profit panel is reachable on a phone', await page.locator('#profitPanel').isVisible());
  await page.context().close();
}

/* ========================================================= report ======== */
console.log(`\n  browser suite: ${pass} passed, ${fail} failed`);
if (errors.length) {
  console.log('\n  RUNTIME ERRORS:');
  [...new Set(errors)].forEach((e) => console.log(`    ${e}`));
}
await browser.close();
server.close();
process.exit(fail || errors.length ? 1 : 0);
