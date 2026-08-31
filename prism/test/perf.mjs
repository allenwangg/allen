import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
const root = '/home/user/allen/prism';
const { chromium } = await import(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const MIME = { '.html':'text/html','.css':'text/css','.js':'text/javascript' };
const server = createServer((req,res)=>{
  let p = join(root, req.url === '/' ? 'index.html' : req.url.replace(/\?.*$/,''));
  if (!existsSync(p)) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200,{'content-type':MIME[extname(p)]||'text/plain'}); res.end(readFileSync(p));
});
await new Promise(r=>server.listen(0,r));
const url = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const page = await browser.newPage({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true });
const t0 = Date.now();
await page.goto(url, { waitUntil:'domcontentloaded' });
await page.waitForSelector('.cover');
console.log(`home interactive: ${Date.now()-t0} ms`);
await page.evaluate(()=>Store.markToured());
// search index build + query over 1507 cards
const searchMs = await page.evaluate(async () => {
  location.hash = '#/search';
  await new Promise(r=>setTimeout(r,150));
  const t = performance.now();
  const input = document.getElementById('search-in');
  input.value = 'memory';
  input.dispatchEvent(new Event('input'));
  return Math.round(performance.now() - t);
});
console.log(`first search (index build + query): ${searchMs} ms`);
const searchMs2 = await page.evaluate(async () => {
  const t = performance.now();
  const input = document.getElementById('search-in');
  input.value = 'entropy'; input.dispatchEvent(new Event('input'));
  return Math.round(performance.now() - t);
});
console.log(`subsequent search: ${searchMs2} ms`);
const hits = await page.locator('.search-hit').count();
console.log(`results for "entropy": ${hits}`);
// Stats render. Measure IN-PAGE: page.goto() on a same-document hash change
// stalls waiting for a load event that never fires, which reports render time
// that is really navigation-wait time.
const statsMs = await page.evaluate(() => {
  const t = performance.now();
  location.hash = '#/stats';
  return new Promise(res => {
    const check = () => document.querySelector('.badges')
      ? res(Math.round(performance.now() - t))
      : requestAnimationFrame(check);
    requestAnimationFrame(check);
  });
});
console.log(`stats render: ${statsMs} ms`);
const over = await page.evaluate(()=>document.documentElement.scrollWidth - window.innerWidth);
console.log(`mobile hoverflow: ${over}px`);
const mem = await page.evaluate(()=>performance.memory ? Math.round(performance.memory.usedJSHeapSize/1048576) : -1);
console.log(`JS heap: ${mem} MB`);
await browser.close(); server.close();
