// Live-deployment smoke test.
//
//   node scripts/check-live.mjs https://outranked-xyz.vercel.app
//
// Also runs from the repo's Actions tab ("Check live site" → Run workflow),
// which matters because GitHub's runners can reach the site even when a dev
// sandbox cannot. Exits non-zero if anything fails.

const base = (process.argv[2] || process.env.SITE_URL || "").replace(/\/$/, "");
if (!base) { console.error("usage: node scripts/check-live.mjs <site-url>"); process.exit(1); }

let failures = 0;
const ok = (name, cond, detail = "") => {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
  if (!cond) failures++;
};

console.log(`\nChecking ${base}\n`);

// 1. The page itself
try {
  const r = await fetch(base + "/");
  const html = await r.text();
  ok("homepage responds", r.ok, `HTTP ${r.status}`);
  ok("it is OUTRANKED", html.includes("<title>OUTRANKED"));
  const build = (html.match(/name="outranked-build" content="([^"]+)"/) || [])[1];
  ok("build stamp present", !!build, build ? `build ${build}` : "meta tag missing — an old version is deployed");
  ok("Today board shipped", html.includes("resets at midnight"));
  ok("Watch Mode shipped", html.includes('id="watchBtn"'));
  ok("ledger client shipped", html.includes("BOARD_FEED_URL"));
} catch (e) { ok("homepage responds", false, String(e)); }

// 2. The ledger API
try {
  const r = await fetch(base + "/api/board");
  const j = await r.json();
  ok("/api/board responds", r.ok, `HTTP ${r.status}`);
  ok("board payload shape", typeof j.configured === "boolean" && Array.isArray(j.bids));
  console.log(`        → configured: ${j.configured} (${j.configured
    ? j.bids.length + " paid bids on the board"
    : "no STRIPE_SECRET_KEY yet — site is in demo mode"})`);
} catch (e) { ok("/api/board responds", false, String(e)); }

// 3. The badge API
try {
  const r = await fetch(base + "/api/badge?name=smoketest");
  ok("/api/badge serves SVG", r.ok && (r.headers.get("content-type") || "").includes("svg"), `HTTP ${r.status}`);
} catch (e) { ok("/api/badge serves SVG", false, String(e)); }

// 4. Share assets
try {
  const r = await fetch(base + "/og.png");
  ok("og.png serves", r.ok && (r.headers.get("content-type") || "").includes("image"), `HTTP ${r.status}`);
} catch (e) { ok("og.png serves", false, String(e)); }
try {
  const r = await fetch(base + "/outbid-lol-alternative");
  ok("SEO page serves (clean URL)", r.ok, `HTTP ${r.status}`);
} catch (e) { ok("SEO page serves (clean URL)", false, String(e)); }

// 4b. The public ledger page
try {
  const r = await fetch(base + "/api/ledger?name=smoketest");
  const t = await r.text();
  ok("/api/ledger serves", r.ok && t.includes("ledger"), `HTTP ${r.status}`);
} catch (e) { ok("/api/ledger serves", false, String(e)); }

// 5. Crawlability + the 404 page
try {
  const r = await fetch(base + "/robots.txt");
  const t = await r.text();
  ok("robots.txt serves", r.ok && t.includes("Sitemap:"), `HTTP ${r.status}`);
  ok("sitemap points at this site", t.includes(base), t.includes(base) ? "" : "sitemap URL is another domain — run scripts/set-domain.mjs");
} catch (e) { ok("robots.txt serves", false, String(e)); }
try {
  const r = await fetch(base + "/sitemap.xml");
  ok("sitemap.xml serves", r.ok, `HTTP ${r.status}`);
} catch (e) { ok("sitemap.xml serves", false, String(e)); }
try {
  const r = await fetch(base + "/definitely-not-a-page-" + Date.now());
  const t = await r.text();
  ok("branded 404 page", r.status === 404 && t.includes("outbid"), `HTTP ${r.status}`);
} catch (e) { ok("branded 404 page", false, String(e)); }

console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed — the live site is healthy.");
process.exit(failures ? 1 : 0);
