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

await test("Today board is the default landing view (winnable fight first)", async () => {
  assert((await page.getAttribute("#tabToday", "class")).includes("active"), "Today tab not active on load");
  const crown = await page.locator(".crown-card").textContent();
  assert(crown.includes("resets in"), "landing crown is not the Today crown");
  const cta = await page.locator("#stickyCta button").count();
  assert(cta === 1, "sticky mobile CTA missing");
  await page.click("#tabAll");
  await page.waitForTimeout(100);
});

await test("take buttons prefill the exact amount to beat", async () => {
  await page.click('.row[data-id="e1"] .take');       // ShipFast, $9,750 all-time
  await page.waitForTimeout(100);
  const val = await page.inputValue("#fAmt");
  assert(val === "9751", `expected prefill 9751, got ${val}`);
  await page.click("[data-close]");
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

await test("no third-party requests besides Google Fonts", async () => {
  const bad = externalRequests.filter(u => !/^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(u));
  assert(bad.length === 0, `unexpected external requests: ${bad.join(", ")}`);
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
  await page.click("#tabAll");
  await page.waitForTimeout(100);
  const href = await page.locator("#dareLink").getAttribute("href");
  const text = decodeURIComponent(href.split("text=")[1]);
  assert(text.includes("#1 on OUTRANKED") && text.includes("$"), `bad dare text: ${text}`);
});

await test("with Stripe configured, checkout carries the bid and the board is NOT faked", async () => {
  const opened = [];
  await page.exposeFunction("__recordOpen", u => opened.push(u));
  await page.evaluate(() => {
    CONFIG.STRIPE_PAYMENT_LINK = "https://buy.stripe.com/test_abc123";
    window.open = u => { window.__recordOpen(u); return null; };
  });
  const before = await page.evaluate(() => state.entries.length);
  await page.click("[data-open-bid]");
  await page.fill("#fName", "RealMoneyCo");
  await page.fill("#fUrl", "realmoney.co");
  await page.fill("#fAmt", "50");
  await page.fill("#fDecree", "Pay up.");
  await page.click("#payBtn");
  await page.waitForTimeout(200);
  assert(opened.length === 1, `expected 1 checkout open, got ${opened.length}`);
  const ref = new URL(opened[0]).searchParams.get("client_reference_id");
  const decoded = await page.evaluate(r => decodeRef(r), ref);
  assert(decoded.name === "RealMoneyCo" && decoded.url === "realmoney.co" && decoded.decree === "Pay up.",
    `reference did not round-trip: ${JSON.stringify(decoded)}`);
  // Critical: an unpaid bid must never appear on the board.
  const after = await page.evaluate(() => state.entries.length);
  assert(after === before, `board was mutated before payment cleared (${before} → ${after})`);
  const toastText = await page.locator("#toast").textContent();
  assert(toastText.includes("Stripe"), "toast missing payment instruction");
  await page.evaluate(() => { CONFIG.STRIPE_PAYMENT_LINK = ""; });
});

await test("webhook feed merges as VERIFIED bids, idempotently", async () => {
  await page.click("#tabAll");
  await page.waitForTimeout(100);
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

await test("nobility tiers render with medallions and tier names", async () => {
  await page.click("#tabAll");
  await page.waitForTimeout(100);
  const meds = await page.locator(".board .row .med").count();
  assert(meds >= 18, `expected a medallion per row, got ${meds}`);
  const joniRow = await page.locator('.row[data-id="e0"]').textContent();
  assert(joniRow.includes("Sovereign"), "JONI ($14k lifetime) should be Sovereign tier");
  const smallRow = await page.locator('.row[data-id="e17"]').textContent();
  assert(smallRow.includes("Baron"), "Duckhorn ($40) should be Baron tier");
});

await test("dethroning #1 awards the Kingslayer title", async () => {
  await page.click("[data-open-bid]");
  await page.fill("#fName", "Usurper");
  await page.fill("#fAmt", "20000");
  await page.click("#payBtn");
  await page.waitForTimeout(600);
  const rows = await page.locator(".board .row").allTextContents();
  assert(rows[0].includes("Usurper") && rows[0].includes("Kingslayer"), `Usurper should lead with ⚔️ Kingslayer, got: ${rows[0].slice(0,120)}`);
  const feed = await page.locator("#tickerInner").textContent();
  assert(feed.includes("DETHRONED"), "dethroning missing from live feed");
});

await test("Hall of Fame shelf and Your Empire chip render", async () => {
  const trophies = await page.locator("#hall .trophy").count();
  assert(trophies >= 3, `expected seeded trophies, got ${trophies}`);
  const empire = await page.locator("#empire").textContent();
  assert(empire.includes("Usurper") && empire.includes("MAX RANK"), `empire chip wrong: ${empire}`);
});

await test("Watch Mode opens as a live broadcast view and closes on Escape", async () => {
  await page.click("#watchBtn");
  await page.waitForTimeout(150);
  assert(await page.locator("#watch.on").isVisible(), "watch overlay not shown");
  const crown = await page.locator("#wCrown").textContent();
  assert(crown.includes("$") && /king|champion/i.test(crown), `watch crown wrong: ${crown.slice(0,80)}`);
  assert((await page.locator("#wFeed .ev").count()) >= 3, "war feed empty in watch mode");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  assert(!(await page.locator("#watch.on").count()), "Escape did not exit watch mode");
});

await test("clicking a row opens the dossier with cost-per-click math", async () => {
  await page.click("#tabAll");
  await page.waitForTimeout(100);
  await page.click('.row[data-id="e1"] .who');    // ShipFast
  await page.waitForTimeout(150);
  const body = await page.locator("#detailBody").textContent();
  assert(body.includes("ShipFast"), "dossier missing name");
  assert(body.includes("Cost / click"), "dossier missing CPC cell");
  const cpc = 9750 / 7500;                        // seeded: total / clicks
  assert(body.includes("$" + cpc.toFixed(2)), `dossier CPC should be $${cpc.toFixed(2)}`);
  await page.click("[data-boost]");               // boost → prefilled bid modal
  await page.waitForTimeout(150);
  const val = await page.inputValue("#fAmt");
  assert(val === "9751", `boost should prefill 9751, got ${val}`);
  await page.click("[data-close]");
});

await test("crowning bid with a decree shows the taunt on the crown card", async () => {
  await page.click("#tabAll");
  await page.waitForTimeout(100);
  await page.click("[data-open-bid]");
  await page.fill("#fName", "Usurper");         // already king from the Kingslayer test
  await page.fill("#fAmt", "10");
  await page.fill("#fDecree", "Come and take it.");
  await page.click("#payBtn");
  await page.waitForTimeout(600);
  const crown = await page.locator(".crown-card").textContent();
  assert(crown.includes("Come and take it."), "decree missing from crown card");
  const feedText = await page.locator("#tickerInner").textContent();
  assert(feedText.includes("decrees"), "decree missing from feed");
});

await test("dossier offers an embeddable rank badge with copyable HTML", async () => {
  await page.click('.row[data-id="e2"] .who');  // Lovable
  await page.waitForTimeout(150);
  const body = await page.locator("#detailBody").innerHTML();
  assert(body.includes("OUT") && body.includes("Copy embed"), "badge block missing");
  const embed = await page.evaluate(() => badgeEmbed(state.entries.find(e => e.name === "Lovable")));
  assert(embed.includes("<img") && embed.includes("data:image/svg+xml") && embed.includes("OUTRANKED"),
    `bad embed snippet: ${embed.slice(0, 120)}`);
  await page.click("[data-close-detail]");
});

await test("Today board ranks by today's bids, independent of all-time totals", async () => {
  await page.click("#tabToday");
  await page.waitForTimeout(100);
  let names = await page.locator(".board .row .nm").allTextContents();
  assert(!names.some(n => n.includes("JONI")), "JONI has no bids today and should not be on the Today board");
  const expected = await page.evaluate(() => sortedToday().map(e => e.name));
  const domOrder = names.map(n => n.trim().split("\n")[0].trim());
  assert(JSON.stringify(domOrder.map(n => n.split(" ")[0])) === JSON.stringify(expected.map(n => n.split(" ")[0])),
    `today DOM order ${domOrder} != today totals order ${expected}`);
  // A $300 bid today outranks CalAI's $220 today, regardless of all-time totals
  await page.click("[data-open-bid]");
  await page.fill("#fName", "DayTripper");
  await page.fill("#fAmt", "300");
  await page.click("#payBtn");
  await page.waitForTimeout(150);
  names = (await page.locator(".board .row .nm").allTextContents()).map(n => n.trim());
  const dt = names.findIndex(n => n.includes("DayTripper"));
  const cal = names.findIndex(n => n.includes("CalAI"));
  assert(dt !== -1 && cal !== -1 && dt < cal, `DayTripper ($300 today) should outrank CalAI ($220 today): got positions ${dt + 1} vs ${cal + 1}`);
  const crown = await page.locator(".crown-card").textContent();
  assert(crown.includes("resets in"), "Today crown missing reset countdown");
  await page.click("#tabAll");
  await page.waitForTimeout(100);
  const allNames = await page.locator(".board .row .nm").allTextContents();
  assert(!allNames[0].includes("DayTripper"), "DayTripper must not lead the all-time board");
});

await test("outbound clicks are counted per listing (advertiser ROI proof)", async () => {
  await page.click("#tabAll");
  await page.waitForTimeout(100);
  await ctx.route("https://joni.app/**", r => r.abort());
  const before = await page.evaluate(() => state.entries.find(e => e.name === "JONI").clicks);
  const popup = page.waitForEvent("popup").catch(() => null);
  await page.locator('.row[data-id="e0"] a.url').click();
  await popup;
  const after = await page.evaluate(() => state.entries.find(e => e.name === "JONI").clicks);
  assert(after === before + 1, `JONI clicks should go ${before}→${before + 1}, got ${after}`);
});

// Runs last: going live intentionally wipes the demo board.
await test("live Stripe ledger takes over the board and clears the demo seeds", async () => {
  const shape = await page.evaluate(async () => {
    const bids = [
      { id: "cs_live_1", ref: encodeRef("Ledger Co", "ledger.co", "All yours."), amount: 900, at: 1 },
      { id: "cs_live_2", ref: encodeRef("Runner Up", "runnerup.io", ""), amount: 400, at: 2 },
      { id: "cs_live_3", ref: encodeRef("Ledger Co", "ledger.co", ""), amount: 100, at: 3 },
    ];
    CONFIG.BOARD_FEED_URL = "stub://live";
    window.fetch = async () => ({ json: async () => ({ configured: true, bids }) });
    await mergeBoardFeed();
    await mergeBoardFeed();                       // must be idempotent
    return {
      live: state.live,
      seedsGone: !state.entries.some(e => /^[es]/.test(e.id)),
      names: sorted().map(e => e.name),
      leaderTotal: sorted()[0].total,
      verified: sorted().every(e => e.verified),
      decree: state.decree && state.decree.text,
    };
  });
  assert(shape.live && shape.seedsGone, "demo seed board was not cleared when Stripe went live");
  assert(shape.names[0] === "Ledger Co" && shape.leaderTotal === 1000,
    `ledger should aggregate Ledger Co to $1,000, got ${shape.names[0]} $${shape.leaderTotal}`);
  assert(shape.names.length === 2, `expected exactly the 2 paid listings, got ${shape.names.length}`);
  assert(shape.verified, "ledger-sourced entries should all be VERIFIED");
  assert(shape.decree === "All yours.", `decree should ride along the ledger, got ${shape.decree}`);
});

await test("simulated traffic never runs on a live board", async () => {
  const stillLive = await page.evaluate(() => {
    const before = state.entries.length;
    for (let i = 0; i < 40; i++) simulate();
    return { grew: state.entries.length !== before, live: state.live };
  });
  assert(stillLive.live && !stillLive.grew, "simulation mutated a live board");
});

await ctx.close();

// ---------- Stripe ledger API (unit) ----------
console.log("\nLedger API");
const { decodeRef, rank } = require(join(root, "api", "_board.js"));
const b64 = s => Buffer.from(s, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

await test("API decodes both the encoded and legacy reference formats", () => {
  const modern = decodeRef("b64." + b64("Acme Inc|acme.dev|We do not lose."));
  assert(modern.name === "Acme Inc" && modern.url === "acme.dev" && modern.decree === "We do not lose.",
    `modern ref wrong: ${JSON.stringify(modern)}`);
  const legacy = decodeRef("OldCo_50_x9f");
  assert(legacy.name === "OldCo", `legacy ref wrong: ${JSON.stringify(legacy)}`);
  const junk = decodeRef("b64.!!!not-base64!!!");
  assert(junk.name === "Anonymous", "malformed reference should degrade, not throw");
});

await test("API ranks by cumulative payment, breaking ties by who paid first", () => {
  const board = rank([
    { id: "a", ref: "b64." + b64("Alpha|alpha.io|"), amount: 300, at: 10 },
    { id: "b", ref: "b64." + b64("Beta|beta.io|"), amount: 500, at: 20 },
    { id: "c", ref: "b64." + b64("alpha|alpha.io|onward"), amount: 200, at: 30 },
  ]);
  assert(board.length === 2, `expected 2 listings, got ${board.length}`);
  const alpha = board.find(e => e.name === "Alpha");
  assert(alpha.total === 500 && alpha.bids === 2 && alpha.decree === "onward",
    `Alpha's two bids should aggregate to $500 with its latest decree, got ${JSON.stringify(alpha)}`);
  // Both sit at $500. Beta got there at t=20, Alpha only at t=30, so Beta holds the higher rank.
  assert(board[0].name === "Beta", `tie should go to whoever reached the total first: ${board.map(e => e.name).join(",")}`);
});

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
