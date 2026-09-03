// Prism contrast test — every rendered text node in every theme must clear
// WCAG AA (4.5:1, or 3:1 for large text) against the surface actually behind it.
// WCAG contrast sweep over every rendered text node, in all four themes.
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const M={'.html':'text/html','.css':'text/css','.js':'text/javascript','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml'};
const server=createServer((q,r)=>{const p=join(root,q.url==='/'?'index.html':q.url.replace(/\?.*$/,''));
 if(!existsSync(p)){r.writeHead(404);return r.end('nf');} r.writeHead(200,{'content-type':M[extname(p)]||'text/plain'}); r.end(readFileSync(p));});
await new Promise(r=>server.listen(0,r));
const url=`http://127.0.0.1:${server.address().port}/`;
const b=await chromium.launch({executablePath: process.env.CHROMIUM || undefined});

const SWEEP = `(() => {
  const lum = ([r,g,b]) => { const f=v=>{v/=255; return v<=0.03928? v/12.92 : Math.pow((v+0.055)/1.055,2.4)}; return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b) };
  const parse = s => { const m=s.match(/[\\d.]+/g); return m? m.slice(0,3).map(Number) : null };
  const alpha = s => { const m=s.match(/rgba?\\([^)]*\\)/); if(!m) return 1; const p=m[0].match(/[\\d.]+/g); return p&&p.length>3? Number(p[3]) : 1 };
  const bgOf = el => { let n=el; while(n && n!==document.documentElement){ const cs=getComputedStyle(n); if(alpha(cs.backgroundColor)>0.85) return parse(cs.backgroundColor); n=n.parentElement; } return parse(getComputedStyle(document.body).backgroundColor) };
  const out=[];
  for (const el of document.querySelectorAll('body *')) {
    if (!el.offsetParent && getComputedStyle(el).position!=='fixed') continue;
    const direct = [...el.childNodes].some(n=>n.nodeType===3 && n.textContent.trim().length>1);
    if (!direct) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility==='hidden' || Number(cs.opacity)<0.6) continue;
    const fg = parse(cs.color), bg = bgOf(el);
    if (!fg || !bg) continue;
    const L1=lum(fg), L2=lum(bg);
    const ratio = (Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05);
    const size = parseFloat(cs.fontSize), bold = Number(cs.fontWeight)>=700;
    const large = size>=24 || (size>=18.66 && bold);
    const need = large?3:4.5;
    if (ratio < need) out.push({ sel: String(el.className||el.tagName).split(' ')[0], fg: cs.color, bg: 'rgb('+bg.join(',')+')', ratio: +ratio.toFixed(2), need });
  }
  return out;
})()`;

const VIEWS = ['#/','#/paths','#/stats','#/saved'];
let total=0; const agg={}, sel={};
for (const theme of ['system','light','pastel','dark']) {
  const page = await b.newPage({ viewport:{width:1180,height:1000}, colorScheme: theme==='dark'?'dark':'light' });
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.evaluate(t=>{ Store.markToured(); Store.setSetting('theme', t==='system'?'system':t); }, theme);
  for (const v of VIEWS) {
    await page.goto(url+v); await page.reload({waitUntil:'domcontentloaded'});
    await page.waitForTimeout(320);
    const bad = await page.evaluate(SWEEP);
    for (const x of bad) { total++; const k=theme+'|'+x.fg+' on '+x.bg+'|'+x.ratio+'|'+x.need; agg[k]=(agg[k]||0)+1; sel[k]=sel[k]||new Set(); sel[k].add(x.sel); }
  }
  // and the two new dialogs
  await page.goto(url+'#/'); await page.waitForSelector('.cover');
  await page.keyboard.press('?'); await page.waitForSelector('.keys');
  const badK = await page.evaluate(SWEEP);
  for (const x of badK) { total++; const k=theme+'|'+x.fg+' on '+x.bg+'|'+x.ratio+'|'+x.need; agg[k]=(agg[k]||0)+1; sel[k]=sel[k]||new Set(); sel[k].add(x.sel); }
  await page.keyboard.press('Escape');
  await page.click('#btn-settings'); await page.waitForSelector('.modal');
  const badS = await page.evaluate(SWEEP);
  for (const x of badS) { total++; const k=theme+'|'+x.fg+' on '+x.bg+'|'+x.ratio+'|'+x.need; agg[k]=(agg[k]||0)+1; sel[k]=sel[k]||new Set(); sel[k].add(x.sel); }
  await page.close();
}
for (const [k,n] of Object.entries(agg).sort((a,b)=>b[1]-a[1])) {
  const [th,pair,ratio,need]=k.split('|');
  console.log(`${String(n).padStart(4)}×  ${th.padEnd(7)} ${ratio.padStart(5)} < ${need}  ${pair.padEnd(40)} ${[...sel[k]].slice(0,4).join(', ')}`);
}
console.log(total ? `\nFAIL ${total} failures from ${Object.keys(agg).length} distinct colour pairs`
                  : '\nPASS no text below WCAG AA across 4 themes x 6 views');
await b.close(); server.close();
process.exit(total ? 1 : 0);
