/**
 * accessibility.mjs — keyboard and screen-reader barriers, in both themes.
 *
 * Run with:  node quoteforge/test/accessibility.mjs
 *
 * Deliberately hand-written rather than a generic scanner: it checks the four
 * things that actually lock someone out of THIS app — a control with no
 * accessible name, a button with no discernible label, an image with no alt,
 * and text that does not meet WCAG AA contrast against the surface behind it.
 *
 * Two lessons are baked into the measurement itself, because both produced
 * false failures that would have caused real damage if "fixed":
 *   - An element over a gradient has no single backdrop colour, so contrast
 *     against the page background beneath it is fiction. Those are skipped.
 *   - color-mix() computes to `color(srgb 0.98 ...)` with components in 0..1,
 *     not 0..255. Treating those as 0..255 reads a near-white nav bar as
 *     near-black and invents failures across the whole page.
 */
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
const PORT = Number(process.env.PORT || 8845);
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css'};
const srv=http.createServer((q,r)=>{let f=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));
 if(fs.existsSync(f)&&fs.statSync(f).isDirectory())f=path.join(f,'index.html');
 if(!fs.existsSync(f)){r.writeHead(404).end();return;}
 r.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'text/plain'});r.end(fs.readFileSync(f));});
await new Promise(r=>srv.listen(PORT,r));
const b=await chromium.launch({ executablePath: EXEC });

const PROBE = () => {
  // color-mix() computes to `color(srgb 0.98 0.97 0.96 / .88)` — components in
  // 0..1, not 0..255. Dividing those by 255 reads a near-white nav bar as
  // near-black and invents contrast failures, so detect the format first.
  const lum = (c) => {
    const nums = c.match(/[\d.]+/g).map(Number);
    const isUnit = /^color\(/.test(c.trim());
    const [r,g,bl] = nums.slice(0,3).map(v=>{
      v = isUnit ? v : v/255;
      return v<=0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4);
    });
    return 0.2126*r + 0.7152*g + 0.0722*bl;
  };
  const ratio = (a,b) => { const l1=lum(a), l2=lum(b); return (Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05); };
  // Returns null when an ancestor paints a gradient or image: the effective
  // backdrop is not a single colour, so a contrast ratio computed against the
  // page background beneath it would be fiction.
  const bgOf = (el) => {
    let n = el;
    while (n && n !== document.documentElement) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return null;
      const c = cs.backgroundColor;
      if (c && !/rgba?\(0, 0, 0, 0\)|transparent/.test(c)) return c;
      n = n.parentElement;
    }
    return getComputedStyle(document.body).backgroundColor || 'rgb(255,255,255)';
  };
  const name = (el) => (el.getAttribute('aria-label') || el.getAttribute('title')
    || (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent)
    || el.closest('label')?.textContent || el.textContent || '').trim();

  const out = { unlabelled: [], unnamed: [], lowContrast: [], noAlt: [], unnamedDialogs: [] };

  for (const el of document.querySelectorAll('input,select,textarea')) {
    if (el.type === 'hidden' || el.offsetParent === null) continue;
    if (!name(el)) out.unlabelled.push(`${el.tagName.toLowerCase()}${el.id?'#'+el.id:''}[${el.type||''}]`);
  }
  for (const el of document.querySelectorAll('button,a[href]')) {
    if (el.offsetParent === null) continue;
    if (!name(el)) out.unnamed.push(el.outerHTML.slice(0,60));
  }
  for (const el of document.querySelectorAll('img')) {
    if (!el.hasAttribute('alt')) out.noAlt.push(el.src.slice(0,50));
  }
  for (const el of document.querySelectorAll('dialog[open]')) {
    if (!name(el) && !el.querySelector('h1,h2,h3')) out.unnamedDialogs.push(el.id);
  }
  // Sample visible text nodes for contrast.
  const seen = new Set();
  for (const el of document.querySelectorAll('p,span,td,th,label,li,h1,h2,h3,h4,button,a,div')) {
    if (el.offsetParent === null || !el.textContent.trim()) continue;
    if (el.children.length && el.tagName === 'DIV') continue;
    const cs = getComputedStyle(el);
    const bg = bgOf(el);
    if (bg === null) continue;                  // gradient backdrop, not measurable
    const key = cs.color + '|' + bg + '|' + cs.fontSize + '|' + cs.fontWeight;
    if (seen.has(key)) continue; seen.add(key);
    try {
      const r = ratio(cs.color, bg);
      const px = parseFloat(cs.fontSize);
      const large = px >= 24 || (px >= 18.66 && Number(cs.fontWeight) >= 700);
      const need = large ? 3 : 4.5;
      if (r < need) out.lowContrast.push(`${r.toFixed(2)}:1 need ${need} — ${cs.fontSize} "${el.textContent.trim().slice(0,40)}"`);
    } catch {}
  }
  return out;
};

async function audit(url, label, prep, theme) {
  const ctx = await b.newContext({viewport:{width:1400,height:1000}, colorScheme: theme});
  const p = await ctx.newPage();
  await p.goto(url,{waitUntil:'networkidle'});
  if (prep) await prep(p);
  await p.waitForTimeout(400);
  const r = await p.evaluate(PROBE);
  const total = r.unlabelled.length + r.unnamed.length + r.lowContrast.length + r.noAlt.length + r.unnamedDialogs.length;
  console.log(`${label} [${theme}]: ${total === 0 ? 'clean' : total + ' issue(s)'}`);
  for (const [k, v] of Object.entries(r))
    for (const item of v.slice(0,5)) console.log(`   ${k}: ${item}`);
  await ctx.close();
  return total;
}

let issues = 0;
for (const theme of ['light','dark']) {
  issues += await audit(`http://localhost:${PORT}/`,'landing', null, theme);
  issues += await audit(`http://localhost:${PORT}/audit.html`,'offer', null, theme);
  issues += await audit(`http://localhost:${PORT}/quoteforge/intake.html`,'contractor form', null, theme);
  issues += await audit(`http://localhost:${PORT}/quoteforge/`,'app', null, theme);
  issues += await audit(`http://localhost:${PORT}/quoteforge/`,'app + dialog',
    async p => { await p.locator('#btnAudit').click(); await p.waitForTimeout(400); }, theme);
}
console.log(`\n  accessibility: ${issues === 0 ? 'clean' : issues + ' issue(s)'} across 5 pages x 2 themes\n`);
await b.close(); srv.close();
process.exit(issues ? 1 : 0);
