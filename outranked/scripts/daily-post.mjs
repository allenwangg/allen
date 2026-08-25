// OUTRANKED daily auto-post — the $0 marketing robot.
//
// Posts to X on the free API tier (500 posts/month; this uses ~60) with OAuth 1.0a
// user-context signing and zero npm dependencies.
//
// Required GitHub Actions secrets (repo → Settings → Secrets and variables → Actions):
//   X_API_KEY, X_API_SECRET          — developer.x.com → your app → "Keys and tokens"
//   X_ACCESS_TOKEN, X_ACCESS_SECRET  — same page, "Access token and secret" (Read and Write)
// Optional repository variable:
//   SITE_URL — your deployed URL. The board is read from <SITE_URL>api/board.
//
// Two modes, chosen by the UTC hour the workflow fires at:
//   ~00:05 UTC → the board just reset; today's crown is open again
//   ~14:00 UTC → the morning stats ritual, with real numbers from the Stripe ledger
//
// Every number posted comes from completed payments. If the board is empty or
// unreachable, the robot stays quiet rather than inventing a milestone.

import crypto from "node:crypto";

const {
  X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET,
  SITE_URL = "https://outranked.vercel.app/",
} = process.env;

const DRY_RUN = process.env.DRY_RUN === "1";   // preview the post without sending it

if (!DRY_RUN && (!X_API_KEY || !X_API_SECRET || !X_ACCESS_TOKEN || !X_ACCESS_SECRET)) {
  console.log("X API secrets not configured — skipping post. See this file's header.");
  process.exit(0);
}

const site = SITE_URL.endsWith("/") ? SITE_URL : SITE_URL + "/";
const BOARD_URL = process.env.BOARD_FEED_URL || site + "api/board";
const usd = n => "$" + Math.round(n).toLocaleString("en-US");

/* ---------- X posting (OAuth 1.0a, no dependencies) ---------- */
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
  const base = [method, pct(url), pct(Object.keys(p).sort().map(k => `${pct(k)}=${pct(p[k])}`).join("&"))].join("&");
  p.oauth_signature = crypto
    .createHmac("sha1", `${pct(X_API_SECRET)}&${pct(X_ACCESS_SECRET)}`)
    .update(base).digest("base64");
  return "OAuth " + Object.keys(p).sort().map(k => `${pct(k)}="${pct(p[k])}"`).join(", ");
}

async function post(text) {
  if (DRY_RUN) { console.log(text); return; }
  const url = "https://api.x.com/2/tweets";
  const res = await fetch(url, {
    method: "POST",
    headers: { authorization: oauthHeader("POST", url), "content-type": "application/json" },
    body: JSON.stringify({ text }),
  });
  const body = await res.text();
  if (!res.ok) { console.error(`Post failed (${res.status}): ${body}`); process.exit(1); }
  console.log("Posted:\n" + text);
}

/* ---------- read the board straight from the payment ledger ---------- */
function decodeRef(ref) {
  if (!ref) return { name: "Anonymous" };
  if (!/^b64\./.test(ref)) return { name: ref.split("_")[0] || "Anonymous" };
  const body = ref.slice(4);
  if (!/^[A-Za-z0-9\-_]+$/.test(body)) return { name: "Anonymous" };
  try {
    const raw = Buffer.from(body.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    return { name: (raw.split("|")[0] || "Anonymous").slice(0, 30) };
  } catch { return { name: "Anonymous" }; }
}

async function board() {
  let payload;
  try {
    const res = await fetch(BOARD_URL, { headers: { accept: "application/json" } });
    if (!res.ok) return null;
    payload = await res.json();
  } catch { return null; }

  const bids = Array.isArray(payload) ? payload : payload && payload.bids;
  if (!Array.isArray(bids) || !bids.length) return null;

  const startOfDay = Math.floor(Date.UTC(
    new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()) / 1000);

  const all = new Map();
  const today = new Map();
  for (const b of bids) {
    const name = decodeRef(b.ref).name;
    const amount = +b.amount || 0;
    all.set(name, (all.get(name) || 0) + amount);
    if (b.at >= startOfDay) today.set(name, (today.get(name) || 0) + amount);
  }
  const rankOf = m => [...m.entries()].sort((a, b) => b[1] - a[1]);
  const allTime = rankOf(all);
  const todays = rankOf(today);

  return {
    revenue: bids.reduce((s, b) => s + (+b.amount || 0), 0),
    bids: bids.length,
    listings: all.size,
    king: allTime[0] && { name: allTime[0][0], total: allTime[0][1] },
    todayKing: todays[0] && { name: todays[0][0], total: todays[0][1] },
    todayBids: [...today.values()].length,
    todayRevenue: [...today.values()].reduce((s, v) => s + v, 0),
  };
}

/* ---------- the two rituals ---------- */
// MODE=reset|ritual overrides the clock, so the workflow's manual "Run" button
// (and DRY_RUN=1 locally) can preview either post on demand.
const mode = process.env.MODE || (new Date().getUTCHours() < 7 ? "reset" : "ritual");
const b = await board();

if (mode === "reset") {
  // Midnight reset. Naming yesterday's winner makes it a story, not an announcement.
  const crowned = b && b.todayKing
    ? `Yesterday ${b.todayKing.name} held it at ${usd(b.todayKing.total)}. That reign is over.\n\n`
    : `Yesterday's king is history.\n\n`;
  await post(
    `🔥 The board just reset.\n\n` +
    crowned +
    `Today's crown starts at $5 and the first mover owns the top of the board until midnight.\n\n` +
    `${site}?r=reset`
  );
} else {
  if (!b) { console.log("Board empty or unreachable — staying quiet rather than posting a fake milestone."); process.exit(0); }
  const lines = [
    `Good morning friends. The board never sleeps:`,
    ``,
    `💰 ${usd(b.revenue)} in paid bids across ${b.listings} listings`,
  ];
  if (b.king) lines.push(`👑 all-time #1: ${b.king.name} at ${usd(b.king.total)} — taking it costs ${usd(b.king.total + 1)}`);
  if (b.todayKing) lines.push(`🔥 today's king: ${b.todayKing.name} at ${usd(b.todayKing.total)} — resets at midnight UTC`);
  else lines.push(`🔥 nobody has bid today. The crown is sitting there for $5.`);
  lines.push(``, `${site}?r=ritual`);
  await post(lines.join("\n"));
}
