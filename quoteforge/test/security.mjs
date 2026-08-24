/**
 * Adversarial check: put a hostile payload into every user-editable field and
 * confirm nothing executes anywhere it is later rendered.
 *
 * This matters more than it looks. A proposal is a document a contractor emails
 * to a homeowner and imports back from a JSON file someone else sent them. A
 * stored payload in a client name or a term would execute in the contractor's
 * browser, where every other client's contact details live.
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
const T={'.html':'text/html','.js':'text/javascript','.css':'text/css'};
const srv=http.createServer((q,r)=>{let f=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));
 if(fs.existsSync(f)&&fs.statSync(f).isDirectory())f=path.join(f,'index.html');
 if(!f.startsWith(ROOT)||!fs.existsSync(f)){r.writeHead(404).end();return;}
 r.writeHead(200,{'Content-Type':T[path.extname(f)]||'text/plain'});r.end(fs.readFileSync(f));});
const PORT = Number(process.env.PORT || 8791);
await new Promise(r=>srv.listen(PORT,r));

const EXEC = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const b = await chromium.launch({ executablePath: EXEC });
const page=await b.newPage({viewport:{width:1440,height:950}});

let fired = 0;
await page.exposeFunction('__xssFired', () => { fired++; });
await page.addInitScript(() => {
  window.__pwned = () => window.__xssFired();
  // Catch the common vectors regardless of how they'd trigger.
  window.addEventListener('error', () => {}, true);
});

let pass=0, fail=0;
const check=(n,c,x='')=>{c?(pass++,console.log(`  ok    ${n}`)):(fail++,console.log(`  FAIL  ${n} ${x}`));};

// Payloads covering text context, attribute breakout, and event handlers.
const PAYLOADS = [
  '<img src=x onerror=window.__pwned()>',
  '"><script>window.__pwned()</script>',
  `"onmouseover="window.__pwned()`,
  `'><svg onload=window.__pwned()>`,
  '</textarea><img src=x onerror=window.__pwned()>',
];

await page.goto(`http://localhost:${PORT}/quoteforge/`,{waitUntil:'networkidle'});
await page.waitForTimeout(300);

for (const [n, payload] of PAYLOADS.entries()) {
  // Every free-text field a user (or an imported file) can control.
  await page.locator('#fTitle').fill(payload);
  await page.locator('#fClient').fill(payload);
  await page.locator('#fJobAddr').fill(payload);
  await page.locator('#fScope').fill(payload);
  await page.locator('.items tbody tr').first().locator('[data-f="description"]').fill(payload);
  await page.waitForTimeout(150);

  // Render it everywhere it can appear.
  await page.locator('.tab[data-tab="proposal"]').click();
  await page.waitForTimeout(250);
  await page.locator('.tab[data-tab="jobs"]').click();
  await page.waitForTimeout(200);
  await page.locator('.tab[data-tab="settings"]').click();
  await page.waitForTimeout(200);
  await page.locator('.tab[data-tab="estimate"]').click();
  await page.waitForTimeout(200);
  await page.keyboard.press('k');
  await page.waitForTimeout(150);
  await page.locator('#pbQuery').fill(payload);
  await page.waitForTimeout(150);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);

  check(`payload ${n + 1} does not execute`, fired === 0, `(fired ${fired}x: ${payload.slice(0,40)})`);
  if (fired) break;
}

// The payload must still round-trip as literal TEXT, not be silently stripped.
await page.locator('#fClient').fill('<b>Dana & Co</b>');
await page.waitForTimeout(150);
await page.locator('.tab[data-tab="proposal"]').click();
await page.waitForTimeout(300);
const shown = await page.locator('.pr-parties').textContent();
check('hostile-looking text still renders literally',
  shown.includes('<b>Dana & Co</b>'), `(got: ${shown.replace(/\s+/g,' ').slice(0,90)})`);
const boldCount = await page.locator('.pr-parties b').count();
check('markup in a client name is not interpreted', boldCount === 0, `(found ${boldCount} <b> elements)`);

// A malicious IMPORT file is the highest-risk path: the contractor did not type it.
await page.locator('.tab[data-tab="jobs"]').click();
await page.waitForTimeout(200);
const evil = JSON.stringify({
  kind: 'quoteforge-estimate',
  schemaVersion: 1,
  estimate: {
    id: 'evil', number: 'Q-666', title: '<img src=x onerror=window.__pwned()>',
    client: { name: '<svg onload=window.__pwned()>', email: '', phone: '', address: '' },
    scopeSummary: '<script>window.__pwned()</script>',
    exclusions: '<iframe src=javascript:window.__pwned()>',
    terms: ['<img src=x onerror=window.__pwned()>'],
    milestones: [{ label: '<img src=x onerror=window.__pwned()>', percent: 1 }],
    items: [{ description: '<img src=x onerror=window.__pwned()>', qty: 1, unitCost: 1,
              category: 'material', unit: 'ea', markup: null }],
  },
});
await page.locator('#fileImport').setInputFiles({
  name: 'evil.json', mimeType: 'application/json', buffer: Buffer.from(evil),
});
await page.waitForTimeout(600);
await page.locator('.tab[data-tab="proposal"]').click();
await page.waitForTimeout(400);
await page.locator('.tab[data-tab="estimate"]').click();
await page.waitForTimeout(300);
check('a hostile imported file does not execute', fired === 0, `(fired ${fired}x)`);

console.log(`\n  xss: ${pass} passed, ${fail} failed  (handlers fired: ${fired})`);
await b.close(); srv.close();
process.exit(fail?1:0);
