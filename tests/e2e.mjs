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

console.log("\n--- the symptom lifecycle ---");
{
  const lctx = await browser.newContext();
  const lp = await lctx.newPage();
  lp.on('pageerror', e => errors.push('LIFECYCLE PAGEERROR: ' + e.message));
  await lp.goto(`${BASE}/app/index.html`, { waitUntil: 'networkidle' });
  await lp.waitForTimeout(700);

  const ids = await lp.evaluate(async () => {
    const { store } = await import('./js/store.js');
    const { emptyEntry, addDays, dateKey, validateSymptoms } = await import('./js/model.js');
    const syms = validateSymptoms([{ label: 'Migraine' }]);
    await store.setMeta('symptoms', syms);
    const rows = []; let d = addDays(dateKey(), -29);
    // Severity cycles 1..3 so no day holds the default of 0 — otherwise
    // "the past day shows its own rating" passes even when it is showing
    // today's blank draft.
    for (let i = 0; i < 30; i++) { const e = emptyEntry(d, syms); e.symptoms[syms[0].id] = (i % 3) + 1; rows.push(e); d = addDays(d, 1); }
    await store.putMany(rows);
    return { migraine: syms[0].id };
  });
  await lp.reload({ waitUntil: 'networkidle' });
  await lp.waitForTimeout(1200);

  // Editing a past day must load THAT day's ratings.
  await lp.evaluate(() => { location.hash = '#log'; });
  await lp.waitForTimeout(600);
  const past = await lp.evaluate(async (ids) => {
    const { store } = await import('./js/store.js');
    const { addDays, dateKey } = await import('./js/model.js');
    const target = addDays(dateKey(), -6);
    const stored = (await store.getEntry(target)).symptoms[ids.migraine];
    const input = document.getElementById('log-date');
    input.value = target;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 900));
    const pressed = [...document.querySelectorAll(`[data-symptom="${ids.migraine}"]`)]
      .find((b) => b.getAttribute('aria-pressed') === 'true')?.dataset.value;
    return { stored, shown: pressed == null ? null : Number(pressed) };
  }, ids);
  if (past.stored === 0) throw new Error('test setup: pick a day whose rating is not the default');
  if (past.shown !== past.stored) {
    throw new Error(`editing a past day shows ${past.shown} but that day stored ${past.stored}`);
  }
  console.log('  a past day loads its own ratings:', past.stored);

  // Adding a symptom must not backfill fabricated zeros onto old days.
  await lp.evaluate(() => { location.hash = '#settings'; });
  await lp.waitForTimeout(600);
  await lp.fill('#new-symptom', 'Nausea');
  await lp.click('[data-action="add-symptom"]');
  await lp.waitForTimeout(900);
  const added = await lp.evaluate(async () => {
    const { store } = await import('./js/store.js');
    const { addDays, dateKey } = await import('./js/model.js');
    const syms = await store.getMeta('symptoms');
    const nausea = syms.find((s) => s.label === 'Nausea').id;
    const old = await store.getEntry(addDays(dateKey(), -20));
    return { count: syms.length, backfilled: nausea in (old.symptoms || {}) };
  });
  if (added.count !== 2) throw new Error('adding a symptom did not persist');
  if (added.backfilled) {
    throw new Error('a new symptom backfilled zeros onto days before it existed — inventing observations');
  }
  console.log('  a new symptom does not invent history:', true);

  // Removing a symptom must keep the days already logged.
  await lp.evaluate(() => { window.confirm = () => true; });
  await lp.click(`[data-action="remove-symptom"][data-id="${ids.migraine}"]`);
  await lp.waitForTimeout(900);
  const removed = await lp.evaluate(async (ids) => {
    const { store } = await import('./js/store.js');
    const { addDays, dateKey } = await import('./js/model.js');
    const e = await store.getEntry(addDays(dateKey(), -6));
    return { catalogue: (await store.getMeta('symptoms')).length, kept: e.symptoms[ids.migraine] };
  }, ids);
  if (removed.catalogue !== 1) throw new Error('removing a symptom did not persist');
  if (removed.kept === undefined) throw new Error('removing a symptom destroyed the days already logged');
  console.log('  removing a symptom keeps its history:', removed.kept);

  // And nothing may break afterwards — orphaned ids must not surface.
  for (const view of ['today', 'insights', 'report', 'history', 'log']) {
    await lp.evaluate((v) => { location.hash = '#' + v; }, view);
    await lp.waitForTimeout(view === 'insights' ? 1800 : 600);
    const t = await lp.$eval('#main', (e) => e.textContent);
    if (/Something went wrong/.test(t)) throw new Error(view + ' throws after a symptom is removed');
    if (/\bundefined\b/.test(t)) throw new Error(view + ' renders "undefined" after a symptom is removed');
    if (/s_[a-z0-9]{6,}/.test(t)) throw new Error(view + ' leaks an orphaned symptom id');
  }
  console.log('  every view survives the removal');
  await lctx.close();
}

console.log("\n--- phone layout and touch targets ---");
{
  const mctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    colorScheme: 'dark',
  });
  const mp = await mctx.newPage();
  mp.on('pageerror', e => errors.push('MOBILE PAGEERROR: ' + e.message));
  await mp.goto(`${BASE}/app/index.html`, { waitUntil: 'networkidle' });
  await mp.waitForTimeout(600);

  // ASSERT THE HARNESS FIRST. Touch emulation can silently fail to apply, and
  // then every measurement below is of a desktop rendering at a narrow
  // viewport — which looks like a real failure and is not. An earlier version
  // of this check reported seventeen undersized sliders that were correctly
  // sized on any actual phone.
  const emulation = await mp.evaluate(() => ({
    coarse: matchMedia('(pointer: coarse)').matches,
    touchPoints: navigator.maxTouchPoints,
  }));
  if (!emulation.coarse || emulation.touchPoints < 1) {
    throw new Error('touch emulation is not active (' + JSON.stringify(emulation) + '); measurements would be meaningless');
  }

  await mp.evaluate(async () => {
    const { store } = await import('./js/store.js');
    const { generateSampleData, SAMPLE_SYMPTOMS, SAMPLE_PROFILE } = await import('./js/sample.js');
    await store.setMeta('symptoms', SAMPLE_SYMPTOMS);
    await store.setMeta('profile', SAMPLE_PROFILE);
    await store.putMany(generateSampleData());
  });

  for (const view of ['today', 'log', 'insights', 'trials', 'report', 'settings']) {
    await mp.evaluate((v) => { location.hash = '#' + v; }, view);
    await mp.reload({ waitUntil: 'networkidle' });
    await mp.waitForTimeout(view === 'insights' ? 2500 : 900);
    const r = await mp.evaluate(() => ({
      coarse: matchMedia('(pointer: coarse)').matches,
      overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      small: [...document.querySelectorAll('#main button, #main input, #main select')]
        .filter((e) => {
          const b = e.getBoundingClientRect();
          return b.width > 0 && b.height < 32;
        })
        .map((e) => `${e.tagName}${e.type ? '[' + e.type + ']' : ''} ${Math.round(e.getBoundingClientRect().height)}px`),
    }));
    if (!r.coarse) throw new Error(`${view}: touch emulation was lost mid-run`);
    if (r.overflow) throw new Error(`${view}: the page scrolls sideways at 390px`);
    if (r.small.length) {
      throw new Error(`${view}: ${r.small.length} controls under 32px tall on a phone — ${r.small.slice(0, 3).join(', ')}`);
    }
    console.log(`  ${view}: no sideways scroll, all controls >= 32px`);
  }
  await mctx.close();
}

console.log("\n--- the report, printed ---");
for (const scheme of ['light', 'dark']) {
  // The report is the thing you hand a doctor, and printing it from dark mode
  // used to produce near-black card backgrounds with light-grey text on white
  // paper. Theme tokens have to be reset for print; setting body colours alone
  // does not reach the rules that read them.
  const pctx = await browser.newContext({ viewport: { width: 900, height: 1200 }, colorScheme: scheme });
  const pp = await pctx.newPage();
  pp.on('pageerror', e => errors.push('PRINT PAGEERROR: ' + e.message));
  await pp.goto(`${BASE}/app/index.html`, { waitUntil: 'networkidle' });
  await pp.waitForTimeout(600);
  await pp.evaluate(async () => {
    const { store } = await import('./js/store.js');
    const { generateSampleData, SAMPLE_SYMPTOMS, SAMPLE_PROFILE } = await import('./js/sample.js');
    await store.setMeta('symptoms', SAMPLE_SYMPTOMS);
    await store.setMeta('profile', SAMPLE_PROFILE);
    await store.putMany(generateSampleData());
  });
  await pp.evaluate(() => { location.hash = '#report'; });
  await pp.reload({ waitUntil: 'networkidle' });
  await pp.waitForTimeout(2500);
  await pp.emulateMedia({ media: 'print' });
  await pp.waitForTimeout(400);

  const probe = await pp.evaluate(() => {
    const lum = (rgb) => {
      const [r, g, b] = rgb.match(/\d+/g).map(Number).map((v) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const ratio = (a, b) => {
      const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
      return (x + 0.05) / (y + 0.05);
    };
    const card = document.querySelector('#print-report .card');
    const muted = document.querySelector('#print-report .muted');
    const cardBg = getComputedStyle(card).backgroundColor;
    return {
      cardBg,
      mutedContrast: muted ? ratio(getComputedStyle(muted).color, cardBg) : null,
      furniture: [...document.querySelectorAll('.banner, #update-banner, [data-flag], .topbar')]
        .filter((e) => getComputedStyle(e).display !== 'none').length,
    };
  });
  if (!/255,\s*255,\s*255/.test(probe.cardBg)) {
    throw new Error(`${scheme}: report cards print with background ${probe.cardBg}, not white`);
  }
  if (probe.mutedContrast < 4.5) {
    throw new Error(`${scheme}: printed body text contrast is ${probe.mutedContrast.toFixed(2)}:1`);
  }
  if (probe.furniture > 0) {
    throw new Error(`${scheme}: ${probe.furniture} piece(s) of screen furniture print with the report`);
  }
  console.log(`  ${scheme}: white cards, ${probe.mutedContrast.toFixed(1)}:1 text, no screen furniture`);
  await pctx.close();
}

console.log("\n--- a trial from start to verdict ---");
{
  // The trial engine is well tested as a function; what was never verified is
  // that a trial actually COMPLETES in the app. Each scenario drives the real
  // app to a finished trial and checks the screen against what the engine
  // returned for the same data.
  const SCENARIOS = [
    ['genuine effect', { adhere: 1.0, contrast: 1.0, effect: 1.6 }, 'helped'],
    ['no effect',      { adhere: 1.0, contrast: 1.0, effect: 0.0 }, 'no-effect'],
    ['poor adherence', { adhere: 0.3, contrast: 1.0, effect: 1.6 }, 'not-run'],
    ['no contrast',    { adhere: 1.0, contrast: 0.0, effect: 1.6 }, 'no-contrast'],
  ];
  for (const [name, cfg, expected] of SCENARIOS) {
    const kctx = await browser.newContext();
    const kp = await kctx.newPage();
    kp.on('pageerror', e => errors.push('TRIAL PAGEERROR: ' + e.message));
    await kp.goto(`${BASE}/app/index.html`, { waitUntil: 'networkidle' });
    await kp.waitForTimeout(600);
    await kp.evaluate(async (cfg) => {
      const { store } = await import('./js/store.js');
      const { emptyEntry, addDays, dateKey, validateSymptoms } = await import('./js/model.js');
      const { createTrial, armForDate, trialDays } = await import('./js/experiments.js');
      function mul(s){return function(){s|=0;s=(s+0x6D2B79F5)|0;let t=Math.imul(s^(s>>>15),1|s);t=(t+Math.imul(t^(t>>>7),61|t))^t;return ((t^(t>>>14))>>>0)/4294967296;};}
      const syms = validateSymptoms([{ label: 'Migraine' }]);
      await store.setMeta('symptoms', syms);
      const id = syms[0].id;
      const { trial } = createTrial({ leverId: 'no-late-caffeine', outcome: id, outcomeLabel: 'Migraine',
        pairs: 7, startDate: addDays(dateKey(), -30), seed: 1234 });
      await store.setMeta('trials', [trial]);
      const r = mul(99); const rows = [];
      for (let i = 0; i < trialDays(trial); i++) {
        const date = addDays(trial.startDate, i);
        const e = emptyEntry(date, syms);
        const arm = armForDate(trial, date);
        e.caffeineAfter2pm = arm === 'on' ? (r() < cfg.adhere ? 0 : 200) : (r() < cfg.contrast ? 200 : 0);
        const exposure = e.caffeineAfter2pm > 0 ? 1 : 0;
        e.symptoms[id] = Math.max(0, Math.min(4, Math.round(0.8 + exposure * cfg.effect + (r() - 0.5) * 1.2)));
        rows.push(e);
      }
      await store.putMany(rows);
    }, cfg);
    await kp.evaluate(() => { location.hash = '#trials'; });
    await kp.reload({ waitUntil: 'networkidle' });
    await kp.waitForTimeout(2200);
    const res = await kp.evaluate(async () => {
      const { store } = await import('./js/store.js');
      const { verdict } = await import('./js/experiments.js');
      const v = verdict((await store.getMeta('trials'))[0], await store.allEntries());
      return {
        kind: v.kind,
        engine: v.headline,
        screen: document.querySelector('.insight h3')?.textContent?.trim() || null,
        stillHiding: /No results until it finishes/i.test(document.querySelector('#main').textContent),
      };
    });
    if (res.kind !== expected) throw new Error(`${name}: engine returned ${res.kind}, expected ${expected}`);
    if (res.stillHiding) throw new Error(`${name}: a finished trial is still withholding its result`);
    if (res.screen !== res.engine) {
      throw new Error(`${name}: screen shows "${res.screen}" but the engine returned "${res.engine}"`);
    }
    console.log(`  ${name}: ${res.kind}`);
    await kctx.close();
  }

  // Saving a finished trial must persist it and reach the report.
  const fctx = await browser.newContext();
  const fp = await fctx.newPage();
  fp.on('pageerror', e => errors.push('TRIAL SAVE PAGEERROR: ' + e.message));
  await fp.goto(`${BASE}/app/index.html`, { waitUntil: 'networkidle' });
  await fp.waitForTimeout(600);
  await fp.evaluate(async () => {
    const { store } = await import('./js/store.js');
    const { emptyEntry, addDays, dateKey, validateSymptoms } = await import('./js/model.js');
    const { createTrial, armForDate, trialDays } = await import('./js/experiments.js');
    function mul(s){return function(){s|=0;s=(s+0x6D2B79F5)|0;let t=Math.imul(s^(s>>>15),1|s);t=(t+Math.imul(t^(t>>>7),61|t))^t;return ((t^(t>>>14))>>>0)/4294967296;};}
    const syms = validateSymptoms([{ label: 'Migraine' }]);
    await store.setMeta('symptoms', syms);
    const id = syms[0].id;
    const { trial } = createTrial({ leverId: 'no-late-caffeine', outcome: id, outcomeLabel: 'Migraine',
      pairs: 7, startDate: addDays(dateKey(), -30), seed: 1234 });
    await store.setMeta('trials', [trial]);
    const r = mul(99); const rows = [];
    for (let i = 0; i < trialDays(trial); i++) {
      const date = addDays(trial.startDate, i);
      const e = emptyEntry(date, syms);
      e.caffeineAfter2pm = armForDate(trial, date) === 'on' ? 0 : 200;
      e.symptoms[id] = Math.max(0, Math.min(4, Math.round(0.8 + (e.caffeineAfter2pm > 0 ? 1.6 : 0) + (r() - 0.5) * 1.2)));
      rows.push(e);
    }
    await store.putMany(rows);
  });
  await fp.evaluate(() => { location.hash = '#trials'; });
  await fp.reload({ waitUntil: 'networkidle' });
  await fp.waitForTimeout(2200);
  await fp.click('[data-action="finish-trial"]');
  await fp.waitForTimeout(1000);
  const saved = await fp.evaluate(async () => {
    const { store } = await import('./js/store.js');
    const t = (await store.getMeta('trials'))[0];
    return { status: t.status, kind: t.result?.kind };
  });
  if (saved.status !== 'complete' || !saved.kind) throw new Error('saving a finished trial did not persist it');
  await fp.evaluate(() => { location.hash = '#report'; });
  await fp.waitForTimeout(1200);
  const rep = await fp.$eval('#print-report', e => e.textContent);
  if (!/already tried/i.test(rep) || !/caffeine/i.test(rep)) {
    throw new Error('a completed trial never reaches the doctor report');
  }
  console.log('  saved, persisted, and present in the report');
  await fctx.close();
}

console.log("\n--- the example-data tour ---");
{
  const tctx = await browser.newContext();
  const tp = await tctx.newPage();
  tp.on('pageerror', e => errors.push('TOUR PAGEERROR: ' + e.message));
  await tp.goto(`${BASE}/app/index.html#today`, { waitUntil: 'networkidle' });
  await tp.waitForTimeout(700);
  const cta = await tp.$('[data-action="load-sample"]');
  if (!cta) throw new Error('the tour CTA is missing from the empty state');
  await tp.click('[data-action="load-sample"]');
  await tp.waitForTimeout(3000);
  if (!(await tp.$('[data-sample-banner]'))) throw new Error('example data is not labelled as such');

  await tp.evaluate(() => { location.hash = '#insights'; });
  await tp.waitForTimeout(3500);
  const cards = await tp.$$eval('.insight', els => els.map(e => e.querySelector('.insight-text')?.textContent || ''));
  console.log('tour insight cards:', cards.length);
  if (cards.length < 3) throw new Error('example data lit up only ' + cards.length + ' insights');
  // The tour exists to show what the app does, and what it does is explain
  // symptoms. A tour without one demonstrates the wellness tracker this used
  // to be — which is exactly what shipped until this assertion existed.
  if (!cards.some(c => /headache|bloating/i.test(c))) {
    throw new Error('the tour shows no symptom finding — it misses the whole point');
  }
  console.log('  includes a symptom explanation:', true);

  await tp.evaluate(() => { location.hash = '#log'; });
  await tp.waitForTimeout(700);
  const rows = await tp.$$eval('.sym-seg', e => e.length);
  console.log('  symptom rows on the log screen:', rows);
  if (rows < 2) throw new Error('the tour does not show the symptom log');

  await tp.click('[data-action="save-entry"]');
  await tp.waitForTimeout(400);
  const toast = await tp.$eval('#toast', e => e.textContent);
  if (!/example data/i.test(toast)) throw new Error('saving over example data was not refused: ' + toast);

  await tp.click('[data-action="clear-sample"]');
  await tp.waitForTimeout(900);
  const left = await tp.evaluate(async () => {
    const { store } = await import('./js/store.js');
    return {
      entries: (await store.allEntries()).length,
      symptoms: ((await store.getMeta('symptoms')) || []).length,
    };
  });
  if (left.entries !== 0 || left.symptoms !== 0) {
    throw new Error('clearing the tour left ' + JSON.stringify(left) + ' behind');
  }
  console.log('  clears to a genuinely empty app:', true);
  await tctx.close();
}

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
