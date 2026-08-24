// OUTRANKED test + benchmark suite.
// Runs functional tests against the real page in headless Chromium,
// then measures load performance. Prints a report and writes results.json.
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFileSync, writeFileSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const require = createRequire("/opt/node22/lib/node_modules/");
const { chromium } = require("playwright");

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(root, "index.html"));

const server = createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(html);
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}/`;

const results = { tests: [], perf: {}, weight: {} };
let failures = 0;
async function test(name, fn) {
  try { await fn(); results.tests.push({ name, pass: true }); console.log(`  PASS  ${name}`); }
  catch (e) { failures++; results.tests.push({ name, pass: false, error: String(e) }); console.log(`  FAIL  ${name}\n        ${e}`); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });

// ---------- functional tests ----------
console.log("\nFunctional tests");
const ctx = await browser.newContext();
const page = await ctx.newPage();
const externalRequests = [];
page.on("request", r => { if (!r.url().startsWith(url)) externalRequests.push(r.url()); });
await page.goto(url + "?nosim", { waitUntil: "networkidle" });

await test("page loads with correct title", async () => {
  assert((await page.title()).includes("OUTRANKED"), "title missing");
});

await test("leaderboard renders all 18 seeded entries", async () => {
  const rows = await page.locator(".board .row").count();
  assert(rows === 18, `expected 18 rows, got ${rows}`);
});

await test("crown card shows the top-ranked entry with reign timer", async () => {
  const name = await page.locator(".crown-name").textContent();
  assert(name.trim() === "JONI", `expected JONI on the crown, got ${name}`);
  assert(await page.locator("#reignClock").isVisible(), "reign clock missing");
});

await test("every row shows exact price-to-take (no math needed)", async () => {
  const labels = await page.locator(".board .take").allTextContents();
  assert(labels.length === 18 && labels.every(t => /\$[\d,]+/.test(t)), "take-rank price missing on some rows");
});

await test("new listing below $5 minimum is rejected", async () => {
  await page.click("[data-open-bid]");
  await page.fill("#fName", "CheapSkate");
  await page.fill("#fAmt", "4");
  await page.click("#payBtn");
  assert(await page.locator("#bidErr").isVisible(), "error not shown");
  assert((await page.locator("#bidErr").textContent()).includes("$5"), "wrong error");
  await page.click("[data-close]");
});

await test("placing a valid bid ranks the entry correctly and shows a toast", async () => {
  await page.click("[data-open-bid]");
  await page.fill("#fName", "TestRocket");
  await page.fill("#fUrl", "testrocket.dev");
  await page.fill("#fAmt", "6000");
  await page.click("#payBtn");
  await page.waitForSelector(".toast.show");
  const rows = await page.locator(".board .row .nm").allTextContents();
  const idx = rows.findIndex(t => t.includes("TestRocket"));
  assert(idx === 4, `TestRocket at $6000 should be rank 5 (above DataDuck $5480, below CalAI $6120), got rank ${idx + 1}`);
});

await test("topping up an existing entry stacks cumulatively", async () => {
  await page.click("[data-open-bid]");
  await page.fill("#fName", "TestRocket");
  await page.fill("#fAmt", "3000");
  await page.click("#payBtn");
  await page.waitForTimeout(150);
  const rows = await page.locator(".board .row .nm").allTextContents();
  const idx = rows.findIndex(t => t.includes("TestRocket"));
  assert(idx === 2, `TestRocket at $9000 should be rank 3, got ${idx + 1}`);
});

await test("auto-defend re-bids automatically when outbid", async () => {
  // Arm defense on TestRocket ($9000) with a big budget
  await page.click("[data-open-bid]");
  await page.fill("#fName", "TestRocket");
  await page.fill("#fAmt", "10");
  await page.check("#fDefend");
  await page.fill("#fBudget", "5000");
  await page.click("#payBtn");
  await page.waitForTimeout(150);
  // Attacker passes it
  await page.click("[data-open-bid]");
  await page.fill("#fName", "Aggressor");
  await page.fill("#fAmt", "9100");
  await page.click("#payBtn");
  await page.waitForTimeout(200);
  const rows = await page.locator(".board .row .nm").allTextContents();
  const def = rows.findIndex(t => t.includes("TestRocket"));
  const agg = rows.findIndex(t => t.includes("Aggressor"));
  assert(def !== -1 && agg !== -1, "entries missing");
  assert(def < agg, `defended entry should outrank aggressor (TestRocket #${def + 1} vs Aggressor #${agg + 1})`);
  const feed = await page.locator("#tickerInner").textContent();
  assert(feed.includes("auto-defended"), "auto-defend event missing from live feed");
});

await test("live activity feed records bids and overtakes", async () => {
  const feed = await page.locator("#tickerInner").textContent();
  assert(feed.includes("TestRocket") && feed.includes("$"), "feed missing bid events");
});

await test("search filters the board instantly", async () => {
  await page.fill("#search", "duck");
  await page.waitForTimeout(100);
  const rows = await page.locator(".board .row .nm").allTextContents();
  assert(rows.length >= 1 && rows.every(t => t.toLowerCase().includes("duck")), `search broken: ${rows}`);
  await page.fill("#search", "");
});

await test("dark/light theme toggle works", async () => {
  const before = await page.getAttribute("html", "data-theme");
  await page.click("#themeBtn");
  const after = await page.getAttribute("html", "data-theme");
  assert(before !== after, "theme did not change");
  await page.click("#themeBtn");
});

await test("state persists across reload (localStorage)", async () => {
  await page.reload({ waitUntil: "networkidle" });
  const rows = await page.locator(".board .row .nm").allTextContents();
  assert(rows.some(t => t.includes("TestRocket")), "bids lost on reload");
});

await test("zero external network requests (self-contained page)", async () => {
  assert(externalRequests.length === 0, `external requests: ${externalRequests.join(", ")}`);
});

await test("XSS in listing name is escaped", async () => {
  await page.click("[data-open-bid]");
  await page.fill("#fName", '<img src=x onerror="window.__pwned=1">');
  await page.fill("#fAmt", "10");
  await page.click("#payBtn");
  await page.waitForTimeout(300);
  const pwned = await page.evaluate(() => window.__pwned);
  assert(!pwned, "XSS executed");
});

await test("demo ribbon is shown until a payment link is configured", async () => {
  assert(await page.locator("#demoRibbon.show").isVisible(), "ribbon hidden in demo mode");
});

await test("brag share bar appears after a bid with rank and amount in the tweet", async () => {
  const href = await page.locator("#bragBtn").getAttribute("href");
  assert(href.startsWith("https://twitter.com/intent/tweet?text="), "not a tweet intent");
  const text = decodeURIComponent(href.split("text=")[1]);
  assert(text.includes("$10") && text.includes("OUTRANKED"), `bad brag text: ${text}`);
  assert(await page.locator("#sharebar.show").isVisible(), "share bar not shown");
});

await test("crown card carries a dare-to-dethrone tweet intent", async () => {
  const href = await page.locator("#dareLink").getAttribute("href");
  const text = decodeURIComponent(href.split("text=")[1]);
  assert(text.includes("#1 on OUTRANKED") && text.includes("$"), `bad dare text: ${text}`);
});

await test("with a Stripe link configured, bidding opens checkout with client_reference_id", async () => {
  const opened = [];
  await page.exposeFunction("__recordOpen", u => opened.push(u));
  await page.evaluate(() => {
    CONFIG.STRIPE_PAYMENT_LINK = "https://buy.stripe.com/test_abc123";
    window.open = u => { window.__recordOpen(u); return null; };
  });
  await page.click("[data-open-bid]");
  await page.fill("#fName", "RealMoneyCo");
  await page.fill("#fAmt", "50");
  await page.click("#payBtn");
  await page.waitForTimeout(200);
  assert(opened.length === 1, `expected 1 checkout open, got ${opened.length}`);
  assert(opened[0].startsWith("https://buy.stripe.com/test_abc123?client_reference_id=RealMoneyCo_50_"),
    `bad checkout URL: ${opened[0]}`);
  const toastText = await page.locator("#toast").textContent();
  assert(toastText.includes("Stripe"), "toast missing payment instruction");
  await page.evaluate(() => { CONFIG.STRIPE_PAYMENT_LINK = ""; });
});

await test("webhook feed merges as VERIFIED bids, idempotently", async () => {
  const rocketBefore = await page.evaluate(() => state.entries.find(e => e.name === "TestRocket").total);
  await page.evaluate(async () => {
    const feed = [
      { id: "cs_test_001", ref: "FeedCo_120_abc", amount: 120 },
      { id: "cs_test_002", ref: "TestRocket_500_def", amount: 500 },
    ];
    CONFIG.BOARD_FEED_URL = "stub://board";
    window.fetch = async () => ({ json: async () => feed });
    await mergeBoardFeed();
    await mergeBoardFeed();      // second pass must be a no-op
  });
  await page.waitForTimeout(100);
  const rows = await page.locator(".board .row .nm").allTextContents();
  const feedCo = rows.find(t => t.includes("FeedCo"));
  assert(feedCo && feedCo.includes("VERIFIED"), "FeedCo not merged as verified");
  const totals = await page.evaluate(() => {
    const s = state.entries;
    return {
      feedCo: s.find(e => e.name === "FeedCo").total,
      rocket: s.find(e => e.name === "TestRocket").total,
    };
  });
  assert(totals.feedCo === 120, `FeedCo should be $120 once, got ${totals.feedCo}`);
  assert(totals.rocket === rocketBefore + 500, `TestRocket should gain exactly $500 once (${rocketBefore}+500), got ${totals.rocket}`);
  await page.evaluate(() => { CONFIG.BOARD_FEED_URL = ""; });
});

await ctx.close();

// ---------- performance benchmark ----------
console.log("\nPerformance benchmark (5 cold loads, headless Chromium)");
const runs = [];
for (let i = 0; i < 5; i++) {
  const c = await browser.newContext();
  const p = await c.newPage();
  await p.goto(url, { waitUntil: "load" });
  await p.waitForTimeout(300);
  const m = await p.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    const fcp = performance.getEntriesByName("first-contentful-paint")[0];
    return {
      domContentLoaded: nav.domContentLoadedEventEnd - nav.startTime,
      load: nav.loadEventEnd - nav.startTime,
      fcp: fcp ? fcp.startTime : null,
      transfer: nav.transferSize,
      requests: performance.getEntriesByType("resource").length + 1,
    };
  });
  runs.push(m);
  await c.close();
}
const med = k => runs.map(r => r[k]).sort((a, b) => a - b)[2];
results.perf = {
  medianFCPms: +med("fcp").toFixed(1),
  medianDOMContentLoadedms: +med("domContentLoaded").toFixed(1),
  medianLoadms: +med("load").toFixed(1),
  totalRequests: runs[0].requests,
};
results.weight = {
  htmlBytes: statSync(join(root, "index.html")).size,
  gzipBytes: gzipSync(html).length,
};
console.log(`  First Contentful Paint (median): ${results.perf.medianFCPms} ms`);
console.log(`  DOMContentLoaded (median):       ${results.perf.medianDOMContentLoadedms} ms`);
console.log(`  Full load (median):              ${results.perf.medianLoadms} ms`);
console.log(`  Total requests:                  ${results.perf.totalRequests}`);
console.log(`  Page weight:                     ${(results.weight.htmlBytes / 1024).toFixed(1)} KB raw, ${(results.weight.gzipBytes / 1024).toFixed(1)} KB gzipped`);

await browser.close();
server.close();

writeFileSync(join(root, "test", "results.json"), JSON.stringify(results, null, 2));
const passed = results.tests.filter(t => t.pass).length;
console.log(`\n${passed}/${results.tests.length} tests passed`);
process.exit(failures ? 1 : 0);
