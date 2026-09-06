// Prism Pro — the free tier, the paywall, and the entitlement in both modes:
// provider 'none' (the shipped default) and 'stripe' with the API mocked.
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const M = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = createServer((q, r) => {
  const p = join(root, q.url === '/' || q.url.startsWith('/?') ? 'index.html' : q.url.replace(/\?.*$/, ''));
  if (!existsSync(p)) { r.writeHead(404); return r.end('nf'); }
  r.writeHead(200, { 'content-type': M[extname(p)] || 'text/plain' }); r.end(readFileSync(p));
});
await new Promise(r => server.listen(0, r));
const url = `http://127.0.0.1:${server.address().port}/`;
let fail = 0; const ok = (c, n) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) fail++; };
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });

// Service workers are blocked so page.route() sees every request; they are covered by pwa.mjs.
async function open(extraRoutes) {
  const ctx = await b.newContext({ viewport: { width: 900, height: 900 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  page.on('dialog', d => d.accept());
  if (extraRoutes) await extraRoutes(page);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => Store.markToured());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.COURSES_FULL, null, { timeout: 25000 });
  return { ctx, page, errs };
}
const go = (page, h) => page.evaluate(h => { location.hash = h; }, h).then(() => page.waitForTimeout(220));

// ---------------------------------------------------------------- provider: none
{
  const { ctx, page, errs } = await open();
  const info = await page.evaluate(() => {
    const free = window.COURSES.find(c => Pro.freeCourse(c.id));
    const paid = window.COURSES.find(c => !Pro.freeCourse(c.id));
    const l1 = paid.lessons[1];
    const full = window.COURSES_FULL.find(c => c.id === paid.id).lessons[1];
    const concept = full.cards.find(k => k.type === 'concept' || k.type === 'example');
    return { free: free.id, freeL: free.lessons[1].id, paid: paid.id, paidL0: paid.lessons[0].id, paidL1: l1.id, paidN: paid.lessons.length,
      secret: concept.body.slice(0, 70), counts: Pro.lessonCounts(window.COURSES) };
  });
  ok(info.counts.free > 100 && info.counts.free < info.counts.total / 2, `the free tier is generous but not the product (${info.counts.free} of ${info.counts.total} lessons)`);
  ok(await page.locator('.pro-card').count() === 1, 'home shows a Pro card to a free user');

  await go(page, `#/lesson/${info.free}/${info.freeL}`); await page.waitForSelector('.card');
  ok(await page.locator('.card').count() > 0, 'lesson 2 of a free course opens');
  await go(page, `#/lesson/${info.paid}/${info.paidL0}`); await page.waitForSelector('.card');
  ok(await page.locator('.card').count() > 0, 'lesson 1 of a Pro course is free');
  await go(page, `#/lesson/${info.paid}/${info.paidL1}`);
  await page.waitForSelector('.locked-card', { timeout: 5000 }).catch(() => {});
  ok(await page.locator('.locked-card').count() === 1 && await page.locator('.card').count() === 0, 'lesson 2 of a Pro course shows the locked page, not the player');
  ok(!(await page.content()).includes(info.secret), 'none of the locked lesson’s card text is in the page');
  ok((await page.locator('.locked-card h1').textContent() || '').length > 0, 'the locked page still names the lesson it is selling');

  await go(page, `#/course/${info.paid}`); await page.waitForSelector('.lesson-row');
  ok(await page.locator('.lesson-row.locked').count() === info.paidN - 1, `the course page marks ${info.paidN - 1} of ${info.paidN} lessons Pro`);
  ok(await page.locator('.pro-tag').count() === info.paidN - 1, 'each locked row carries a Pro tag');

  // a wrong key fails, the demo key unlocks, and it sticks
  await go(page, `#/lesson/${info.paid}/${info.paidL1}`); await page.waitForSelector('.locked-card');
  await page.click('#btn-get-pro'); await page.waitForSelector('.pro-modal');
  ok(!(await page.locator('#pro-key-form').isVisible()), 'the license-key form is not shown until asked for');
  await page.keyboard.press('Escape'); await page.waitForTimeout(120);
  await page.click('#btn-have-key'); await page.waitForSelector('#pro-key-form:not([hidden])');
  ok(await page.locator('#pro-key-form').isVisible(), '"I have a license key" reveals it');
  await page.fill('#pro-key', 'not-a-key'); await page.click('#pro-key-form button[type=submit]'); await page.waitForTimeout(150);
  ok((await page.locator('.pro-msg.bad').textContent() || '').length > 0, 'a wrong key is refused with a message');
  await page.fill('#pro-key', 'PRISM-DEMO'); await page.click('#pro-key-form button[type=submit]');
  await page.waitForSelector('.card', { timeout: 5000 }).catch(() => {});
  ok(await page.locator('.card').count() > 0 && await page.locator('.modal-wrap').count() === 0, 'the demo key unlocks and the lesson opens in place');
  await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForFunction(() => !!window.COURSES_FULL, null, { timeout: 25000 });
  ok(await page.evaluate(() => Pro.isPro()), 'Pro survives a reload');
  await go(page, '#/'); await page.waitForSelector('.cover');
  ok(await page.locator('.pro-card').count() === 0, 'the home Pro card is gone for a Pro user');
  await page.click('#btn-settings'); await page.waitForSelector('.pro-row');
  ok(/Prism Pro/.test(await page.locator('.pro-row').textContent() || ''), 'settings shows the Pro plan');
  await page.keyboard.press('Escape');

  // resetting progress must not destroy a purchase
  await page.evaluate(() => Store.resetAll());
  ok(await page.evaluate(() => Pro.isPro()), 'resetting all progress keeps Pro');

  // free users are never steered into a paywall by Continue/Today
  await page.evaluate(() => Pro.deactivate());
  await page.evaluate(a => { const c = window.COURSES.find(c => c.id === a); Store.completeLesson(c.id, c.lessons[0].id, 80); Store.setLastLesson(c.id, c.lessons[0].id); }, info.paid);
  await go(page, '#/'); await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForSelector('.cover');
  const contHref = await page.locator('.continue-card').getAttribute('href').catch(() => null);
  ok(contHref !== `#/lesson/${info.paid}/${info.paidL1}`, `Continue never points at a locked lesson (${contHref})`);

  // deactivate from the modal
  await page.evaluate(() => Pro.activateKey('PRISM-DEMO'));
  await go(page, '#/pro'); await page.waitForSelector('#pro-off');
  await page.click('#pro-off'); await page.waitForTimeout(200);
  ok(!(await page.evaluate(() => Pro.isPro())) && await page.locator('#pro-key-toggle').count() === 1, 'deactivating returns to the free plan');
  ok(errs.length === 0, 'no page errors (provider none)' + (errs.length ? ': ' + errs[0] : ''));
  await ctx.close();
}

// ---------------------------------------------------------------- provider: stripe (API mocked)
{
  const calls = [];
  const wire = async (page, mode) => {
    await page.route('**/js/pricing.js', route => route.fulfill({ status: 200, contentType: 'text/javascript',
      body: readFileSync(join(root, 'js/pricing.js'), 'utf8')
        .replace("provider: 'none'", "provider: 'stripe'")
        .replace("checkoutUrl: ''", "checkoutUrl: 'https://buy.stripe.com/test_prism'") }));
    await page.route('**/api/verify', route => {
      const body = JSON.parse(route.request().postData() || '{}');
      calls.push(body);
      if (mode.offline) return route.abort('internetdisconnected');
      const reply = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
      if (body.session_id === 'cs_ok') return reply({ ok: true, token: 'tok.ok', plan: 'lifetime', until: null });
      if (body.session_id) return reply({ ok: false, reason: 'unpaid' });
      if (body.token === 'tok.ok') return reply({ ok: true, token: 'tok.ok', plan: 'lifetime', until: null });
      if (body.token === 'tok.ref') return reply({ ok: false, reason: 'refunded' });
      return reply({ ok: false, reason: 'invalid' });
    });
  };
  const mode = { offline: false };
  const ctx = await b.newContext({ viewport: { width: 900, height: 900 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  page.on('dialog', d => d.accept());
  await wire(page, mode);

  // coming back from checkout
  await page.goto(url + '?session_id=cs_ok', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => Store.markToured());
  await page.waitForFunction(() => Pro.isPro(), null, { timeout: 8000 }).catch(() => {});
  ok(await page.evaluate(() => Pro.isPro()), 'returning from Stripe with a paid session grants Pro');
  ok(calls.some(c => c.session_id === 'cs_ok'), 'the session id was sent to the API to be confirmed');
  ok(await page.evaluate(() => location.search === ''), 'the session id is scrubbed from the URL');
  await page.waitForSelector('.toast', { timeout: 4000 }).catch(() => {});
  ok(/Welcome/.test(await page.locator('.toast').textContent().catch(() => '')), 'the buyer is welcomed');

  await page.evaluate(() => { location.hash = '#/pro'; }); await page.waitForSelector('#pro-copy');
  ok(await page.locator('#pro-copy').count() === 1, 'a real purchase can copy its license key for another device');

  // a free user sees a real checkout link
  await page.evaluate(() => Pro.deactivate());
  await page.evaluate(() => { location.hash = '#/'; }); await page.evaluate(() => { location.hash = '#/pro'; }); await page.waitForSelector('#pro-buy');
  ok((await page.getAttribute('#pro-buy', 'href')) === 'https://buy.stripe.com/test_prism' && (await page.getAttribute('#pro-buy', 'target')) === '_blank',
     'Get Prism Pro opens the Stripe Payment Link in a new tab');
  await page.click('#pro-key-toggle'); await page.fill('#pro-key', 'PRISM-DEMO'); await page.click('#pro-key-form button[type=submit]'); await page.waitForTimeout(200);
  ok(!(await page.evaluate(() => Pro.isPro())), 'the demo key does nothing once a real provider is configured');
  await page.fill('#pro-key', 'tok.ok'); await page.click('#pro-key-form button[type=submit]');
  await page.waitForFunction(() => Pro.isPro(), null, { timeout: 5000 }).catch(() => {});
  ok(await page.evaluate(() => Pro.isPro()), 'a license key issued elsewhere restores Pro here');

  // offline: an entitlement due for its daily check is kept when the server cannot be reached
  await page.evaluate(() => { const p = Store.state.pro; p.checkedAt = Date.now() - 3 * 86400000; Store.setPro(p); });
  mode.offline = true;
  const before = calls.length;
  await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForTimeout(600);
  ok(calls.length > before, 'a stale entitlement is re-checked on load');
  ok(await page.evaluate(() => Pro.isPro()), 'Pro is kept when the re-check cannot reach the server');
  mode.offline = false;

  // a refund revokes on the next check
  await page.evaluate(() => { const p = Store.state.pro; p.token = 'tok.ref'; p.checkedAt = Date.now() - 3 * 86400000; Store.setPro(p); });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !Pro.isPro(), null, { timeout: 5000 }).catch(() => {});
  ok(!(await page.evaluate(() => Pro.isPro())), 'a refunded purchase is revoked on the next re-check');
  await page.waitForSelector('.toast', { timeout: 4000 }).catch(() => {});
  ok(/refunded/i.test(await page.locator('.toast').textContent().catch(() => '')), 'and the user is told why');
  ok(errs.length === 0, 'no page errors (provider stripe)' + (errs.length ? ': ' + errs[0] : ''));
  await ctx.close();
}

await b.close(); server.close();
console.log(fail ? `${fail} FAILED` : 'ALL PASS');
process.exit(fail ? 1 : 0);
