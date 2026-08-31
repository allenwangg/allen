import { chromium } from 'playwright';
const OUT = process.env.SHOT_DIR || '.';
const BASE = process.env.BASE_URL || 'http://localhost:8080';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errors = [];
page.on('console', m => { if (m.type()==='error') errors.push('CONSOLE: '+m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: '+e.message));
page.on('requestfailed', r => errors.push('REQFAIL: '+r.url()+' '+r.failure()?.errorText));

await page.goto(`${BASE}/app/index.html`, { waitUntil: 'networkidle' });
await page.waitForTimeout(700);

console.log('--- initial load ---');
console.log('title:', await page.title());
console.log('tabs:', await page.$$eval('#tabs .tab', els => els.map(e=>e.textContent.trim())));
console.log('main has content:', (await page.$eval('#main', e=>e.innerHTML.length)) > 200);

// Seed 120 days of realistic data directly through the app's own store module.
console.log('\n--- seeding 120 days via the real store ---');
const seeded = await page.evaluate(async () => {
  const { store } = await import('./js/store.js');
  const { emptyEntry, addDays } = await import('./js/model.js');
  function mul(s){return function(){s|=0;s=(s+0x6D2B79F5)|0;let t=Math.imul(s^(s>>>15),1|s);t=(t+Math.imul(t^(t>>>7),61|t))^t;return ((t^(t>>>14))>>>0)/4294967296;};}
  const r = mul(2024);
  const today = new Date(); const start = new Date(today); start.setDate(start.getDate()-119);
  const key = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  let d = key(start); const rows=[];
  for (let i=0;i<120;i++){
    const e = emptyEntry(d); const p = i/119;
    const dow = new Date(d.split('-')[0], d.split('-')[1]-1, d.split('-')[2]).getDay();
    const weekend = dow===0||dow===6;
    e.sleepHours = 6.2 + p*1.0 + r()*0.9 + (weekend?0.5:0);
    e.sleepQuality = Math.max(1,Math.min(5,Math.round(2.4+p*1.4+r()*1.2)));
    e.bedtimeMinutes = 1320 + Math.round(r()*90) - Math.round(p*30) + (dow===5?70:0);
    e.steps = Math.round(4200 + p*3500 + r()*4000);
    e.exerciseMinutes = (i%2===0)? Math.round(15+p*30+r()*20) : Math.round(r()*10);
    e.exerciseIntensity = Math.round(r()*3);
    e.strengthSession = (i%3===0)?1:0;
    e.proteinGrams = Math.round(78 + p*45 + r()*30);
    e.produceServings = Math.round(1.5 + p*2.5 + r()*2);
    e.ultraProcessed = Math.max(0,Math.round(4.5 - p*2.5 + r()*2));
    e.fiberGrams = Math.round(16 + p*10 + r()*10);
    e.hydrationLitres = Math.round((1.4+p*0.7+r()*0.9)*4)/4;
    e.alcoholUnits = weekend? Math.round(r()*5) : (r()<0.25?Math.round(r()*2):0);
    e.caffeineAfter2pm = r()<0.35 ? Math.round(r()*4)*50 : 0;
    e.stress = Math.max(1,Math.min(5,Math.round(3.6-p*0.9+r()*1.4 - (weekend?0.7:0))));
    e.mood = Math.max(1,Math.min(5,Math.round(2.9+p*1.1+r()*1.2)));
    e.sunlightMinutes = Math.round(12+p*28+r()*30);
    e.socialMinutes = Math.round(r()*180);
    e.restingHR = Math.round(66 - p*6 + r()*5);
    e.hrv = Math.round(36 + p*14 + r()*10);
    e.bodyweightKg = Math.round((84 - p*5 + r()*0.8)*10)/10;
    e.waistCm = Math.round((94 - p*6 + r())*10)/10;
    e.energy = 3;
    rows.push(e);
    const dt = new Date(d.split('-')[0], d.split('-')[1]-1, d.split('-')[2]); dt.setDate(dt.getDate()+1); d = key(dt);
  }
  // Plant a REAL effect: yesterday's alcohol suppresses today's energy.
  const rn = mul(777);
  rows[0].energy = 3;
  for (let i=1;i<rows.length;i++)
    rows[i].energy = Math.max(1,Math.min(5,Math.round(4.5 - rows[i-1].alcoholUnits*0.55 + (rn()-0.5)*1.8)));
  await store.putMany(rows);
  await store.setMeta('profile', { age: 42, weightKg: 82 });
  return rows.length;
});
console.log('seeded rows:', seeded);

await page.evaluate(() => { location.hash = '#today'; });
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1400);

console.log("\n--- TODAY view ---");
console.log('sections in order:', await page.$$eval('#main .card h2, #main .card h3', els => els.map(e => e.textContent.trim()).slice(0, 5)));
{
  const txt = await page.$eval('#main', e => e.textContent);
  // The vanity metrics are gone and must stay gone.
  if (/healthspan age/i.test(txt)) throw new Error('healthspan age is back on the dashboard');
  if (/\bstreak\b/i.test(txt)) throw new Error('streak brag is back on the dashboard');
  const headings = await page.$$eval('#main .card h2, #main .card h3', els => els.map(e => e.textContent.trim()));
  if (!headings.some(h => /change one thing|job/i.test(h))) {
    throw new Error('the one-action card is missing from Today');
  }
}
await page.screenshot({ path: OUT + '/01-today.png', fullPage: true });

console.log('\n--- INSIGHTS ---');
await page.click('[data-action="goto"][data-view="insights"]');
await page.waitForTimeout(2500);
const insights = await page.$$eval('.insight', els => els.map(e => ({
  verdict: e.querySelector('.pill')?.textContent.trim(),
  text: e.querySelector('.insight-text')?.textContent.trim(),
  stats: e.querySelector('.insight-stats')?.textContent.replace(/\s+/g,' ').trim(),
})));
console.log('findings:', insights.length);
insights.forEach((i,n)=>console.log(`  ${n+1}. [${i.verdict}] ${i.text}\n      ${i.stats}`));
console.log('scatter charts rendered:', await page.$$eval('.chart-scatter', e=>e.length));
// The seed contains one genuine planted effect (yesterday's alcohol suppresses
// today's energy) buried in habits that all trend together. Detrending should
// leave that one and discard the trend-driven rest.
const hasPlanted = insights.some(i => /alcohol/i.test(i.text) && /energy/i.test(i.text));
console.log('planted alcohol -> energy effect recovered:', hasPlanted);
if (!hasPlanted) throw new Error('planted effect was not surfaced in the UI');
await page.screenshot({ path: OUT+'/03-insights.png', fullPage: true });

console.log('\n--- SYMPTOMS end to end ---');
{
  const sctx = await browser.newContext();
  const sp = await sctx.newPage();
  sp.on('pageerror', e => errors.push('SYMPTOM PAGEERROR: ' + e.message));
  await sp.goto(`${BASE}/app/index.html`, { waitUntil: 'networkidle' });
  await sp.waitForTimeout(700);
  // Seed a log where one habit genuinely drives one symptom.
  await sp.evaluate(async () => {
    const { store } = await import('./js/store.js');
    const { emptyEntry, addDays, dateKey, validateSymptoms } = await import('./js/model.js');
    function mul(s){return function(){s|=0;s=(s+0x6D2B79F5)|0;let t=Math.imul(s^(s>>>15),1|s);t=(t+Math.imul(t^(t>>>7),61|t))^t;return ((t^(t>>>14))>>>0)/4294967296;};}
    const syms = validateSymptoms([{ label: 'Migraine' }, { label: 'Bloating' }]);
    await store.setMeta('symptoms', syms);
    const [id, id2] = syms.map(x => x.id);
    const r = mul(11); const rows = []; let d = addDays(dateKey(), -149);
    for (let i = 0; i < 150; i++) {
      const e = emptyEntry(d, syms);
      e.sleepHours = 6 + r() * 2.5; e.steps = Math.round(3000 + r() * 8000);
      e.alcoholUnits = Math.round(r() * 4); e.mood = 1 + Math.floor(r() * 5);
      e.energy = 1 + Math.floor(r() * 5); e.stress = 1 + Math.floor(r() * 5);
      e.sleepQuality = 1 + Math.floor(r() * 5); e.exerciseMinutes = Math.round(r() * 60);
      e.symptoms[id] = 0; e.symptoms[id2] = r() < 0.3 ? 1 + Math.floor(r() * 3) : 0;
      rows.push(e); d = addDays(d, 1);
    }
    const rn = mul(77);
    for (let i = 1; i < rows.length; i++) {
      rows[i].symptoms[id] = Math.max(0, Math.min(4, Math.round(rows[i - 1].alcoholUnits * 0.8 + (rn() - 0.5) * 1.4)));
    }
    await store.putMany(rows);
  });
  await sp.evaluate(() => { location.hash = '#insights'; });
  await sp.reload({ waitUntil: 'networkidle' });
  await sp.waitForTimeout(3000);

  const cards = await sp.$$eval('.insight', els => els.map(e => ({
    text: e.querySelector('.insight-text')?.textContent.trim() || '',
    dots: e.querySelectorAll('.scatter-dot').length,
  })));
  console.log('symptom insight cards:', cards.length);
  // The whole feature was once dead in the running app while unit tests passed,
  // because the symptom list was dropped from the discover() call. This asserts
  // the wiring, not just the engine.
  const hit = cards.find(c => /migraine/i.test(c.text));
  if (!hit) throw new Error('the planted symptom driver never reached the UI');
  if (!/costing you/i.test(hit.text)) throw new Error('symptom verdict direction is wrong: ' + hit.text);
  if (hit.dots < 20) throw new Error('symptom finding rendered with an empty evidence chart');
  const body = await sp.$eval('#main', e => e.textContent);
  if (/s_[a-z0-9]{6,}/.test(body)) throw new Error('a raw symptom id leaked into the UI');
  console.log('  named, correctly signed, with', hit.dots, 'evidence points');
  await sctx.close();
}

console.log('\n--- SIMULATOR ---');
await page.click('[data-action="goto"][data-view="simulator"]');
await page.waitForTimeout(600);
const before = await page.$$eval('.stat-value', e=>e.map(x=>x.textContent.trim()));
await page.$eval('[data-sim="sleepHours"]', el => { el.value = 1.5; el.dispatchEvent(new Event('input',{bubbles:true})); });
await page.waitForTimeout(500);
console.log('sim stats after +1.5h sleep:', await page.$$eval('.stat-value', e=>e.map(x=>x.textContent.trim())));
await page.screenshot({ path: OUT+'/04-simulator.png', fullPage: true });

console.log('\n--- LOG view ---');
await page.click('[data-action="goto"][data-view="log"]');
await page.waitForTimeout(500);
console.log('fields rendered:', await page.$$eval('.field', e=>e.length));
console.log('live score:', await page.$eval('.stat-value', e=>e.textContent));
await page.screenshot({ path: OUT+'/05-log.png', fullPage: true });

console.log('\n--- HISTORY ---');
await page.click('[data-action="goto"][data-view="history"]');
await page.waitForTimeout(500);
console.log('history rows:', await page.$$eval('.table tbody tr', e=>e.length));
await page.screenshot({ path: OUT+'/06-history.png', fullPage: true });

console.log('\n--- dark mode ---');
await ctx.close();
const dark = await browser.newContext({ viewport:{width:1280,height:1000}, deviceScaleFactor:2, colorScheme:'dark' });
const dp = await dark.newPage();
dp.on('pageerror', e => errors.push('DARK PAGEERROR: '+e.message));
await dp.goto(`${BASE}/app/index.html`, { waitUntil:'networkidle' });
await dp.waitForTimeout(800);
await dp.screenshot({ path: OUT+'/07-dark.png', fullPage: true });

console.log('\n=== ERRORS ===');
console.log(errors.length ? errors.join('\n') : 'none');
await browser.close();
