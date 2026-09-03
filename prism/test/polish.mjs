import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
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

// Swipe is a touch gesture, so drive it with real touch pointer events.
async function touchSwipe(dx) {
  await page.evaluate(async (dx) => {
    const el = document.getElementById('card');
    const r = el.getBoundingClientRect();
    const x0 = r.left + r.width * 0.6, y = r.top + r.height * 0.5;
    const ev = (type, x) => el.dispatchEvent(new PointerEvent(type, {
      pointerId: 1, pointerType: 'touch', isPrimary: true, button: 0,
      clientX: x, clientY: y, bubbles: true, cancelable: true
    }));
    ev('pointerdown', x0);
    for (let i = 1; i <= 8; i++) { ev('pointermove', x0 + (dx * i) / 8); await new Promise(r => setTimeout(r, 8)); }
    ev('pointerup', x0 + dx);
  }, dx);
  await page.waitForTimeout(430);
}

// --- swipe advances a content card ---
const before = await page.locator('.card h2').textContent();
await touchSwipe(-240);
const after = await page.locator('.card h2, .card .prompt').first().textContent();
ok(before!==after, `touch swipe advances the card (${(before||'').slice(0,24)} -> ${(after||'').slice(0,24)})`);

// --- a short drag springs back rather than advancing ---
const cur = await page.locator('.card h2, .card .prompt').first().textContent();
await touchSwipe(-25);
const same = await page.locator('.card h2, .card .prompt').first().textContent();
ok(cur===same, 'a short touch drag springs back instead of advancing');

// --- mouse drag on card text must NOT swipe (it means text selection) ---
await page.goto(url+`#/lesson/${cid}/${lid}`); await page.waitForSelector('.card');
const beforeMouse = await page.locator('.card h2, .card .prompt').first().textContent();
const mb = await page.locator('.card .body, .card h2').first().boundingBox();
await page.mouse.move(mb.x+mb.width*0.8, mb.y+mb.height*0.5);
await page.mouse.down();
for (let i=1;i<=8;i++) await page.mouse.move(mb.x+mb.width*0.8-i*35, mb.y+mb.height*0.5, {steps:2});
await page.mouse.up();
await page.waitForTimeout(420);
const afterMouse = await page.locator('.card h2, .card .prompt').first().textContent();
ok(beforeMouse===afterMouse, 'mouse drag selects text instead of swiping the card away');

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

// --- stats stays about your progress ---
// With a hundred-plus courses, listing every one turned "Your progress" into a
// wall of empty bars. Untouched courses belong behind a disclosure.
await page.goto(url+'#/stats'); await page.waitForSelector('.badges');
const visibleBars = await page.locator('.course-bars').first().locator('.course-bar').count();
const hiddenLabel = await page.locator('.all-courses summary').textContent().catch(()=>'');
const started = await page.evaluate(()=>window.COURSES.filter(c=>Store.courseProgress(c).done>0).length);
ok(visibleBars <= Math.max(started,1)+1, `stats lists only courses you have started (${visibleBars} shown of ${await page.evaluate(()=>COURSES.length)})`);
ok(/\d+ courses/.test(hiddenLabel||''), `the rest sit behind a disclosure ("${(hiddenLabel||'').trim()}")`);
const collapsed = await page.evaluate(()=>document.documentElement.scrollHeight);
await page.locator('.all-courses summary').click(); await page.waitForTimeout(220);
const expanded = await page.evaluate(()=>document.documentElement.scrollHeight);
ok(expanded > collapsed * 1.5, `expanding it reveals the rest (${collapsed}px -> ${expanded}px)`);

// --- input-appropriate hints ---
// A phone user has nothing to press, so keyboard affordances must not show there.
{
  const touch = await b.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await touch.goto(url,{waitUntil:'domcontentloaded'});
  await touch.evaluate(()=>Store.markToured());
  await touch.reload({waitUntil:'domcontentloaded'});
  await touch.waitForFunction(()=>!!window.COURSES_FULL,null,{timeout:20000});
  await touch.evaluate(a=>{location.hash='#/lesson/'+a[0]+'/'+a[1]},[cid,lid]);
  await touch.waitForSelector('.card');
  for (let i=0;i<8 && !(await touch.locator('.choice').count());i++){ await touch.keyboard.press('Enter'); await touch.waitForTimeout(200); }
  const hint = await touch.evaluate(()=>{const h=document.querySelector('.hint');return h?h.innerText.trim():''});
  ok(hint.length>0 && !/key/i.test(hint), `touch devices get a hint with no keyboard reference ("${hint}")`);
  await touch.close();
}
{
  // the shared page is created hasTouch, so use a genuinely pointer-fine one here
  const desk = await b.newPage({viewport:{width:1100,height:900}});
  await desk.goto(url,{waitUntil:'domcontentloaded'});
  await desk.evaluate(()=>Store.markToured());
  await desk.reload({waitUntil:'domcontentloaded'});
  await desk.waitForFunction(()=>!!window.COURSES_FULL,null,{timeout:20000});
  await desk.evaluate(a=>{location.hash='#/lesson/'+a[0]+'/'+a[1]},[cid,lid]);
  await desk.waitForSelector('.card');
  for (let i=0;i<8 && !(await desk.locator('.choice').count());i++){ await desk.keyboard.press('Enter'); await desk.waitForTimeout(200); }
  const deskHint = await desk.evaluate(()=>{const h=document.querySelector('.hint');return h?h.innerText.trim():''});
  ok(/key/i.test(deskHint), `a keyboard device still gets the shortcut hint ("${deskHint}")`);
  await desk.close();
}

// --- keyboard help ---
await page.goto(url+'#/'); await page.waitForSelector('.cover');
await page.keyboard.press('?');
await page.waitForSelector('.keys',{timeout:4000}).catch(()=>{});
ok(await page.locator('.key-row').count()>=5, 'the ? overlay lists every shortcut');
ok(await page.evaluate(()=>document.activeElement && document.activeElement.id==='keys-close'), 'focus lands in the shortcut dialog');
await page.keyboard.press('Escape'); await page.waitForTimeout(120);
ok(await page.locator('.modal-wrap').count()===0, 'Esc closes the shortcut overlay');
// it must be reachable mid-lesson without disturbing the lesson underneath
await page.goto(url+`#/lesson/${cid}/${lid}`); await page.waitForSelector('.card');
const idxBefore = await page.locator('.card').count();
await page.keyboard.press('?'); await page.waitForSelector('.keys',{timeout:4000}).catch(()=>{});
ok(await page.locator('.keys').count()===1, 'the overlay opens during a lesson');
await page.keyboard.press('Escape'); await page.waitForTimeout(120);
ok(await page.locator('.modal-wrap').count()===0 && await page.locator('.card').count()===idxBefore, 'the lesson is intact after closing it');
// while it is open, a stray digit must not answer the quiz behind it
await page.keyboard.press('?'); await page.waitForSelector('.keys',{timeout:4000}).catch(()=>{});
await page.keyboard.press('1'); await page.waitForTimeout(100);
ok(await page.locator('.keys').count()===1, 'digits do not leak through to the card behind');
await page.keyboard.press('Escape'); await page.waitForTimeout(120);

ok(errs.length===0,'no console errors'+(errs.length?': '+errs.slice(0,2).join(' | '):''));
await b.close(); server.close();
console.log(fail?`${fail} FAILURE(S)`:'ALL PASS');
process.exit(fail?1:0);
