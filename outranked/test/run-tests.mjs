// OUTRANKED test + benchmark suite.
// Runs functional tests against the real page in headless Chromium,
// then measures load performance. Prints a report and writes results.json.
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFileSync, writeFileSync, statSync, existsSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { pathToFileURL, fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Resolve Playwright from wherever it lives: a global install (this dev
// sandbox) or node_modules (CI). Keeps the suite runnable in both.
const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  ({ chromium } = createRequire("/opt/node22/lib/node_modules/")("playwright"));
}

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

// Only pin a browser path when this sandbox's prebuilt Chromium is present;
// on CI, let Playwright use the browser it installed itself.
const sandboxChromium = "/opt/pw-browsers/chromium";
const browser = await chromium.launch(
  existsSync(sandboxChromium) ? { executablePath: sandboxChromium } : {}
);

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

await test("?take= deep link lands inside the bid modal aimed at its target", async () => {
  const p2 = await ctx.newPage();
  await p2.goto(url + "?nosim&take=ShipFast", { waitUntil: "networkidle" });
  await p2.waitForTimeout(900);
  assert(await p2.locator("#bidModal").evaluate(d => d.open), "bid modal did not open from the deep link");
  const title = await p2.locator("#modalTitle").textContent();
  assert(title.includes("ShipFast"), `modal should target ShipFast, got: ${title}`);
  const val = await p2.inputValue("#fAmt");
  assert(+val > 0, `amount should be prefilled to beat the target, got "${val}"`);
  await p2.close();
});

await test("dare links carry their target as a ?take= deep link", async () => {
  await page.click("#tabAll");            // the dare link lives on the all-time crown
  await page.waitForTimeout(150);
  const href = decodeURIComponent(await page.locator("#dareLink").getAttribute("href"));
  assert(href.includes("?take="), `dare link missing deep link: ${href.slice(0, 140)}`);
});

await test("share links derive the live domain instead of a hardcoded one", async () => {
  const origin = await page.evaluate(() => location.origin);
  const brag = await page.locator("#bragBtn").getAttribute("href");
  assert(decodeURIComponent(brag).includes(origin),
    `brag link should point at the deployed origin ${origin}: ${decodeURIComponent(brag).slice(0, 120)}`);
  const embed = await page.evaluate(() => badgeEmbed(state.entries[0]));
  assert(embed.includes(`href="${origin}`), `badge embed should link to ${origin}: ${embed.slice(0, 120)}`);
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

await test("trophy case shows every title, locked ones with how to earn them", async () => {
  await page.click("#tabAll");
  await page.waitForTimeout(120);
  await page.click('.row[data-id="e1"] .who');        // ShipFast: has Kingslayer + Defender
  await page.waitForTimeout(200);
  const body = await page.locator("#detailBody").textContent();
  const total = await page.evaluate(() => TITLES.length);
  assert(body.includes(`of ${total} titles`), `trophy case header missing: ${body.slice(0,120)}`);
  const rows = await page.locator("#detailBody .t-row").count();
  assert(rows === total, `expected all ${total} titles listed, got ${rows}`);
  const locked = await page.locator("#detailBody .t-row:not(.got)").count();
  assert(locked > 0 && body.includes("🔒"), "locked titles should be visible with a lock");
  assert(body.includes("Keep a 7-day presence flame alive"), "locked titles must explain how to earn them");
  const got = await page.locator("#detailBody .t-row.got").count();
  assert(got >= 2, `ShipFast's earned titles should be marked, got ${got}`);
  await page.click("[data-close-detail]");
});

await test("bidding in the final hour earns Night Owl", async () => {
  const earned = await page.evaluate(() => {
    const e = state.entries.find(x => x.name === "Soba");
    const real = msToMidnightUTC;
    window.msToMidnightUTC = () => 60000;               // pretend it is 23:59
    touchToday(e, 5);
    window.msToMidnightUTC = real;
    return (e.titles || []).includes("🌙 Night Owl");
  });
  assert(earned, "a bid inside the final hour should earn Night Owl");
});

await test("a hostile listing name cannot execute script via the Oracle result", async () => {
  // Names are attacker-controlled on a live board (they ride in Stripe's
  // client_reference_id), and the Oracle result is injected with innerHTML.
  const octx = await browser.newContext();
  const p2 = await octx.newPage();
  await p2.goto(url + "?nosim", { waitUntil: "networkidle" });
  await p2.waitForTimeout(500);
  await p2.evaluate(() => {
    const payload = '<img src=x onerror="window.__xss=1">';
    const y = prevDayOf(todayStr());
    state.hall.unshift({ date: y, name: payload, amount: 5 });
    save();
    localStorage.setItem("outranked_oracle",
      JSON.stringify({ pick: payload, pickDay: y, resolved: false, streak: 0 }));
  });
  await p2.reload({ waitUntil: "networkidle" });
  await p2.waitForTimeout(800);
  const pwned = await p2.evaluate(() => window.__xss);
  assert(!pwned, "hostile listing name executed script through the Oracle result");
  const html = await p2.locator("#oracle").innerHTML();
  assert(!/<img[^>]+onerror/i.test(html), "hostile markup reached the DOM as an element");
  await octx.close();
});

await test("the copyable badge embed escapes the listing name", async () => {
  const embed = await page.evaluate(() => {
    const e = state.entries.find(x => x.name === "JONI");
    const original = e.name;
    e.name = 'Evil" onerror="alert(1)';
    const out = badgeEmbed(e);
    e.name = original;
    return out;
  });
  // The snippet is pasted onto a bidder's own site, so a quote in the name must
  // not close alt="" and add an attribute. Assert the real property by parsing
  // the snippet the way a browser would, rather than pattern-matching text.
  const parsed = await page.evaluate((html) => {
    const host = document.createElement("div");
    host.innerHTML = html;
    const img = host.querySelector("img");
    return { attrs: [...img.attributes].map(a => a.name), alt: img.getAttribute("alt") };
  }, embed);
  assert(!parsed.attrs.includes("onerror"),
    `a quote in the listing name created a real attribute: ${parsed.attrs.join(",")}`);
  assert(parsed.alt.startsWith('Evil" onerror="alert(1)'),
    `the name should survive as inert alt text, got: ${parsed.alt}`);
});

await test("Season board ranks by this month's bids with its own crown and countdown", async () => {
  await page.click("#tabSeason");
  await page.waitForTimeout(150);
  const crown = await page.locator(".crown-card").textContent();
  assert(crown.includes("Season") && crown.includes("ends in"), `season crown wrong: ${crown.slice(0,100)}`);
  const order = await page.evaluate(() => sortedSeason().map(e => e.name).slice(0, 3));
  const dom = (await page.locator(".board .row .nm").allTextContents()).map(t => t.trim().split("\n")[0].trim());
  assert(dom[0].includes(order[0]), `season DOM leader ${dom[0]} != computed ${order[0]}`);
  const before = await page.evaluate(() => sortedSeason()[0].monthTotal);
  await page.click(".board .row .take");
  await page.waitForTimeout(120);
  const val = +(await page.inputValue("#fAmt"));
  assert(val === before + 1, `season take should prefill month total + 1 (${before + 1}), got ${val}`);
  await page.click("[data-close]");
  await page.click("#tabAll");
  await page.waitForTimeout(100);
});

await test("presence flames grow on consecutive days and reset after a gap", async () => {
  const r = await page.evaluate(() => {
    const e = state.entries.find(x => x.name === "TestRocket");
    e.lastBidDay = prevDayOf(todayStr()); e.presence = 3;
    touchToday(e, 1);
    const grew = e.presence;
    const d = new Date(); d.setUTCDate(d.getUTCDate() - 3);
    e.lastBidDay = d.toISOString().slice(0, 10); e.presence = 7;
    touchToday(e, 1);
    return { grew, afterGap: e.presence };
  });
  assert(r.grew === 4, `consecutive-day bid should extend flame 3->4, got ${r.grew}`);
  assert(r.afterGap === 1, `a gap should reset the flame to 1, got ${r.afterGap}`);
});

await test("the Oracle locks a pick, then pays out a streak after the day resolves", async () => {
  // Own context: the Oracle plays with localStorage and must not leak into
  // the main page's state.
  const octx = await browser.newContext();
  const p2 = await octx.newPage();
  await p2.goto(url + "?nosim", { waitUntil: "networkidle" });
  await p2.waitForTimeout(600);
  assert(await p2.locator("#oracle.show").isVisible(), "oracle card missing");
  await p2.click(".o-pick");
  await p2.waitForTimeout(150);
  const locked = await p2.locator("#oracle").textContent();
  assert(locked.includes("Prophecy locked"), "pick did not lock");
  await p2.evaluate(() => {
    const o = JSON.parse(localStorage.getItem("outranked_oracle"));
    const y = prevDayOf(todayStr());
    o.pickDay = y; o.resolved = false;
    localStorage.setItem("outranked_oracle", JSON.stringify(o));
    state.hall.unshift({ date: y, name: o.pick, amount: 123 });
    save();
  });
  await p2.reload({ waitUntil: "networkidle" });
  await p2.waitForTimeout(700);
  const after = await p2.evaluate(() => JSON.parse(localStorage.getItem("outranked_oracle")));
  assert(after.streak === 1 && after.lastResult.startsWith("\u2705"),
    `correct prophecy should pay a streak, got ${JSON.stringify(after)}`);
  await octx.close();
});

await test("ledger merge attributes historical bids to their own day and month", async () => {
  // Own context: this test flips the page to live mode (goLive wipes the
  // board), which must never bleed into the shared main page.
  const actx = await browser.newContext();
  const ap = await actx.newPage();
  await ap.goto(url + "?nosim", { waitUntil: "networkidle" });
  await ap.waitForTimeout(400);
  const shape = await ap.evaluate(async () => {
    const oldAt = Math.floor(Date.now()/1000) - 40 * 86400;
    const nowAt = Math.floor(Date.now()/1000);
    CONFIG.BOARD_FEED_URL = "stub://attr";
    window.fetch = async () => ({ json: async () => ({ configured: true, bids: [
      { id: "cs_attr_old", ref: encodeRef("TimeTraveler", "tt.io", ""), amount: 700, at: oldAt },
      { id: "cs_attr_new", ref: encodeRef("TimeTraveler", "tt.io", ""), amount: 40, at: nowAt },
    ]})});
    await mergeBoardFeed();
    const e = state.entries.find(x => x.name === "TimeTraveler");
    return { total: e.total, today: e.todayTotal, month: e.monthTotal, presence: e.presence };
  });
  assert(shape.total === 740, `all-time should be 740, got ${shape.total}`);
  assert(shape.today === 40, `only the fresh bid belongs to today, got ${shape.today}`);
  assert(shape.month === 40, `last month's bid must not inflate this season, got ${shape.month}`);
  assert(shape.presence === 1, `a 40-day gap cannot be a streak, got ${shape.presence}`);
  await actx.close();
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
await test("going live stops the page calling itself a demo and drops fabricated champions", async () => {
  // Own context: goLive() wipes the board, which must not bleed into the shared page.
  const dctx = await browser.newContext();
  const dp = await dctx.newPage();
  await dp.goto(url + "?nosim", { waitUntil: "networkidle" });
  await dp.waitForTimeout(400);
  const shape = await dp.evaluate(async () => {
    const seededSeasons = (state.seasons || []).length;
    CONFIG.BOARD_FEED_URL = "stub://demo-copy";
    window.fetch = async () => ({ json: async () => ({ configured: true, bids: [
      { id: "cs_copy_1", ref: encodeRef("Real Payer", "real.io", ""), amount: 50,
        at: Math.floor(Date.now() / 1000) },
    ] }) });
    await mergeBoardFeed();
    return {
      seededSeasons,
      seasonsAfter: (state.seasons || []).length,
      hallAfter: (state.hall || []).length,
      foot: document.querySelector("#footMode").textContent,
      rule: document.querySelector("#ruleDefend").textContent,
    };
  });
  await dctx.close();
  assert(shape.seededSeasons > 0, "demo board should seed Season champions for this test to mean anything");
  assert(shape.seasonsAfter === 0,
    `live board still shows ${shape.seasonsAfter} fabricated Season champions`);
  assert(shape.hallAfter === 0, "live board still shows a fabricated Hall of Fame");
  assert(!/demo|simulated|no card required/i.test(shape.foot),
    `live board still calls itself a demo in the footer: "${shape.foot}"`);
  assert(!/automatically/i.test(shape.rule),
    `live board still promises automatic re-bidding it cannot perform: "${shape.rule}"`);
});

await test("a committed defend budget rides the ledger and offers a one-tap retake", async () => {
  const dctx = await browser.newContext();
  const dp = await dctx.newPage();
  await dp.goto(url + "?nosim", { waitUntil: "networkidle" });
  await dp.waitForTimeout(400);
  const shape = await dp.evaluate(async () => {
    localStorage.setItem("outranked_name", "Defender Co");
    const now = Math.floor(Date.now() / 1000);
    let bids = [
      { id: "cs_def_1", ref: encodeRef("Defender Co", "def.io", "", 100), amount: 50, at: now },
      { id: "cs_def_2", ref: encodeRef("Rival Inc", "rival.io", ""), amount: 80, at: now },
    ];
    CONFIG.BOARD_FEED_URL = "stub://defend";
    window.fetch = async () => ({ json: async () => ({ configured: true, bids }) });
    await mergeBoardFeed();
    const mine = state.entries.find(e => e.name === "Defender Co");
    const bar = document.querySelector("#defendBar");
    const inBudget = { hidden: bar.hidden, msg: document.querySelector("#defendMsg").textContent,
                       target: bar.dataset.target };
    // Now the rival jumps far beyond the committed budget: the watch must go quiet
    // rather than nag about a fight this bidder never agreed to pay for.
    bids = bids.concat([{ id: "cs_def_3", ref: encodeRef("Rival Inc", "rival.io", ""), amount: 5000, at: now }]);
    await mergeBoardFeed();
    return { defend: mine && mine.defend, inBudget, overBudgetHidden: bar.hidden,
             rivalId: (state.entries.find(e => e.name === "Rival Inc") || {}).id };
  });
  await dctx.close();
  assert(shape.defend === 100, `defend budget should survive the ledger round-trip, got ${shape.defend}`);
  assert(shape.inBudget.hidden === false, "defend watch should surface when the retake is within budget");
  assert(/\$31\b/.test(shape.inBudget.msg),
    `retake should be priced to win at $31, got "${shape.inBudget.msg}"`);
  assert(shape.inBudget.target === shape.rivalId,
    "defend button should aim at the listing that passed us");
  assert(shape.overBudgetHidden === true,
    "defend watch must go quiet once the retake costs more than the committed budget");
});

await test("the leaderboard shows names, and never scrolls sideways, on phones", async () => {
  // .who carries min-width:0 so its ellipsis works, which also let the 1fr track
  // collapse: measured 0px wide at 320 and 16px at 360, i.e. a leaderboard
  // showing every listing's rank and price and none of their names.
  for (const width of [320, 360, 390, 430]) {
    const mctx = await browser.newContext({ viewport: { width, height: 800 } });
    const mp = await mctx.newPage();
    await mp.goto(url + "?nosim", { waitUntil: "networkidle" });
    await mp.waitForTimeout(300);
    const m = await mp.evaluate(() => {
      const row = document.querySelector(".row:not(.msg)");
      const who = row && row.querySelector(".who");
      const nm = row && row.querySelector(".nm");
      return {
        whoW: who ? Math.round(who.getBoundingClientRect().width) : -1,
        nmText: nm ? (nm.textContent || "").trim() : "",
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    await mctx.close();
    assert(m.whoW >= 120,
      `at ${width}px the listing name column is ${m.whoW}px — the board would show no names`);
    assert(m.nmText.length > 0, `at ${width}px the top listing rendered no name`);
    assert(m.overflow <= 0, `at ${width}px the page scrolls sideways by ${m.overflow}px`);
  }
});

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
    { id: "c", ref: "b64." + b64("alpha|alpha.io|"), amount: 200, at: 30 },
  ]);
  assert(board.length === 2, `expected 2 listings, got ${board.length}`);
  const alpha = board.find(e => e.name === "Alpha");
  assert(alpha.total === 500 && alpha.bids === 2,
    `Alpha's two bids should aggregate to $500, got ${JSON.stringify(alpha)}`);
  // Both sit at $500. Beta got there at t=20, Alpha only at t=30, so Beta holds the higher rank.
  assert(board[0].name === "Beta", `tie should go to whoever reached the total first: ${board.map(e => e.name).join(",")}`);
});

await test("a cheap bid cannot hijack an established listing's link or decree", () => {
  const [victim] = rank([
    // The real owner establishes the listing with a large bid.
    { id: "a", ref: "b64." + b64("Whale Co|whale.io|We do not lose."), amount: 5000, at: 10 },
    // An attacker pays $1 under the same name, trying to repoint the link and reword the crown.
    { id: "b", ref: "b64." + b64("whale co|evil-phish.example|Actually we surrender."), amount: 1, at: 20 },
  ]);
  assert(victim.url === "whale.io", `link was hijacked by a $1 bid: ${victim.url}`);
  assert(victim.decree === "We do not lose.", `decree was hijacked by a $1 bid: ${victim.decree}`);
  // The griefer's dollar still counts for the victim — attacking costs you a donation.
  assert(victim.total === 5001, `hostile bid should still credit the listing, got ${victim.total}`);
});

await test("a genuinely larger bid does take over the decree", () => {
  const [e] = rank([
    { id: "a", ref: "b64." + b64("Duel|duel.io|First word."), amount: 100, at: 10 },
    { id: "b", ref: "b64." + b64("Duel|duel.io|Last word."), amount: 900, at: 20 },
  ]);
  assert(e.decree === "Last word.", `largest bid should hold the decree, got ${e.decree}`);
});

await test("ledger reader paginates Stripe, keeps only paid sessions, and leaks no PII", async () => {
  // A mock Stripe: two pages, mixed payment states, cents-denominated amounts,
  // and customer PII that must never survive the read.
  const pages = {
    first: {
      has_more: true,
      data: [
        { id: "cs_a", payment_status: "paid", amount_total: 90000, created: 300,
          client_reference_id: "b64." + b64("Whale Co|whale.io|"),
          customer_details: { email: "buyer@example.com", name: "Real Person" } },
        { id: "cs_b", payment_status: "unpaid", amount_total: 500000, created: 290,
          client_reference_id: "b64." + b64("Deadbeat|nope.io|") },
        { id: "cs_c", payment_status: "paid", amount_total: 0, created: 280, client_reference_id: "" },
      ],
    },
    cs_c: {
      has_more: false,
      data: [
        { id: "cs_d", payment_status: "paid", amount_total: 2500, created: 100,
          client_reference_id: "b64." + b64("Minnow|minnow.io|") },
      ],
    },
  };
  const mock = createServer((req, res) => {
    const after = new URL(req.url, "http://x").searchParams.get("starting_after");
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(pages[after || "first"] || { has_more: false, data: [] }));
  });
  await new Promise(r => mock.listen(0, "127.0.0.1", r));
  process.env.STRIPE_API_BASE = `http://127.0.0.1:${mock.address().port}`;

  // Drop the cached module FIRST so it re-reads STRIPE_API_BASE at load time.
  delete require.cache[require.resolve(join(root, "api", "_board.js"))];
  const fresh = require(join(root, "api", "_board.js"));
  const bids = await fresh.fetchBids("sk_test_x");
  mock.close();
  delete process.env.STRIPE_API_BASE;

  assert(bids.length === 2, `expected 2 paid, non-zero bids across 2 pages, got ${bids.length}`);
  assert(bids[0].id === "cs_d" && bids[1].id === "cs_a", `bids should be oldest-first: ${bids.map(b => b.id)}`);
  assert(bids[1].amount === 900, `amount should convert cents to dollars, got ${bids[1].amount}`);
  const serialized = JSON.stringify(bids);
  assert(!/buyer@example\.com|Real Person|customer_details/.test(serialized),
    "customer PII leaked out of the ledger reader");
  assert(Object.keys(bids[0]).sort().join() === "amount,at,id,ref",
    `unexpected fields exposed: ${Object.keys(bids[0])}`);
  const board = fresh.rank(bids);
  assert(board[0].name === "Whale Co" && board[0].total === 900, `ranking wrong: ${JSON.stringify(board[0])}`);
});

await test("a zero-decimal currency is not credited 100x", async () => {
  // Stripe quotes JPY in whole yen, not sen. Dividing every amount by 100 was
  // crediting a JPY payer a hundred times what they actually sent.
  const mock = createServer((req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ has_more: false, data: [
      { id: "cs_jpy", payment_status: "paid", amount_total: 5000, currency: "jpy", created: 10,
        client_reference_id: "b64." + b64("Tokyo Co|tokyo.jp|") },
      { id: "cs_usd", payment_status: "paid", amount_total: 5000, currency: "usd", created: 20,
        client_reference_id: "b64." + b64("Dollar Co|dollar.com|") },
      { id: "cs_kwd", payment_status: "paid", amount_total: 5000, currency: "kwd", created: 30,
        client_reference_id: "b64." + b64("Kuwait Co|kw.co|") },
    ] }));
  });
  await new Promise(r => mock.listen(0, "127.0.0.1", r));
  process.env.STRIPE_API_BASE = `http://127.0.0.1:${mock.address().port}`;
  delete require.cache[require.resolve(join(root, "api", "_board.js"))];
  const fresh = require(join(root, "api", "_board.js"));
  const bids = await fresh.fetchBids("sk_test_x");
  mock.close();
  delete process.env.STRIPE_API_BASE;

  const by = Object.fromEntries(bids.map(b => [b.id, b.amount]));
  assert(by.cs_jpy === 5000, `JPY 5000 is 5000 yen, credited as ${by.cs_jpy}`);
  assert(by.cs_usd === 50, `USD 5000 cents is $50, credited as ${by.cs_usd}`);
  assert(by.cs_kwd === 5, `KWD is three-decimal: 5000 fils is 5 dinar, credited as ${by.cs_kwd}`);
});

await test("a refunded or disputed payment loses its rank", async () => {
  // Stripe does not change payment_status on a refund or a lost dispute, so
  // without reading the charge a refunded bid would hold the crown forever.
  const mock = createServer((req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ has_more: false, data: [
      { id: "cs_kept", payment_status: "paid", amount_total: 10000, currency: "usd", created: 10,
        client_reference_id: "b64." + b64("Honest Co|honest.io|"),
        payment_intent: { latest_charge: { amount_refunded: 0, disputed: false } } },
      { id: "cs_refunded", payment_status: "paid", amount_total: 90000, currency: "usd", created: 20,
        client_reference_id: "b64." + b64("Refund Co|refund.io|"),
        payment_intent: { latest_charge: { amount_refunded: 90000, disputed: false } } },
      { id: "cs_partial", payment_status: "paid", amount_total: 10000, currency: "usd", created: 30,
        client_reference_id: "b64." + b64("Partial Co|partial.io|"),
        payment_intent: { latest_charge: { amount_refunded: 4000, disputed: false } } },
      { id: "cs_disputed", payment_status: "paid", amount_total: 50000, currency: "usd", created: 40,
        client_reference_id: "b64." + b64("Chargeback Co|cb.io|"),
        payment_intent: { latest_charge: { amount_refunded: 0, disputed: true } } },
    ] }));
  });
  await new Promise(r => mock.listen(0, "127.0.0.1", r));
  process.env.STRIPE_API_BASE = `http://127.0.0.1:${mock.address().port}`;
  delete require.cache[require.resolve(join(root, "api", "_board.js"))];
  const fresh = require(join(root, "api", "_board.js"));
  const bids = await fresh.fetchBids("sk_test_x");
  mock.close();
  delete process.env.STRIPE_API_BASE;

  const ids = bids.map(b => b.id);
  assert(!ids.includes("cs_refunded"), "a fully refunded payment still holds a place on the board");
  assert(!ids.includes("cs_disputed"), "a disputed (charged-back) payment still holds a place on the board");
  const partial = bids.find(b => b.id === "cs_partial");
  assert(partial && partial.amount === 60,
    `a partial refund should leave only what was kept ($60), got ${partial && partial.amount}`);
  const kept = bids.find(b => b.id === "cs_kept");
  assert(kept && kept.amount === 100, `an untouched $100 payment should stand, got ${kept && kept.amount}`);
});

await test("a hostile listing name cannot hijack the marketing robot's posts", async () => {
  // $5 buys a listing name, and that name is pasted into a post published from
  // the operator's own X account. It must not be able to tag someone, link
  // anywhere, or reshape the post. (The sanitiser lives in its own module
  // because daily-post.mjs runs its whole posting flow at import time.)
  const { safeName } = await import(pathToFileURL(join(root, "scripts", "safe-name.mjs")).href);
  const hostile = "@jack http://evil.example" + String.fromCharCode(10) + "FREE #crypto $TSLA evil.co";
  const got = safeName(hostile);
  assert(!/@/.test(got), `mention survived into a post: "${got}"`);
  assert(!/https?:|evil/.test(got), `link survived into a post: "${got}"`);
  assert(!/[\n\r]/.test(got), `newline survived, letting a name restructure the post: "${got}"`);
  assert(!/#|[$]/.test(got), `hashtag or cashtag survived into a post: "${got}"`);
  assert(safeName("x".repeat(400)).length === 30, "names must be hard-capped at 30 chars");
  assert(safeName("ShipFast") === "ShipFast", "an ordinary name must pass through untouched");
  assert(safeName("") === "Anonymous", "an empty name must fall back, not render blank");
});

await test("public ledger page renders a listing's payments without leaking full session IDs", async () => {
  const pages = {
    first: { has_more: false, data: [
      { id: "cs_ledger_alpha_00001", payment_status: "paid", amount_total: 50000, created: 1700000000,
        client_reference_id: "b64." + b64("Ledger Co|ledger.co|"), customer_details: { email: "x@y.z" } },
      { id: "cs_ledger_alpha_00002", payment_status: "paid", amount_total: 2500, created: 1700100000,
        client_reference_id: "b64." + b64("ledger co|ledger.co|") },
      { id: "cs_other_000000000001", payment_status: "paid", amount_total: 900, created: 1700000500,
        client_reference_id: "b64." + b64("Bystander|by.st|") },
    ]},
  };
  const mock = createServer((req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(pages.first));
  });
  await new Promise(r => mock.listen(0, "127.0.0.1", r));
  process.env.STRIPE_API_BASE = `http://127.0.0.1:${mock.address().port}`;
  process.env.STRIPE_SECRET_KEY = "sk_test_x";
  for (const m of ["_board.js", "ledger.js"]) delete require.cache[require.resolve(join(root, "api", m))];
  const handler = require(join(root, "api", "ledger.js"));

  let status, bodyOut = "";
  const res = {
    setHeader(){}, status(s){ status = s; return res; }, send(h){ bodyOut = h; return res; },
  };
  await handler({ query: { name: "Ledger Co" } }, res);
  mock.close();
  delete process.env.STRIPE_API_BASE; delete process.env.STRIPE_SECRET_KEY;

  assert(status === 200, `expected 200, got ${status}`);
  assert(bodyOut.includes("$525"), "total should aggregate both payments ($500 + $25)");
  assert(bodyOut.includes("Rank <b>#1</b>"), "rank missing or wrong");
  assert((bodyOut.match(/<tr><td>/g) || []).length === 2, "should list exactly the listing's 2 payments");
  assert(!bodyOut.includes("cs_ledger_alpha_00001"), "full session ID leaked — must be truncated");
  assert(bodyOut.includes("cs_ledger_al…"), "truncated session ID missing");
  assert(!bodyOut.includes("x@y.z"), "customer PII leaked into the public ledger page");
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
