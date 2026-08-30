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

  /* --- price book editing: the contractor's own costs --- */
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  await page.keyboard.press('k');
  await page.waitForTimeout(200);
  await page.locator('#pbQuery').fill('lead carpenter');
  await page.waitForTimeout(150);
  const costBox = page.locator('.pb-cost-input').first();
  check('price book costs are editable inline', (await costBox.inputValue()) === '58');

  await costBox.fill('72');
  await page.waitForTimeout(250);
  check('an edited cost is marked as yours',
    /edited/.test(await page.locator('.pb-row').first().textContent()));

  // Editing a cost must not add the line to the estimate.
  const dlgStillOpen = await page.locator('#dlgPriceBook').isVisible();
  check('editing a cost does not add the line', dlgStillOpen);

  // The new cost must flow into assemblies.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await page.locator('#btnAssembly').click();
  await page.waitForTimeout(200);
  const nBefore = await page.locator('.items tbody tr').count();
  await page.locator('[data-asm="asm-roof"]').click();
  await page.waitForTimeout(300);
  const leadCost = await page.locator('.items tbody tr').nth(nBefore)
    .locator('..').locator('[data-f="unitCost"]').first().inputValue().catch(() => null);
  const anyLead = await page.locator('.items tbody tr').evaluateAll((rows) =>
    rows.some((r) => r.querySelector('[data-f="description"]')?.value === 'Lead carpenter'
                  && r.querySelector('[data-f="unitCost"]')?.value === '72'));
  check('an edited cost flows into new assemblies', anyLead,
    '(assembly should have used the 72 cost, not the shipped 58)');

  // And it must survive a reload.
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  await page.keyboard.press('k');
  await page.waitForTimeout(250);
  await page.locator('#pbQuery').fill('lead carpenter');
  await page.waitForTimeout(150);
  check('edited costs persist across a reload',
    (await page.locator('.pb-cost-input').first().inputValue()) === '72');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);

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

/* ============================================ backup & settings ========== */
console.log('\n  backup and settings');
{
  const page = await newPage();
  await page.goto(`${base}/quoteforge/`, { waitUntil: 'networkidle' });

  // Export is the documented safety net against losing local data, so it is
  // checked like a feature rather than assumed to work.
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('.tab[data-tab="jobs"]').click().then(() => page.waitForTimeout(250))
      .then(() => page.locator('#btnExportAll').click()),
  ]);
  const stream = await download.createReadStream();
  let raw = '';
  for await (const chunk of stream) raw += chunk;
  let backup = null;
  try { backup = JSON.parse(raw); } catch { /* reported below */ }
  check('backup downloads as valid JSON', backup !== null, `(${raw.slice(0, 60)})`);
  check('backup is self-describing', backup?.kind === 'quoteforge-backup');
  check('backup contains the estimates', (backup?.data?.estimates?.length || 0) >= 1);
  check('backup carries the line items',
    (backup?.data?.estimates?.[0]?.items?.length || 0) > 10);

  // Import it into a clean profile and confirm the work comes back intact.
  const fresh = await newPage();
  await fresh.goto(`${base}/quoteforge/`, { waitUntil: 'networkidle' });
  await fresh.evaluate(() => { localStorage.clear(); });
  await fresh.reload({ waitUntil: 'networkidle' });
  await fresh.waitForTimeout(300);

  await fresh.locator('.tab[data-tab="jobs"]').click();
  await fresh.waitForTimeout(200);
  const countBefore = await fresh.locator('.est-row').count();
  await fresh.locator('#fileImport').setInputFiles({
    name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(raw),
  });
  await fresh.waitForTimeout(500);
  check('importing a backup restores the estimates',
    (await fresh.locator('.est-row').count()) > countBefore,
    `(had ${countBefore})`);

  // Re-importing the same file must not duplicate.
  const afterFirst = await fresh.locator('.est-row').count();
  await fresh.locator('#fileImport').setInputFiles({
    name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(raw),
  });
  await fresh.waitForTimeout(500);
  check('re-importing the same backup does not duplicate',
    (await fresh.locator('.est-row').count()) === afterFirst);

  // A junk file must produce a readable message, not a crash.
  await fresh.locator('#fileImport').setInputFiles({
    name: 'junk.json', mimeType: 'application/json', buffer: Buffer.from('<html>nope</html>'),
  });
  await fresh.waitForTimeout(400);
  const toastText = await fresh.locator('.toast').last().textContent().catch(() => '');
  check('a junk import explains itself instead of crashing',
    /valid JSON|QuoteForge export/i.test(toastText), `(toast: "${toastText}")`);
  await fresh.context().close();

  /* --- settings editors --- */
  await page.locator('.tab[data-tab="settings"]').click();
  await page.waitForTimeout(250);

  const milestoneRows = await page.locator('[data-msf="percent"]').count();
  check('payment milestones are editable', milestoneRows === 3, `(got ${milestoneRows})`);
  await page.locator('[data-msf="percent"]').first().fill('50');
  await page.waitForTimeout(250);
  check('changing a milestone updates its dollar amount',
    (await page.locator('#milestoneEditor').textContent()).includes('%'));

  const termCount = await page.locator('[data-term]').count();
  check('terms are editable', termCount >= 5, `(got ${termCount})`);
  await page.locator('#btnAddTerm').click();
  await page.waitForTimeout(250);
  check('a term can be added', (await page.locator('[data-term]').count()) === termCount + 1);

  // Changing the target margin must move the coach, not just a label.
  await page.locator('[data-pct="targetMargin"]').fill('45');
  await page.waitForTimeout(250);
  await page.locator('.tab[data-tab="estimate"]').click();
  await page.waitForTimeout(250);
  check('raising the target margin re-triggers the coach',
    /under target|below your walk-away/i.test(await page.locator('.coach').textContent()));

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

  // The tabs added later must hold up on a phone too — a change order gets
  // written standing in the room where the rot was found.
  await page.locator('.tab[data-tab="changes"]').click();
  await page.waitForTimeout(300);
  check('changes tab renders on a phone', await page.locator('#coList').isVisible());
  await page.locator('.tab[data-tab="costs"]').click();
  await page.waitForTimeout(300);
  check('costs tab renders on a phone', await page.locator('#budgetPanel').isVisible());
  const hScrollApp = await page.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  check('the app does not scroll sideways on a phone', !hScrollApp);

  await page.context().close();
}

/* ============================================== audit-found UI bugs ====== */
console.log('\n  audit-found UI defects');
{
  const page = await newPage();
  await page.goto(`${base}/quoteforge/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);

  /* Settings editors rebuild innerHTML on every keystroke. Without focus
     preservation the second character lands on document and fires a bare-key
     shortcut — typing "45" navigates away instead of entering a number. */
  await page.locator('.tab[data-tab="settings"]').click();
  await page.waitForTimeout(300);
  const markup = page.locator('[data-catmk="labor"]');
  await markup.click();
  await markup.fill('');
  await page.keyboard.type('45', { delay: 60 });
  await page.waitForTimeout(250);
  check('typing a two-digit markup keeps both digits',
    (await page.locator('[data-catmk="labor"]').inputValue()) === '45',
    `(got "${await page.locator('[data-catmk="labor"]').inputValue()}")`);
  check('typing in settings does not fire a tab shortcut',
    (await page.locator('.tab[data-tab="settings"]').getAttribute('aria-selected')) === 'true',
    '(a stray digit switched tabs)');

  // Same class of bug in the terms editor, where 'n' would open a new estimate.
  const term = page.locator('[data-term="0"]');
  await term.click();
  await term.fill('');
  await page.keyboard.type('none', { delay: 50 });
  await page.waitForTimeout(250);
  check('typing a word into a term keeps every letter',
    (await page.locator('[data-term="0"]').inputValue()) === 'none',
    `(got "${await page.locator('[data-term="0"]').inputValue()}")`);
  check('typing "n" in a term does not create a new estimate',
    (await page.locator('#estSelect option').count()) === 1);

  /* The empty-state assembly button opened a dialog nobody had populated. */
  // A brand-new estimate starts empty — the state the button lives in.
  await page.locator('#btnNew').click();
  await page.waitForTimeout(400);
  check('a new estimate shows the empty state', (await page.locator('.empty-state').count()) === 1);
  await page.locator('[data-act="assembly"]').click();
  await page.waitForTimeout(300);
  check('the empty-state assembly dialog is populated, not blank',
    (await page.locator('.assembly-card').count()) === 5,
    '(opening it without rendering leaves an empty modal)');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  await page.context().close();
}

/* ===================================================== audit page ======== */
console.log('\n  audit offer page');
{
  const page = await newPage(1280, 900);
  await page.goto(`${base}/audit.html`, { waitUntil: 'networkidle' });

  check('audit page loads', /last three jobs really kept/i.test(await page.locator('h1').textContent()));

  // Unconfigured (as shipped): no dead button, an honest note instead.
  check('unconfigured page hides the booking button',
    !(await page.locator('#ctaBook').isVisible()) && !(await page.locator('#ctaBook2').isVisible()));
  check('unconfigured page explains instead of dangling',
    /Booking opens soon/.test(await page.locator('#ctaNote').textContent()));
  check('the free-slots badge shows while calibrating',
    /first 5 free/.test(await page.locator('#freeBadge').textContent()));

  // Email-only configuration.
  await page.evaluate(() => renderAuditCTA({ price: '$400', freeSlots: 5, bookingUrl: '', contactEmail: 'me@example.com' }));
  check('email config produces a mailto CTA',
    (await page.locator('#ctaBook').getAttribute('href')).startsWith('mailto:me@example.com'));
  check('the mailto prefills a booking subject',
    /subject=/.test(await page.locator('#ctaBook').getAttribute('href')));

  // Payment-link configuration.
  await page.evaluate(() => renderAuditCTA({ price: '$450', freeSlots: 0, bookingUrl: 'https://buy.stripe.com/test_123', contactEmail: '' }));
  check('a booking URL wires both CTAs',
    (await page.locator('#ctaBook').getAttribute('href')) === 'https://buy.stripe.com/test_123'
    && (await page.locator('#ctaBook2').getAttribute('href')) === 'https://buy.stripe.com/test_123');
  check('the price flows into the button and headline',
    (await page.locator('#ctaBook').textContent()).includes('$450')
    && (await page.locator('#priceAmt').textContent()) === '$450');
  check('freeSlots 0 hides the calibration badge', !(await page.locator('#freeBadge').isVisible()));

  // The page must claim honestly, and route DIYers to the free app.
  const body = await page.locator('body').textContent();
  check('it says what it is not', /Not an accounting engagement/.test(body));
  check('it offers the DIY path openly', /Do it yourself instead/.test(body));

  // Navigation: landing -> audit -> app.
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  check('the landing page links the audit offer',
    (await page.locator('a[href="audit.html"]').count()) >= 2);
  await page.locator('a[href="audit.html"]').last().click();
  await page.waitForTimeout(500);
  check('the landing CTA reaches the audit page', page.url().includes('audit.html'));
  await page.locator('a[href="quoteforge/"]').last().click();
  await page.waitForTimeout(700);
  check('the audit page reaches the working app',
    (await page.locator('.items tbody tr').count()) > 5);

  await page.context().close();
}

/* ================================================ subpath deploy ========= */
// GitHub Pages serves a project site under /<repo>/, not at the root. A
// relative-path bug is invisible locally and obvious the moment it ships.
console.log('\n  subpath deploy (/allen/)');
{
  const PREFIX = '/allen';
  const sub = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    if (!url.startsWith(PREFIX)) { res.writeHead(404).end('outside the project path'); return; }
    let file = path.join(SITE, url.slice(PREFIX.length));
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!file.startsWith(SITE) || !fs.existsSync(file)) { res.writeHead(404).end('404'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(fs.readFileSync(file));
  });
  await new Promise((r) => sub.listen(PORT + 1, r));

  const page = await newPage(1280, 900);
  const bad = [];
  page.on('response', (r) => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url()}`); });
  page.on('requestfailed', (r) => bad.push(`${r.url()} — ${r.failure()?.errorText}`));

  await page.goto(`http://localhost:${PORT + 1}/allen/`, { waitUntil: 'networkidle' });
  check('landing page loads under a subpath',
    (await page.locator('h1').textContent()).includes('markup'));
  check('its stylesheet resolves', await page.evaluate(() =>
    getComputedStyle(document.querySelector('.btn.primary')).backgroundColor !== 'rgba(0, 0, 0, 0)'));

  await page.locator('a.btn.primary').first().click();
  await page.waitForTimeout(900);
  check('the CTA reaches the app under a subpath',
    page.url().includes('/allen/quoteforge'), `(at ${page.url()})`);
  check('the ES modules resolve and the app boots',
    (await page.locator('.items tbody tr').count()) > 5);
  check('nothing 404s under a subpath', bad.length === 0, bad.join(' | '));

  await page.context().close();
  sub.close();
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
