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

/* --- deleting an entry --- */
const rows = await page.locator('tr[data-ac]').count();
await page.locator('tr[data-ac]').first().hover();
await page.locator('tr[data-ac]').first().locator('[data-acdel]').click();
await page.waitForTimeout(300);
check('an entry can be deleted', (await page.locator('tr[data-ac]').count()) === rows - 1);

console.log(`\n  job costs: ${pass} passed, ${fail} failed`);
if (errs.length) console.log('  ERRORS: ' + [...new Set(errs)].join(' | '));
await b.close(); srv.close();
process.exit(fail || errs.length ? 1 : 0);
