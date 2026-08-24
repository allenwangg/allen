/**
 * change-orders.mjs — end-to-end coverage of the change order flow.
 *
 * Run with:  node quoteforge/test/change-orders.mjs
 *
 * Change orders are where a job quietly stops being profitable: the work gets
 * done on a handshake and never makes it onto an invoice. These checks pin the
 * behavior that makes that harder — unapproved work is visibly at risk, an
 * approved order cannot be edited without a warning, and the authorization
 * document says what the client actually agreed to.
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
const PORT = Number(process.env.PORT || 8793);
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css'};
const srv=http.createServer((q,r)=>{let f=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));
 if(fs.existsSync(f)&&fs.statSync(f).isDirectory())f=path.join(f,'index.html');
 if(!fs.existsSync(f)){r.writeHead(404).end();return;} 
 r.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'text/plain'});r.end(fs.readFileSync(f));});
await new Promise(r=>srv.listen(PORT,r));
const b=await chromium.launch({ executablePath: EXEC });
const page=await b.newPage({viewport:{width:1440,height:1000}});
const errs=[]; page.on('pageerror',e=>errs.push(e.message)); page.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
let pass=0,fail=0; const check=(n,c,x='')=>{c?(pass++,console.log(`  ok    ${n}`)):(fail++,console.log(`  FAIL  ${n} ${x}`));};

await page.goto(`http://localhost:${PORT}/quoteforge/`,{waitUntil:'networkidle'});
await page.waitForTimeout(300);

check('changes tab exists', await page.locator('.tab[data-tab="changes"]').isVisible());
await page.locator('.tab[data-tab="changes"]').click();
await page.waitForTimeout(250);
check('empty state explains the risk',
  /second most common way a job loses money/.test(await page.locator('#coList').textContent()));

await page.locator('#btnAddCO').click();
await page.waitForTimeout(300);
check('a change order is created', (await page.locator('.co-row').count()) === 1);
check('the editor opens', await page.locator('#coEditorCard').isVisible());
check('it starts unapproved',
  (await page.locator('.co-row').first().getAttribute('class')).includes('unapproved'));

await page.locator('[data-cof="title"]').fill('Rotten subfloor at tub wall');
await page.locator('[data-cof="reason"]').fill('Demolition exposed water damage to the subfloor and two joists.');
await page.waitForTimeout(200);
const focused = await page.evaluate(() => document.activeElement?.dataset?.cof);
check('focus survives the re-render', focused === 'reason', `(active: ${focused})`);

await page.locator('[data-coadd]').click();
await page.waitForTimeout(250);
await page.locator('[data-cif="description"]').first().fill('Sister joists');
await page.locator('[data-cif="qty"]').first().fill('6');
await page.locator('[data-cif="unitCost"]').first().fill('85');
await page.locator('[data-cif="category"]').first().selectOption('labor');
await page.waitForTimeout(300);

const amt = await page.locator('.co-row .amt').first().textContent();
check('the change order prices', /\+\$\d/.test(amt), `(got ${amt})`);

const risk = await page.locator('.risk').textContent();
check('unapproved exposure is called out', /not authorized/i.test(risk), `(${risk.slice(0,70)})`);
check('exposure names the contractor own cost at stake', /carrying \$/.test(risk));

const badge = await page.locator('#coBadge').textContent();
check('the tab badge counts unapproved orders', badge === '1', `(got "${badge}")`);

// Contract total must not move until approval.
const before = await page.locator('#contractPanel .figure.total .value').textContent();
await page.locator('[data-costatus="sent"]').click();
await page.waitForTimeout(250);
check('sending does not add it to the contract',
  (await page.locator('#contractPanel .figure.total .value').textContent()) === before);

await page.locator('[data-costatus="approved"]').click();
await page.waitForTimeout(350);
const after = await page.locator('#contractPanel .figure.total .value').textContent();
check('approving raises the contract total', after !== before, `(${before} -> ${after})`);
check('approving clears the exposure warning',
  /Everything is authorized/i.test(await page.locator('.risk').textContent()));
check('the badge turns green when all is signed',
  (await page.locator('#coBadge').getAttribute('class')).includes('ok'));
check('the row shows approved',
  (await page.locator('.co-row').first().getAttribute('class')).includes('approved'));

// The authorization document.
const doc = await page.locator('#coPrint').textContent();
check('authorization document renders',
  doc.includes('Change order') && doc.includes('Authorization'), `(${doc.slice(0,60)})`);
check('it states the revised contract total', doc.includes('Revised contract total'));
check('it carries the reason the client will read later',
  doc.includes('Demolition exposed water damage'));
check('it records the approval date', /Approved \w+ \d+, \d{4}/.test(doc));

// Editing an APPROVED change order must warn: the client signed for an amount.
const approvedNote = await page.locator('#coEditor .coach').textContent();
check('an approved change order says edits change the contract',
  /Anything you change here changes the contract|authorized/i.test(approvedNote),
  `(${approvedNote.slice(0,80)})`);

// Sign it through the real UI, the way a client would at the kitchen table.
await page.locator('[data-cosign]').click();
await page.waitForTimeout(350);
const sbox = await page.locator('#sigPad').boundingBox();
await page.mouse.move(sbox.x + 40, sbox.y + 100);
await page.mouse.down();
for (let i = 0; i < 30; i++) await page.mouse.move(sbox.x + 40 + i * 8, sbox.y + 100 - Math.sin(i / 3) * 30);
await page.mouse.up();
await page.locator('#btnSigSave').click();
await page.waitForTimeout(400);

check('signing a change order marks it approved',
  (await page.locator('.co-row').first().getAttribute('class')).includes('approved'));
check('the signature lands on the authorization document',
  (await page.locator('#coPrint .sign-line img').count()) === 1);

const signedNote = await page.locator('#coEditor .coach').textContent();
check('a signed change order warns that editing breaks the authorization',
  /client signed for/i.test(signedNote), `(${signedNote.slice(0,80)})`);
check('it offers a way to reopen', (await page.locator('[data-coclearsig]').count()) === 1);

await page.locator('[data-coclearsig]').click();
await page.waitForTimeout(350);
check('reopening removes the signature from the document',
  (await page.locator('#coPrint .sign-line img').count()) === 0);
check('reopening returns it to unapproved',
  (await page.locator('.co-row').first().getAttribute('class')).includes('unapproved'));

// Put it back so later assertions still hold.
await page.locator('[data-costatus="approved"]').click();
await page.waitForTimeout(250);

// A credit change order.
await page.locator('#btnAddCO').click();
await page.waitForTimeout(300);
await page.locator('[data-cof="title"]').fill('Client dropped the heated floor');
await page.locator('[data-coadd]').click();
await page.waitForTimeout(200);
await page.locator('[data-cif="description"]').first().fill('Remove heated floor');
await page.locator('[data-cif="qty"]').first().fill('-32');
await page.locator('[data-cif="unitCost"]').first().fill('18.5');
await page.waitForTimeout(300);
const creditAmt = await page.locator('.co-row').nth(1).locator('.amt').textContent();
check('a credit change order shows as negative', creditAmt.startsWith('−'), `(got ${creditAmt})`);

await page.locator('[data-costatus="approved"]').click();
await page.waitForTimeout(350);
const finalTotal = await page.locator('#contractPanel .figure.total .value').textContent();
check('a credit lowers the contract', finalTotal !== after, `(${after} -> ${finalTotal})`);
const marginTxt = await page.locator('#contractPanel').textContent();
check('contract margin stays sane with a credit',
  !/NaN|Infinity|-?\d{3,}\.\d%/.test(marginTxt));

// Persistence.
await page.reload({waitUntil:'networkidle'});
await page.waitForTimeout(400);
await page.locator('.tab[data-tab="changes"]').click();
await page.waitForTimeout(300);
check('change orders survive a reload', (await page.locator('.co-row').count()) === 2);

// Price book into a change order.
await page.locator('.co-row').first().click();
await page.waitForTimeout(250);
const linesBefore = await page.locator('[data-coitem]').count();
await page.locator('[data-cobook]').click();
await page.waitForTimeout(250);
await page.locator('#pbQuery').fill('dumpster');
await page.waitForTimeout(200);
await page.locator('.pb-row .desc').first().click();
await page.waitForTimeout(350);
check('the price book adds into the change order, not the estimate',
  (await page.locator('[data-coitem]').count()) === linesBefore + 1,
  `(had ${linesBefore})`);

// Print target.
await page.evaluate(() => { document.body.dataset.print = 'co'; });
const pdf = await page.pdf({format:'Letter',printBackground:true,margin:{top:'0.5in',bottom:'0.5in',left:'0.5in',right:'0.5in'}});
check('change order prints to PDF', pdf.length > 15000, `(${pdf.length} bytes)`);

console.log(`\n  change orders: ${pass} passed, ${fail} failed`);
if(errs.length) console.log('  ERRORS: '+[...new Set(errs)].join(' | '));
await b.close(); srv.close(); process.exit(fail||errs.length?1:0);
