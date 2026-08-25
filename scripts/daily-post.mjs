// OUTRANKED daily auto-post — $0 marketing robot.
// Posts to X via the free API tier (500 posts/month) using OAuth 1.0a
// user-context signing with zero npm dependencies.
//
// Required GitHub Actions secrets (Settings → Secrets and variables → Actions):
//   X_API_KEY, X_API_SECRET       — from developer.x.com (free account), app "Keys and tokens"
//   X_ACCESS_TOKEN, X_ACCESS_SECRET — same page, "Access token and secret" (Read and Write)
// Optional repository variable:
//   BOARD_FEED_URL — the Cloudflare worker /board URL; adds real revenue stats to posts
//   SITE_URL       — defaults to https://outranked.vercel.app/
//
// Modes (picked by UTC hour, matching the workflow's two cron entries):
//   ~00:05 UTC → "the board just reset" post (evergreen, needs no stats)
//   ~14:00 UTC → morning stats ritual (only posts if BOARD_FEED_URL is set)

import crypto from "node:crypto";

const {
  X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET,
  BOARD_FEED_URL, SITE_URL = "https://outranked.vercel.app/",
} = process.env;

if (!X_API_KEY || !X_API_SECRET || !X_ACCESS_TOKEN || !X_ACCESS_SECRET) {
  console.log("X API secrets not configured — skipping post. See file header for setup.");
  process.exit(0);
}

const pct = s => encodeURIComponent(s).replace(/[!*'()]/g, c => "%" + c.charCodeAt(0).toString(16).toUpperCase());

function oauthHeader(method, url) {
  const p = {
    oauth_consumer_key: X_API_KEY,
    oauth_nonce: crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: X_ACCESS_TOKEN,
    oauth_version: "1.0",
  };
  const base = [
    method,
    pct(url),
    pct(Object.keys(p).sort().map(k => `${pct(k)}=${pct(p[k])}`).join("&")),
  ].join("&");
  const key = `${pct(X_API_SECRET)}&${pct(X_ACCESS_SECRET)}`;
  p.oauth_signature = crypto.createHmac("sha1", key).update(base).digest("base64");
  return "OAuth " + Object.keys(p).sort().map(k => `${pct(k)}="${pct(p[k])}"`).join(", ");
}

async function post(text) {
  const url = "https://api.x.com/2/tweets";
  const res = await fetch(url, {
    method: "POST",
    headers: { authorization: oauthHeader("POST", url), "content-type": "application/json" },
    body: JSON.stringify({ text }),
  });
  const body = await res.text();
  if (!res.ok) { console.error(`Post failed (${res.status}): ${body}`); process.exit(1); }
  console.log("Posted:", body);
}

async function stats() {
  if (!BOARD_FEED_URL) return null;
  try {
    const bids = await (await fetch(BOARD_FEED_URL)).json();
    if (!Array.isArray(bids) || !bids.length) return null;
    const revenue = bids.reduce((s, b) => s + (+b.amount || 0), 0);
    const dayAgo = Date.now() / 1000 - 86400;
    const today = bids.filter(b => b.at > dayAgo);
    return { revenue, count: bids.length, todayCount: today.length,
             todayRevenue: today.reduce((s, b) => s + (+b.amount || 0), 0) };
  } catch { return null; }
}

const hour = new Date().getUTCHours();
if (hour < 7) {
  // midnight-reset post — true every day, needs no data
  await post(
    `🔥 The Today board just reset.\n\n` +
    `Yesterday's king is history. The crown starts at $5.\n\n` +
    `First mover owns the top of the board all day: ${SITE_URL}?r=reset`
  );
} else {
  const s = await stats();
  if (!s) { console.log("No board feed configured/reachable — skipping morning stats post."); process.exit(0); }
  await post(
    `Good morning friends. The board never sleeps:\n\n` +
    `💰 $${s.revenue.toLocaleString("en-US")} in verified bids (${s.count} total)\n` +
    `🔥 last 24h: ${s.todayCount} bids, $${s.todayRevenue.toLocaleString("en-US")}\n` +
    `👑 the crown resets at midnight UTC\n\n` +
    `${SITE_URL}?r=ritual`
  );
}
