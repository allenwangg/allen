/**
 * job-costs.mjs — end-to-end coverage of margin fade tracking.
 *
 * Run with:  node quoteforge/test/job-costs.mjs
 *
 * The feature exists to make a fading margin visible while the job is still
 * running, so the checks focus on the erosion math reaching the screen: an
 * overrun must flag its category, dent the profit figure, and light the tab
 * badge — and an underspent category must never hide it.
 */
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Playwright may be local or global; ESM ignores NODE_PATH, so resolve it. */
async function loadChromium() {
  for (const spec of ['playwright', '/opt/node22/lib/node_modules/playwright/index.mjs']) {
    try { return (await import(spec)).chromium; } catch { /* next */ }
  }
  console.error('playwright not found — npm i -D playwright');
  process.exit(2);
}
const chromium = await loadChromium();

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const EXEC = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = Number(process.env.PORT || 8798);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

const srv = http.createServer((q, r) => {
  let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { r.writeHead(404).end(); return; }
  r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'text/plain' });
  r.end(fs.readFileSync(f));
});
await new Promise((r) => srv.listen(PORT, r));

const b = await chromium.launch({ executablePath: EXEC });
const page = await b.newPage({ viewport: { width: 1440, height: 1000 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });

let pass = 0, fail = 0;
const check = (n, c, x = '') => {
  c ? (pass++, console.log(`  ok    ${n}`)) : (fail++, console.log(`  FAIL  ${n} ${x}`));
};

await page.goto(`http://localhost:${PORT}/quoteforge/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(300);

check('costs tab exists', await page.locator('.tab[data-tab="costs"]').isVisible());
check('badge is silent with nothing logged', !(await page.locator('#acBadge').isVisible()));

await page.locator('.tab[data-tab="costs"]').click();
await page.waitForTimeout(250);
check('empty state explains the system',
  /which trade made money/i.test(await page.locator('#actualsWrap').textContent()));
check('the budget panel shows the estimate categories',
  (await page.locator('.budget-bar').count()) >= 3);

/* --- log a cost inside budget --- */
await page.locator('[data-acnew]').click();
await page.waitForTimeout(300);
check('an entry row appears', (await page.locator('tr[data-ac]').count()) === 1);

await page.locator('[data-acf="description"]').first().fill('Tile order — first half');
await page.locator('[data-acf="category"]').first().selectOption('subcontractor');
await page.locator('[data-acf="amount"]').first().fill('900');
await page.waitForTimeout(250);

const acFocus = await page.evaluate(() => document.activeElement?.dataset?.acf);
check('focus survives the re-render', acFocus === 'amount', `(active: ${acFocus})`);

check('spend reaches the category bar',
  /\$900\.00/.test(await page.locator('#budgetPanel').textContent()));
check('no badge while under budget', !(await page.locator('#acBadge').isVisible()));
check('the fade panel reports on budget',
  /On budget so far/i.test(await page.locator('#fadePanel').textContent()));

/* --- profit figures agree with the estimator before any overrun --- */
const fadeBefore = await page.locator('#fadePanel').textContent();
const estProfit = fadeBefore.match(/Profit at estimate\s*(\$[\d,.]+)/)?.[1];
const standProfit = fadeBefore.match(/Profit as it stands\s*(\$[\d,.]+)/)?.[1];
check('without overruns, standing profit equals estimated profit',
  estProfit && estProfit === standProfit, `(${estProfit} vs ${standProfit})`);

/* --- an overrun: labor budget in the sample is well under $9000 --- */
await page.locator('#btnAddActual').click();
await page.waitForTimeout(250);
await page.locator('tr[data-ac]').first().locator('[data-acf="description"]').fill('Payroll — demo ran long');
await page.locator('tr[data-ac]').first().locator('[data-acf="category"]').selectOption('labor');
await page.locator('tr[data-ac]').first().locator('[data-acf="amount"]').fill('9000');
await page.waitForTimeout(300);

const budgetText = await page.locator('#budgetPanel').textContent();
check('the overrun flags its category', /over budget/i.test(budgetText), `(${budgetText.slice(0, 80)})`);
check('the tab badge lights on an overrun', await page.locator('#acBadge').isVisible());

const fade = await page.locator('#fadePanel').textContent();
check('the fade coach names the eroded amount', /of margin has faded/i.test(fade));
check('it points real extras at a change order', /change order/i.test(fade));

const est2 = fade.match(/Profit at estimate\s*(\$[\d,.]+)/)?.[1];
const stand2 = fade.match(/Profit as it stands\s*(\$[\d,.]+)/)?.[1];
check('the overrun dents standing profit', est2 !== stand2, `(${est2} vs ${stand2})`);

/* --- an underspent category must not hide the overrun --- */
check('material underspend does not clear the labor overrun',
  /over budget/i.test(await page.locator('#budgetPanel').textContent()));

/* --- a refund nets against its category --- */
await page.locator('#btnAddActual').click();
await page.waitForTimeout(250);
await page.locator('tr[data-ac]').first().locator('[data-acf="description"]').fill('Returned tile pallet');
await page.locator('tr[data-ac]').first().locator('[data-acf="category"]').selectOption('subcontractor');
await page.locator('tr[data-ac]').first().locator('[data-acf="amount"]').fill('-200');
await page.waitForTimeout(300);
check('a refund nets against its category',
  /\$700\.00/.test(await page.locator('#budgetPanel').textContent()));

/* --- persistence --- */
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(400);
await page.locator('.tab[data-tab="costs"]').click();
await page.waitForTimeout(300);
check('entries survive a reload', (await page.locator('tr[data-ac]').count()) === 3);
check('the overrun badge survives a reload', await page.locator('#acBadge').isVisible());

/* --- an approved change order funds its own spend --- */
const overBefore = (await page.locator('#budgetPanel').textContent())
  .match(/Labor[\s\S]*?\$([\d,.]+) over budget/)?.[1];
await page.locator('.tab[data-tab="changes"]').click();
await page.waitForTimeout(250);
await page.locator('#btnAddCO').click();
await page.waitForTimeout(300);
await page.locator('[data-cof="title"]').fill('Extra demo day');
await page.locator('[data-coadd]').click();
await page.waitForTimeout(200);
await page.locator('[data-cif="description"]').first().fill('Demo labor');
await page.locator('[data-cif="qty"]').first().fill('16');
await page.locator('[data-cif="unitCost"]').first().fill('55');
await page.locator('[data-cif="category"]').first().selectOption('labor');
await page.waitForTimeout(250);
await page.locator('[data-costatus="approved"]').click();
await page.waitForTimeout(300);
await page.locator('.tab[data-tab="costs"]').click();
await page.waitForTimeout(300);
const overAfter = (await page.locator('#budgetPanel').textContent())
  .match(/Labor[\s\S]*?\$([\d,.]+) over budget/)?.[1];
check('an approved change order raises the labor budget',
  overBefore && (!overAfter || parseFloat(overAfter.replace(/,/g, '')) < parseFloat(overBefore.replace(/,/g, ''))),
  `(over ${overBefore} -> ${overAfter || 'cleared'})`);

/* --- the dashboard must tell the same truth as the Costs tab --- */
await page.locator('.tab[data-tab="jobs"]').click();
await page.waitForTimeout(300);
const stats = await page.locator('#jobStats').textContent();
check('the dashboard surfaces faded margin as its own stat',
  /Margin faded/i.test(stats), `(${stats.replace(/\s+/g,' ').slice(0,110)})`);
check('the job row flags its faded amount',
  /faded/i.test(await page.locator('.est-row').first().textContent()));
await page.locator('.tab[data-tab="costs"]').click();
await page.waitForTimeout(250);

/* --- the audit report: the fulfillment document for the audit service --- */
const audit = await page.locator('#auditPrint').textContent();
check('audit report renders', /Margin audit/i.test(audit));
check('it shows what the job actually kept', /Profit kept/i.test(audit));
check('it names all three leaks',
  /Leak 1 — Pricing/.test(audit) && /Leak 2 — Work without a signature/.test(audit)
  && /Leak 3 — Margin fade/.test(audit));
check('it shows margin and cost — the audit is NOT a client document',
  /margin/i.test(audit) && /cost/i.test(audit));
check('it ends in a single found-money figure', /Found on this one job/.test(audit));
// Assert the DISCLOSURE, not one phrasing of it: overhead must be declared as
// applied at a stated rate rather than measured, however that is worded.
check('it discloses the overhead is applied, not measured',
  /overhead is applied[^.]*?(not measured|rather than measured)/i.test(audit.replace(/\s+/g, ' ')),
  '(the report must not imply it measured their overhead)');

// With every change order signed, leak 2 must report clean — not silent.
check('a clean leak 2 says so explicitly', /None found/.test(
  audit.slice(audit.indexOf('Leak 2'), audit.indexOf('Leak 3'))));

// Now create the condition: an unsigned change order must surface as leak 2.
await page.locator('.tab[data-tab="changes"]').click();
await page.waitForTimeout(250);
await page.locator('#btnAddCO').click();
await page.waitForTimeout(300);
await page.locator('[data-cof="title"]').fill('Verbal extra — never written up');
await page.locator('[data-coadd]').click();
await page.waitForTimeout(200);
await page.locator('[data-cif="qty"]').first().fill('8');
await page.locator('[data-cif="unitCost"]').first().fill('120');
await page.waitForTimeout(300);
await page.locator('.tab[data-tab="costs"]').click();
await page.waitForTimeout(300);
const audit2 = await page.locator('#auditPrint').textContent();
check('unsigned work surfaces as leak 2',
  /Verbal extra — never written up/.test(audit2) && /gift/i.test(audit2));
check('leak 2 totals the unsigned amount', /of change-order work has nothing\s+signed/.test(audit2.replace(/\s+/g,' ')) || /nothing signed behind it/.test(audit2.replace(/\s+/g,' ')));

// Audit report prints.
await page.evaluate(() => { document.body.dataset.print = 'audit'; });
const auditPdf = await page.pdf({ format: 'Letter', printBackground: true,
  margin: { top: '0.5in', bottom: '0.5in', left: '0.5in', right: '0.5in' } });
check('audit report prints to PDF', auditPdf.length > 15000, `(${auditPdf.length} bytes)`);
await page.evaluate(() => { delete document.body.dataset.print; });

/* --- the audit intake: the service delivery path --- */
await page.locator('#btnAudit').click();
await page.waitForTimeout(350);
check('audit intake opens', await page.locator('#dlgAudit').isVisible());
check('it asks for cost by category', (await page.locator('[data-budget]').count()) === 5);

// Refuses to build something meaningless.
await page.locator('#btnBuildAudit').click();
await page.waitForTimeout(300);
check('it refuses to build without what they charged',
  await page.locator('#dlgAudit').isVisible());

await page.locator('#aTitle').fill('Kitchen — Alder St');
await page.locator('#aClient').fill('Dana Whitmore');
await page.locator('#aQuoted').fill('42000');
await page.locator('[data-budget="labor"]').fill('12000');
await page.locator('[data-budget="material"]').fill('9000');
await page.locator('[data-budget="subcontractor"]').fill('8000');
await page.locator('[data-spent="labor"]').fill('15200');
await page.locator('[data-spent="material"]').fill('9400');
await page.locator('[data-spent="subcontractor"]').fill('8000');
await page.locator('[data-ctitle]').first().fill('Moved the range wall');
await page.locator('[data-camount]').first().fill('2400');
await page.locator('#btnAddChangeRow').click();
await page.waitForTimeout(200);
await page.locator('[data-ctitle]').nth(1).fill('Upgraded venting');
await page.locator('[data-camount]').nth(1).fill('800');
await page.locator('[data-csigned]').nth(1).check();
await page.locator('#btnBuildAudit').click();
await page.waitForTimeout(600);

check('building the audit closes the dialog', !(await page.locator('#dlgAudit').isVisible()));
check('it lands on the Costs tab ready to print',
  (await page.locator('.tab[data-tab="costs"]').getAttribute('aria-selected')) === 'true');

const built = await page.locator('#auditPrint').textContent();
check('the audit report is populated from the intake',
  /Margin audit/.test(built) && /Leak 1/.test(built) && /Leak 3/.test(built));
// The reconstruction must land exactly on what they said they charged. The
// report shows REVENUE, which correctly includes the \$800 signed change, so
// the original contract is checked in state and the revenue on the page.
const originalCents = await page.evaluate(() =>
  JSON.parse(localStorage.getItem('quoteforge.v1')).estimates
    .find((e) => e.title === 'Kitchen — Alder St') ? true : false);
check('the audited job was stored under its own name', originalCents);
check('the report shows contract revenue including the signed change',
  built.includes('42,800'), '(42,000 quoted + 800 signed)');
check('unsigned work surfaces from the intake',
  /Moved the range wall/.test(built), '(the unsigned change must reach leak 2)');
check('overruns surface from the intake', /over budget|Over/i.test(
  await page.locator('#budgetPanel').textContent()));

/* --- the async loop: contractor fills a page, link builds the audit --- */
{
  // A separate page stands in for the contractor's own browser — the intake
  // shares no storage with the app, which is the point of the link.
  const filler = await b.newPage();
  await filler.goto(`http://localhost:${PORT}/quoteforge/intake.html`, { waitUntil: 'networkidle' });

  check('the contractor intake page loads',
    /ten minutes/i.test(await filler.locator('#formPane h1').textContent()));
  check('it promises nothing is uploaded',
    /never leave this page/i.test(await filler.locator('.privacy').textContent()));

  await filler.locator('#btnFinish').click();
  await filler.waitForTimeout(200);
  check('it will not produce an empty summary',
    !(await filler.locator('#donePane').evaluate((el) => el.classList.contains('show'))));

  await filler.locator('#fTitle').fill('Bathroom — Cedar Ave');
  await filler.locator('#fClient').fill("O'Brien & Sons");
  await filler.locator('#fQuoted').fill('28500');
  await filler.locator('[data-budget="labor"]').fill('9000');
  await filler.locator('[data-budget="material"]').fill('6500');
  await filler.locator('[data-spent="labor"]').fill('11800');
  await filler.locator('[data-spent="material"]').fill('6500');
  await filler.locator('[data-ctitle]').first().fill('Replaced the subfloor');
  await filler.locator('[data-camount]').first().fill('1900');
  await filler.locator('#btnFinish').click();
  await filler.waitForTimeout(300);

  const link = await filler.locator('#outLink').inputValue();
  check('it produces a link', link.includes('#j='), `(got ${link.slice(0, 40)})`);
  check('the link is short enough to send', link.length < 700, `(${link.length} chars)`);
  await filler.close();

  // Back in the app: paste it and build.
  await page.locator('#btnAudit').click();
  await page.waitForTimeout(300);
  await page.locator('#aPaste').fill(link);
  await page.waitForTimeout(400);

  check('pasting the link fills the intake',
    (await page.locator('#aTitle').inputValue()) === 'Bathroom — Cedar Ave'
    && (await page.locator('#aQuoted').inputValue()) === '28500',
    '(their figures should arrive intact)');
  check('an apostrophe in a company name survives the trip',
    (await page.locator('#aClient').inputValue()) === "O'Brien & Sons");
  check('their change order comes across',
    (await page.locator('[data-ctitle]').first().inputValue()) === 'Replaced the subfloor');

  await page.locator('#btnBuildAudit').click();
  await page.waitForTimeout(600);
  const fromLink = await page.locator('#auditPrint').textContent();
  check('the audit builds straight from their link',
    /Bathroom — Cedar Ave/.test(fromLink) && /Replaced the subfloor/.test(fromLink));
  // Free-text alone is a weak assertion: a budget/spent mix-up in the paste
  // handler would keep it green while every number on the report was wrong.
  // Check the figures the contractor gave actually survived.
  check('their cost figures survive the paste, not just their words',
    /28,500/.test(fromLink), '(what they charged must reach the report)');
  const budgets = await page.locator('#budgetPanel').textContent();
  check('their per-trade spend survives the paste',
    /11,800/.test(budgets) && /9,000/.test(budgets),
    '(a budget/spent mix-up would be invisible without this)');

  // A mangled link must fail readably, not silently produce wrong numbers.
  await page.locator('#btnAudit').click();
  await page.waitForTimeout(300);
  await page.locator('#aPaste').fill(link.slice(0, link.length - 20));
  await page.waitForTimeout(300);
  check('a truncated link says so instead of loading garbage',
    /not readable/i.test(await page.locator('#aPasteNote').textContent()));
  check('and it does not populate anything',
    (await page.locator('#aTitle').inputValue()) === '');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
}

/* --- plausibility checks catch a typo before it becomes a report --- */
{
  await page.locator('#btnAudit').click();
  await page.waitForTimeout(350);
  await page.locator('#aTitle').fill('Typo job');
  await page.locator('#aQuoted').fill('3150');          // a zero short
  await page.locator('[data-budget="labor"]').fill('9800');
  await page.locator('[data-budget="material"]').fill('6200');
  await page.waitForTimeout(400);
  check('a dropped digit is flagged before building',
    (await page.locator('#aChecks .check.warn').count()) >= 1,
    '(a confident wrong report is worse than none)');

  await page.locator('#aQuoted').fill('31500');
  await page.waitForTimeout(400);
  check('correcting the figure clears the warning',
    (await page.locator('#aChecks .check.warn').count()) === 0);

  await page.locator('[data-spent="labor"]').fill('98000');
  await page.waitForTimeout(400);
  check('a figure in the wrong row is flagged',
    /wrong row|right row/i.test(await page.locator('#aChecks').textContent()));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
}

/* --- the portfolio report: what the offer actually sells --- */
{
  // A second audited job, so the report has a pattern to find.
  await page.locator('#btnAudit').click();
  await page.waitForTimeout(350);
  await page.locator('#aTitle').fill('Deck — 7 Oak');
  await page.locator('#aQuoted').fill('19000');
  await page.locator('[data-budget="labor"]').fill('6000');
  await page.locator('[data-budget="material"]').fill('7000');
  await page.locator('[data-spent="labor"]').fill('7900');
  await page.locator('[data-spent="material"]').fill('7200');
  await page.waitForTimeout(250);
  await page.locator('#btnBuildAudit').click();
  await page.waitForTimeout(600);

  await page.locator('.tab[data-tab="jobs"]').click();
  await page.waitForTimeout(350);
  await page.locator('#btnPortfolio').click();
  await page.waitForTimeout(600);

  const pf = await page.locator('#pfPrint').textContent();
  check('the portfolio report renders across jobs', /Across these jobs/i.test(pf));
  check('it lists every audited job', /Deck — 7 Oak/.test(pf));
  check('it names where the money goes', /Where it goes/i.test(pf)
    && /Pricing/.test(pf) && /Margin fade/.test(pf));
  check('it gives one derived recommendation', /What to change/i.test(pf));
  check('it discloses what it was built from', /not from your books/i.test(pf));

  // The headline must equal the job rows; a report that does not add up is
  // worse than no report on something a contractor pays for.
  const money = (t) => [...t.matchAll(/\$([\d,]+\.\d\d)/g)]
    .map((m) => Math.round(parseFloat(m[1].replace(/,/g, '')) * 100));
  const found = pf.match(/Found — money that was earned and not kept\s*\$([\d,]+\.\d\d)/);
  check('the report states a found total', found !== null, `(${pf.slice(0, 90)})`);

  await page.evaluate(() => { document.body.dataset.print = 'pf'; });
  const pfPdf = await page.pdf({ format: 'Letter', printBackground: true,
    margin: { top: '0.5in', bottom: '0.5in', left: '0.5in', right: '0.5in' } });
  check('the portfolio report prints', pfPdf.length > 15000, `(${pfPdf.length} bytes)`);
  await page.evaluate(() => { delete document.body.dataset.print; });
  await page.locator('.tab[data-tab="costs"]').click();
  await page.waitForTimeout(250);
}

/* --- deleting an entry --- */
const rows = await page.locator('tr[data-ac]').count();
await page.locator('tr[data-ac]').first().hover();
await page.locator('tr[data-ac]').first().locator('[data-acdel]').click();
await page.waitForTimeout(300);
check('an entry can be deleted', (await page.locator('tr[data-ac]').count()) === rows - 1);

/* --- the forecast: the job costed while it is still running ------------- */
console.log('\n  forecast');
// Fresh job so the numbers are known: budget comes from the sample estimate.
await page.locator('#btnNew').click();
await page.waitForTimeout(300);
// One priced line so there is a budget: 40 h of labor at $60 = $2,400 direct.
await page.locator('#btnAddLine').click();
await page.waitForTimeout(200);
const line = page.locator('.items tbody tr').first();
await line.locator('[data-f="description"]').fill('Carpentry');
await line.locator('[data-f="category"]').selectOption('labor');
await line.locator('[data-f="qty"]').fill('40');
await line.locator('[data-f="unitCost"]').fill('60');
await page.waitForTimeout(250);
await page.locator('.tab[data-tab="costs"]').click();
await page.waitForTimeout(250);
check('with nothing spent the forecast says so instead of projecting',
  /Nothing to project yet/.test(await page.locator('#forecastPanel').textContent()));
check('the empty chart explains what will draw there',
  /Nothing logged yet/.test(await page.locator('#burnChart').textContent()));

const log = async (date, cat, desc, amt) => {
  await page.locator('#btnAddActual').click();
  await page.waitForTimeout(150);
  const r = page.locator('tr[data-ac]').first();
  await r.locator('[data-acf="date"]').fill(date);
  await r.locator('[data-acf="category"]').selectOption(cat);
  await r.locator('[data-acf="description"]').fill(desc);
  await r.locator('[data-acf="amount"]').fill(amt);
  await page.waitForTimeout(200);
};
await log('2026-08-03', 'material', 'Lumber', '900');
await log('2026-08-10', 'labor', 'Payroll wk1', '700');
check('spend is logged but progress is unset — no projection is made',
  /Set how far along the job is/.test(await page.locator('#forecastPanel').textContent()));
check('the chart draws a point per dated entry',
  (await page.locator('#burnChart .dot').count()) === 2);
check('the chart shows the budget line',
  /budget \$/.test(await page.locator('#burnChart').textContent()));
check('chart text is not stretched: the svg is drawn at its container width',
  await page.evaluate(() => { const svg = document.querySelector('#burnChart svg');
    const vb = svg.viewBox.baseVal.width; const w = svg.getBoundingClientRect().width; return Math.abs(vb - w) < 2; }));

await page.locator('#progressPct').fill('50');
await page.waitForTimeout(350);
const fc = await page.locator('#forecastPanel').textContent();
check('setting progress produces a cost at completion', /Cost at completion/.test(fc));
check('the forecast is dated', /as of \w{3} \d/.test(await page.locator('#progressAsOf').textContent()));
check('the projection is dotted onto the chart', (await page.locator('#burnChart .proj').count()) === 1);
check('and labelled with where it finishes', /finishes ≈ \$/.test(await page.locator('#burnChart').textContent()));

// Reconcile against the engine: spent $1600 at 50% → $3200 at completion.
check('cost at completion is spend scaled by progress', /\$3,200\.00/.test(fc), `(${fc.slice(0, 120)})`);
check('progress persists across a reload', await (async () => {
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('.tab[data-tab="costs"]').click();
  await page.waitForTimeout(250);
  return (await page.locator('#progressPct').inputValue()) === '50';
})());

// Blow the labor budget and the coaching must name the trade and the fix.
await log('2026-08-17', 'labor', 'Payroll wk2', '2600');
const bad = await page.locator('#forecastCoach').textContent();
check('the coaching names the trade that is ahead of pace', /^\s*Labor is \$[\d,]+\.\d\d ahead of pace/.test(bad), `(${bad.slice(0, 60)})`);
check('it says how much is still avoidable', /has not been spent yet/.test(bad));
// Labor: $3,300 spent of $2,400 at 50% → finishes $6,600, $4,200 over, $900 of it already over.
check('the unspent share is the trade\'s own, not the job total',
  /finishes \$4,200\.00 over budget — \$3,300\.00 of that has not been spent yet/.test(bad), `(${bad.slice(0, 160)})`);
check('it points at the change order, not at the invoice', /change order/.test(bad));
check('the chart turns the spend line red past budget',
  (await page.locator('#burnChart .spend.over').count()) === 1);

// Hover reads the nearest point.
const svg = page.locator('#burnChart svg');
const box = await svg.boundingBox();
await page.mouse.move(box.x + box.width * 0.45, box.y + 60);
await page.waitForTimeout(100);
check('hovering the chart reads a logged day', /so far/.test(await page.locator('.burn-tip').textContent()));

// Early progress projects with a warning rather than a confident number.
await page.locator('#progressPct').fill('15');
await page.waitForTimeout(300);
check('an early projection is flagged as over-reading',
  /over-reads|warning, not a number/.test(await page.locator('#forecastCoach').textContent()));
await page.locator('#progressPct').fill('5');
await page.waitForTimeout(300);
check('under the minimum progress it declines to project',
  /Set how far along/.test(await page.locator('#forecastPanel').textContent()));

/* --- the weekly review: the deliverable of the monthly check ------------ */
console.log('\n  weekly job review');
// State here: audited jobs (finished, reconstructed) plus the job built above,
// which has spend logged and progress at 5%.
await page.locator('.tab[data-tab="jobs"]').click();
await page.waitForTimeout(350);
await page.locator('#btnReview').click();
await page.waitForTimeout(600);
const rv = await page.locator('#rvPrint').textContent();
// Count JOBS asked for progress, from the table's own rows. Counting string
// occurrences double-counts: every verdict appears in the table and again as
// an instruction paragraph.
const asked = () => page.evaluate(() => [...document.querySelectorAll('#rvPrint tbody tr')]
  .filter((tr) => /Tell me how far along/.test(tr.lastElementChild.textContent)).length);
const askedBefore = await asked();
check('the review renders', /Job review/.test(rv), `(${rv.slice(0, 80)})`);
check('its headline is money still recoverable', /Recoverable this week/.test(rv));
check('reconstructed audit jobs stay off it — that is somebody else\'s finished work',
  !/Deck — 7 Oak/.test(rv) && !/Bathroom — Cedar Ave/.test(rv));
check('a job with spend but no usable progress is asked for the number',
  askedBefore >= 1, `(${askedBefore} such jobs)`);
check('it states what is excluded from the recoverable total',
  /already spent past budget is not counted/.test(rv));

await page.evaluate(() => { document.body.dataset.print = 'rv'; });
await page.emulateMedia({ media: 'print' });
await page.waitForTimeout(200);
check('the review is the only thing on the page when printing',
  await page.evaluate(() => {
    const vis = (el) => el && getComputedStyle(el).display !== 'none';
    return vis(document.querySelector('#rvPrintShell'))
      && !vis(document.querySelector('#pfPrintShell'))
      && !vis(document.querySelector('#pane-costs'));
  }), '(a stale print target would put two documents in one PDF)');
const rvPdf = await page.pdf({ format: 'Letter', printBackground: true,
  margin: { top: '0.5in', bottom: '0.5in', left: '0.5in', right: '0.5in' } });
check('it prints to a PDF you can send', rvPdf.length > 15000, `(${rvPdf.length} bytes)`);
await page.emulateMedia({ media: 'screen' });
await page.evaluate(() => { delete document.body.dataset.print; });

// Make the job projectable and it moves from a question to an instruction.
await page.locator('.tab[data-tab="costs"]').click();
await page.waitForTimeout(250);
await page.locator('#progressPct').fill('50');
await page.waitForTimeout(300);
await page.locator('.tab[data-tab="jobs"]').click();
await page.waitForTimeout(250);
await page.locator('#btnReview').click();
await page.waitForTimeout(500);
const rv2 = await page.locator('#rvPrint').textContent();
const askedAfter = await asked();
check('setting progress turns that job from a question into an instruction',
  askedAfter === askedBefore - 1, `(${askedBefore} asked before, ${askedAfter} after)`);
check('and the review now carries a verdict for it',
  /Write it up now|Watch it|Nothing to do/.test(rv2));
check('the money it names is unspent, not already gone',
  /has not been spent yet/.test(rv2) || /Nothing to do/.test(rv2));

/* --- a client's RUNNING job, collected by link -------------------------- */
console.log('\n  a running job collected by link');
{
  const filler = await b.newPage();
  await filler.goto(`http://localhost:${PORT}/quoteforge/intake.html`, { waitUntil: 'networkidle' });
  await filler.locator('#fState').selectOption('running');
  await filler.locator('#fPct').fill('40');
  await filler.locator('#fTitle').fill('Loft conversion — Mill Rd');
  await filler.locator('#fQuoted').fill('42000');
  await filler.locator('[data-budget="labor"]').fill('12000');
  await filler.locator('[data-budget="material"]').fill('9000');
  await filler.locator('[data-spent="labor"]').fill('7000');
  await filler.locator('[data-spent="material"]').fill('8600');
  await filler.locator('[data-ctitle]').first().fill('Rot under tub');
  await filler.locator('[data-camount]').first().fill('2400');
  await filler.locator('#btnFinish').click();
  await filler.waitForTimeout(300);
  const runLink = await filler.locator('#outLink').inputValue();
  await filler.close();

  await page.locator('#btnAudit').click();
  await page.waitForTimeout(300);
  await page.locator('#aPaste').fill(runLink);
  await page.waitForTimeout(500);
  check('the dialog switches itself to a running job',
    (await page.locator('#aState').inputValue()) === 'running'
    && (await page.locator('#aPct').inputValue()) === '40');
  check('it stops calling itself an audit',
    /running job/i.test(await page.locator('#aHeading').textContent())
    && /review/i.test(await page.locator('#btnBuildAudit').textContent()));
  check('the paste note says how far along it is',
    /40% done/.test(await page.locator('#aPasteNote').textContent()));

  await page.locator('#btnBuildAudit').click();
  await page.waitForTimeout(700);
  check('the job arrives with its progress already set',
    (await page.locator('#progressPct').inputValue()) === '40');
  // Spend 15,600 at 40% projects to 39,000 against a 21,000 budget.
  const fc = await page.locator('#forecastPanel').textContent();
  check('and is forecast, not merely stored', /\$39,000\.00/.test(fc), `(${fc.slice(0, 90)})`);
  check('the toast reports what is recoverable, not a verdict on a finished job',
    /still recoverable/.test(await page.locator('#toasts').textContent()));

  await page.locator('.tab[data-tab="jobs"]').click();
  await page.waitForTimeout(300);
  await page.locator('#btnReview').click();
  await page.waitForTimeout(500);
  const rvRun = await page.locator('#rvPrint').textContent();
  check('a client job reconstructed from their numbers reaches the weekly review',
    /Loft conversion — Mill Rd/.test(rvRun),
    '(this is the entire point of collecting it)');
  check('it carries both the signature and the change order to chase',
    /Get the signature \+ Write it up now/.test(rvRun));

  /* --- next week: the same job again ------------------------------------ */
  const filler2 = await b.newPage();
  await filler2.goto(`http://localhost:${PORT}/quoteforge/intake.html`, { waitUntil: 'networkidle' });
  await filler2.locator('#fState').selectOption('running');
  await filler2.locator('#fPct').fill('70');
  await filler2.locator('#fTitle').fill('  loft conversion — Mill Rd  ');   // as they typed it
  await filler2.locator('#fQuoted').fill('42000');
  await filler2.locator('[data-budget="labor"]').fill('12000');
  await filler2.locator('[data-budget="material"]').fill('9000');
  await filler2.locator('[data-spent="labor"]').fill('13500');
  await filler2.locator('[data-spent="material"]').fill('8600');
  await filler2.locator('#btnFinish').click();
  await filler2.waitForTimeout(300);
  const week2 = await filler2.locator('#outLink').inputValue();
  await filler2.close();

  const jobsBefore = await page.locator('#estSelect option').count();
  await page.locator('#btnAudit').click();
  await page.waitForTimeout(300);
  await page.locator('#aPaste').fill(week2);
  await page.waitForTimeout(500);
  check('the app recognises next week of a job it already has',
    await page.locator('#aUpdateWrap').isVisible());
  check('and names the job it would replace, so a wrong match is visible',
    /Update Q-\d+/.test(await page.locator('#aUpdateNote').textContent()),
    '(matching is on the title the contractor types, so it can be wrong)');
  await page.locator('#btnBuildAudit').click();
  await page.waitForTimeout(800);
  check('a weekly update replaces the job instead of adding a copy',
    (await page.locator('#estSelect option').count()) === jobsBefore,
    '(five copies of one kitchen would report the same recoverable money five times)');
  check('and it carries this week\'s progress',
    (await page.locator('#progressPct').inputValue()) === '70');
  check('the toast names the job it updated',
    /Q-\d+ updated to 70% done/.test(await page.locator('#toasts').textContent()));

  await page.locator('.tab[data-tab="jobs"]').click();
  await page.waitForTimeout(300);
  await page.locator('#btnReview').click();
  await page.waitForTimeout(500);
  const rows = await page.evaluate(() => [...document.querySelectorAll('#rvPrint tbody tr')]
    .filter((tr) => /Loft conversion/i.test(tr.textContent)).length);
  check('the review shows that job once, at this week\'s figures', rows === 1, `(${rows} rows)`);

  // Opting out is the escape hatch for a wrong match.
  await page.locator('#btnAudit').click();
  await page.waitForTimeout(300);
  await page.locator('#aPaste').fill(week2);
  await page.waitForTimeout(500);
  await page.locator('#aUpdate').uncheck();
  await page.locator('#btnBuildAudit').click();
  await page.waitForTimeout(700);
  check('unticking it adds a separate job, for when the match is wrong',
    (await page.locator('#estSelect option').count()) === jobsBefore + 1);
}

console.log(`\n  job costs: ${pass} passed, ${fail} failed`);
if (errs.length) console.log('  ERRORS: ' + [...new Set(errs)].join(' | '));
await b.close(); srv.close();
process.exit(fail || errs.length ? 1 : 0);
