import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
const root='/home/user/allen/prism';
const { chromium } = await import(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const MIME={'.html':'text/html','.css':'text/css','.js':'text/javascript'};
const server=createServer((q,r)=>{let p=join(root,q.url==='/'?'index.html':q.url.replace(/\?.*$/,''));
 if(!existsSync(p)){r.writeHead(404);return r.end('nf');} r.writeHead(200,{'content-type':MIME[extname(p)]||'text/plain'}); r.end(readFileSync(p));});
await new Promise(r=>server.listen(0,r));
const url=`http://127.0.0.1:${server.address().port}/`;
let fail=0; const ok=(c,n)=>{console.log((c?'PASS ':'FAIL ')+n); if(!c)fail++;};
const b=await chromium.launch({executablePath: process.env.CHROMIUM || undefined});
const page=await b.newPage({viewport:{width:900,height:850},hasTouch:true});
const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
page.on('console',m=>{if(m.type()==='error'&&((m.location()||{}).url||'').startsWith('http://127.0.0.1'))errs.push(m.text());});

await page.goto(url,{waitUntil:'domcontentloaded'});
if (await page.locator('#tour-go').count()) await page.locator('#tour-go').click();
const [cid,lid] = await page.evaluate(()=>[window.COURSES[0].id, window.COURSES[0].lessons[0].id]);

// --- live region + focus ---
await page.goto(url+`#/lesson/${cid}/${lid}`); await page.waitForSelector('.card');
await page.waitForTimeout(220);
ok(await page.locator('[role="status"][aria-live="polite"]').count()===1,'a single polite live region exists');
const ann = await page.locator('[role="status"]').textContent();
ok(/Card 1 of \d+/.test(ann||''), `card change is announced (${(ann||'').slice(0,40)}…)`);
ok(await page.evaluate(()=>document.activeElement && document.activeElement.id==='card'),'focus moves into the card');
ok(await page.evaluate(()=>!document.getElementById('app').hasAttribute('aria-live')),'router root is not a live region');

// --- swipe advances a content card ---
const before = await page.locator('.card h2').textContent();
const box = await page.locator('#card').boundingBox();
await page.mouse.move(box.x+box.width*0.6, box.y+box.height*0.5);
await page.mouse.down();
for (let i=1;i<=8;i++) await page.mouse.move(box.x+box.width*0.6-i*30, box.y+box.height*0.5, {steps:2});
await page.mouse.up();
await page.waitForTimeout(420);
const after = await page.locator('.card h2, .card .prompt').first().textContent();
ok(before!==after, `swipe left advances the card (${(before||'').slice(0,24)} -> ${(after||'').slice(0,24)})`);

// --- a short drag springs back rather than advancing ---
const cur = await page.locator('.card h2, .card .prompt').first().textContent();
const box2 = await page.locator('#card').boundingBox();
await page.mouse.move(box2.x+box2.width*0.6, box2.y+box2.height*0.5);
await page.mouse.down();
await page.mouse.move(box2.x+box2.width*0.6-25, box2.y+box2.height*0.5, {steps:4});
await page.mouse.up();
await page.waitForTimeout(400);
const same = await page.locator('.card h2, .card .prompt').first().textContent();
ok(cur===same, 'a short drag springs back instead of advancing');

// --- mastery map appears once review data exists ---
await page.goto(url+`#/course/${cid}`); await page.waitForSelector('.lesson-row');
ok(await page.locator('.mastery').count()===0,'mastery map hidden before any review data');
await page.evaluate((cid)=>{
  const c = window.COURSES.find(x=>x.id===cid);
  Store.completeLesson(c.id, c.lessons[0].id, 90);
  Store.addReviewItems(c, c.lessons[0]);
  // simulate one lesson well retained and one shaky
  const keys = Object.keys(Store.state.srs).filter(k=>k.startsWith(c.id+'/'+c.lessons[0].id));
  keys.forEach((k,i)=>{ const it=Store.state.srs[k]; it.state='review'; it.ivl = i<3 ? 30 : 2; });
  Store.completeLesson(c.id, c.lessons[1].id, 60);
  Store.addReviewItems(c, c.lessons[1]);
  Object.keys(Store.state.srs).filter(k=>k.startsWith(c.id+'/'+c.lessons[1].id))
    .forEach(k=>{ const it=Store.state.srs[k]; it.state='review'; it.ivl=1; it.lapses=2; });
  Store.save();
}, cid);
await page.goto(url+'#/'); await page.goto(url+`#/course/${cid}`);
await page.waitForSelector('.mastery');
const bands = await page.locator('.m-band').allTextContents();
ok(bands.length>=4, `mastery map lists every lesson (${bands.length})`);
ok(bands.includes('Solid'), `a well-retained lesson reads Solid (${bands.join(', ')})`);
ok(bands.includes('Shaky') || bands.includes('Growing'), 'a poorly-retained lesson is not marked Solid');
ok(bands.filter(b=>b==='Not started').length>=1, 'unstudied lessons read Not started');

ok(errs.length===0,'no console errors'+(errs.length?': '+errs.slice(0,2).join(' | '):''));
await b.close(); server.close();
console.log(fail?`${fail} FAILURE(S)`:'ALL PASS');
process.exit(fail?1:0);
