/**
 * Contrast audit: every text node on every view, in both themes, against WCAG AA.
 *
 * WHY IT IS A SCRIPT AND NOT A CHECKLIST. Three of the numbers I first quoted
 * while writing this were fiction, all from the same cause: Chromium serialises
 * color-mix() as "color(srgb 0.757 0.290 0.239 / 0.16)" — components in 0..1 —
 * while rgb()/rgba() uses 0..255. Reading the first as the second turns a pale
 * pink pill background into near-black, and every ratio computed from it is
 * nonsense in an unpredictable direction. It also has to composite each
 * semi-transparent background down through its ancestors before comparing,
 * which no amount of squinting at a screenshot will do for you.
 *
 * What it found, all of it real: the verdict pills on every insight card at
 * 3.55:1, and — worse — the SELECTED severity button in dark mode at 2.63:1,
 * white on a light salmon fill. That is the app's primary input control.
 *
 * Run with: npm run contrast
 */
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const VIEWS = ['today','insights','trials','report','log','settings','simulator','history'];
let total = 0;
for (const scheme of ['light','dark']) {
  const p = await (await b.newContext({viewport:{width:1180,height:1000}, colorScheme:scheme})).newPage();
  await p.goto('http://localhost:8080/app/index.html#today',{waitUntil:'networkidle'});
  await p.waitForTimeout(700);
  await p.click('[data-action="load-sample"]'); await p.waitForTimeout(4000);
  const bad = [];
  for (const v of VIEWS) {
    await p.evaluate(x=>{location.hash='#'+x}, v); await p.waitForTimeout(2400);
    // Selected states are where the worst offender lived: a solid --bad fill
    // with white text, which is fine in the light theme and 2.63:1 in the dark
    // one. Nothing selects them on load, so the audit has to.
    if (v === 'log') {
      await p.evaluate(() => {
        for (const sel of ['.sym-seg button[data-value="3"]', '.fac-seg button[data-value="3"]']) {
          const el = document.querySelector(sel); if (el) el.click();
        }
      });
      await p.waitForTimeout(1000);
    }
    bad.push(...await p.evaluate((view) => {
      // Chromium serialises color-mix() as "color(srgb r g b / a)" with 0-1
      // floats, and rgb()/rgba() with 0-255. Reading the first as the second
      // turns a pale pink into near-black and every ratio computed from it is
      // fiction. Ask me how I know.
      const parse = (c) => {
        if (!c) return {r:0,g:0,b:0,a:0};
        const n = (c.match(/-?[\d.]+(e-?\d+)?/g)||[]).map(Number);
        if (/^color\(/.test(c)) return { r:n[0]*255, g:n[1]*255, b:n[2]*255, a:n.length>3?n[3]:1 };
        return { r:n[0], g:n[1], b:n[2], a:n.length>3?n[3]:1 };
      };
      const over = (f,bg) => ({ r:f.r*f.a+bg.r*(1-f.a), g:f.g*f.a+bg.g*(1-f.a), b:f.b*f.a+bg.b*(1-f.a), a:1 });
      const bgOf = (el) => {
        const st=[]; let n=el;
        while (n) { const c=parse(getComputedStyle(n).backgroundColor);
          if (c.a>0) { st.push(c); if (c.a>=1) break; } n=n.parentElement; }
        let o = {r:255,g:255,b:255,a:1};
        const last = st[st.length-1];
        if (!last || last.a < 1) st.push({r:255,g:255,b:255,a:1});
        for (let i=st.length-1;i>=0;i--) o = over(st[i], o);
        return o;
      };
      const lum = (c) => { const f=(v)=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);};
        return 0.2126*f(c.r)+0.7152*f(c.g)+0.0722*f(c.b); };
      const ratio = (f,bg) => { const a=lum(f),b2=lum(bg); const [hi,lo]=a>b2?[a,b2]:[b2,a]; return (hi+0.05)/(lo+0.05); };
      const out=[],seen=new Set();
      for (const el of document.querySelectorAll('#main *, header *')) {
        if(![...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim().length>2)) continue;
        const cs=getComputedStyle(el);
        if (cs.visibility==='hidden'||cs.display==='none'||+cs.opacity===0) continue;
        const bg=bgOf(el); const fg=over(parse(cs.color), bg);
        const key=cs.color+'|'+[bg.r,bg.g,bg.b].map(Math.round)+'|'+cs.fontSize+'|'+(el.className||el.tagName);
        if(seen.has(key))continue; seen.add(key);
        const px=parseFloat(cs.fontSize); const large=px>=24||(px>=18.66&&+cs.fontWeight>=700);
        const r=ratio(fg,bg); const need=large?3:4.5;
        if(r<need-0.005) out.push(`${view}: ${r.toFixed(2)} (need ${need}) ${px}px .${(el.className||el.tagName).toString().slice(0,26)} "${el.textContent.trim().slice(0,24)}"`);
      }
      return out;
    }, v));
  }
  const uniq=[...new Set(bad)];
  total += uniq.length;
  console.log(`--- ${scheme} --- ${uniq.length ? uniq.length+' below AA' : 'all text passes WCAG AA'}`);
  for (const x of uniq.slice(0,10)) console.log('   ' + x);
}
await b.close();
process.exit(total ? 1 : 0);
