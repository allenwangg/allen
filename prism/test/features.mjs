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
const page=await b.newPage({viewport:{width:1180,height:900}});
const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
page.on('console',m=>{if(m.type()==='error'&&((m.location()||{}).url||'').startsWith('http://127.0.0.1'))errs.push(m.text());});

await page.goto(url,{waitUntil:'domcontentloaded'});
if (await page.locator('#tour-go').count()) await page.locator('#tour-go').click();

// --- paths ---
await page.goto(url+'#/paths'); await page.waitForSelector('.path-card');
const nPaths = await page.evaluate(()=>Paths.available(id=>window.COURSES.find(c=>c.id===id)).length);
ok(await page.locator('.path-card').count()===nPaths, `paths index lists every available path (${nPaths})`);
// a path may name a course that has not shipped yet; it must never render a dead row
const pathHealth = await page.evaluate(()=>{
  const find = id => window.COURSES.find(c=>c.id===id);
  const ids = new Set(window.COURSES.map(c=>c.id));
  let unshipped = 0, emptyShown = 0;
  for (const p of Paths.list) {
    for (const cid of p.courses) if (!ids.has(cid)) unshipped++;
    const live = Paths.coursesOf(p, find);
    const pr = Paths.progress(p, find, c=>Store.courseProgress(c));
    if (pr.total !== live.length) emptyShown++;      // totals must count only real courses
  }
  return { unshipped, emptyShown, shown: Paths.available(find).length };
});
ok(pathHealth.emptyShown===0, `path totals count only shipped courses (${pathHealth.unshipped} not yet shipped, handled)`);
await page.locator('.path-card').first().click();
await page.waitForSelector('.lesson-row');
ok(await page.locator('.lesson-row').count()>=4, 'path detail lists its courses');
ok(await page.locator('.up-tag').count()===1, 'path marks exactly one course as next up');

// --- Today plan ---
await page.goto(url+'#/today'); await page.waitForSelector('.plan-step, .today-cta');
const steps0 = await page.locator('.plan-step').count();
ok(steps0>=1, `today builds a plan (${steps0} steps)`);

// run the session end to end
await page.locator('#today-go').click();
let guard=0, sawFlowBtn=false, idle=0;
while(guard++<250){
  if (await page.locator('.done-card').count() && await page.locator('.player-foot a[href="#/"]').count() && !(await page.locator('#flow-next').count())) break;
  let acted = true;
  if (await page.locator('#flow-next').count()) { sawFlowBtn=true; await page.locator('#flow-next').click(); }
  else if (await page.locator('#btn-flip').count()) await page.locator('#btn-flip').click();
  else if (await page.locator('.grade.g2').count()) await page.locator('.grade.g2').click();
  else if (await page.locator('#btn-reveal').count()) await page.locator('#btn-reveal').click();
  else if (await page.locator('.choice:not(:disabled)').count()) await page.locator('.choice').first().click();
  else if (await page.locator('#btn-next').count()) await page.locator('#btn-next').click();
  else if (await page.locator('#btn-match').count()) break;
  else acted = false;
  // The DOM is briefly empty between renders (focus + announce are async), so a
  // single quiet poll is not the end of the session — only give up after several.
  if (!acted) { if (++idle > 5) break; } else { idle = 0; }
  await page.waitForTimeout(90);
}
ok(sawFlowBtn, 'session chains between steps with a Next button');
const doneTxt = await page.locator('.done-card h2').textContent().catch(()=>'');
ok(/today handled/i.test(doneTxt||''), `session finishes with its own summary (${(doneTxt||'').trim()})`);

// --- saved cards ---
const [cid,lid] = await page.evaluate(()=>[window.COURSES[0].id, window.COURSES[0].lessons[2].id]);
await page.goto(url+`#/lesson/${cid}/${lid}`); await page.waitForSelector('#btn-save');
await page.locator('#btn-save').click(); await page.waitForTimeout(120);
ok(await page.evaluate(()=>JSON.parse(localStorage.getItem('prism.v1')).saved.length)===1,'bookmark persists a card');
await page.goto(url+'#/saved'); await page.waitForSelector('.saved-card');
ok(await page.locator('.saved-card').count()===1,'saved page lists the bookmarked card');
// unsave round-trip
await page.goto(url+`#/lesson/${cid}/${lid}`); await page.waitForSelector('#btn-save');
await page.locator('#btn-save').click(); await page.waitForTimeout(120);
ok(await page.evaluate(()=>JSON.parse(localStorage.getItem('prism.v1')).saved.length)===0,'un-bookmark removes it');

// --- streak freeze economy ---
await page.goto(url+'#/');            // reload must not land back inside a lesson
const frz = await page.evaluate(()=>{
  const S=JSON.parse(localStorage.getItem('prism.v1'));
  // simulate 10 goal-days then a one-day gap
  const day=(n)=>{const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()-n);return Store.dayKey(d.getTime());};
  for(let i=2;i<12;i++){S.xpByDay[day(i)]=100;S.goalDays[day(i)]=true;}
  S.lastActiveDay=day(2); S.freezes=0; S.freezesEarned=0; S.frozenDays={};
  localStorage.setItem('prism.v1',JSON.stringify(S));
  return true;
});
await page.reload({waitUntil:'domcontentloaded'});
const earned = await page.evaluate(()=>{ Store.grantFreezeIfEarned(); return Store.state.freezes; });
ok(earned>0, `freezes accrue from goal-days (${earned} banked, capped at 3)`);
const covered = await page.evaluate(()=>Store.applyFreeze());
ok(!!covered, `a one-day gap is covered by a freeze (${covered})`);
const streakNow = await page.evaluate(()=>Store.streak());
ok(streakNow>=11, `streak survives the covered gap (${streakNow} days)`);

// --- narration module present and safe ---
ok(await page.evaluate(()=>typeof TTS==='object' && typeof TTS.speak==='function'),'narration module loads');

ok(errs.length===0,'no console errors'+(errs.length?': '+errs.slice(0,2).join(' | '):''));
await b.close(); server.close();
console.log(fail?`${fail} FAILURE(S)`:'ALL PASS');
process.exit(fail?1:0);
