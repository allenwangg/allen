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
// Five rituals, chosen by the clock (MODE=... overrides for previews):
//   00:05 UTC daily  → coronation: the board reset, naming the fallen king
//   14:00 UTC daily  → the morning stats ritual, from the Stripe ledger
//   23:00 UTC daily  → the Final Hour snipe alert
//   15:00 UTC Sunday → the weekly hall-of-fame recap, with streaks
//   00:15 UTC 1st    → the monthly Season Coronation
//
// Every number posted comes from completed payments. If the board is empty or
// unreachable, the robot stays quiet rather than inventing a milestone.

import crypto from "node:crypto";

const {
  X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET,
  SITE_URL = "https://outranked-xyz.vercel.app/",
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
    todayRunnerUp: todays[1] && { name: todays[1][0], total: todays[1][1] },
    todayBids: [...today.values()].length,
    todayRevenue: [...today.values()].reduce((s, v) => s + v, 0),
  };
}

/* ---------- the five rituals ---------- */
// MODE=reset|ritual|final|week|season overrides the clock, so the workflow's
// manual "Run" button (and DRY_RUN=1 locally) can preview any post on demand.
const nowUTC = new Date();
const hourNow = nowUTC.getUTCHours();
const mode = process.env.MODE ||
  (hourNow < 7 ? ((nowUTC.getUTCDate() === 1 && nowUTC.getUTCMinutes() >= 10) ? "season" : "reset")
   : hourNow >= 22 ? "final"
   : (nowUTC.getUTCDay() === 0 && hourNow === 15) ? "week"
   : "ritual");
const b = await board();

if (mode === "reset") {
  // The coronation. Naming the winner — and how close the runner-up came —
  // turns an announcement into a story two people will repost.
  const lines = [`👑 CORONATION — the board just reset.`, ``];
  if (b && b.todayKing) {
    lines.push(`${b.todayKing.name} held the crown at ${usd(b.todayKing.total)} and is engraved in the hall of fame forever.`);
    if (b.todayRunnerUp) {
      const diff = b.todayKing.total - b.todayRunnerUp.total;
      lines.push(``, `${b.todayRunnerUp.name} came ${usd(diff)} short. Brutal.`);
    }
    lines.push(``);
  } else {
    lines.push(`Yesterday's king is history.`, ``);
  }
  lines.push(`The board is empty again. Today's crown starts at $5, and the first mover owns the top until midnight.`, ``, `${site}?r=reset`);
  await post(lines.join("\n"));
} else if (mode === "final") {
  // The deadline post — the most reliable conversion event of the day.
  // No king yet = a different, equally good story (a free crown).
  if (b && b.todayKing) {
    await post(
      `⏳ FINAL HOUR.\n\n` +
      `${b.todayKing.name} is sitting on today's crown at ${usd(b.todayKing.total)}.\n\n` +
      `In about an hour they're in the hall of fame and the board wipes back to $5.\n\n` +
      `If you were ever going to snipe someone, it's now.\n\n` +
      `${site}?r=final`
    );
  } else {
    await post(
      `⏳ FINAL HOUR — and nobody has bid today.\n\n` +
      `Today's crown, a permanent hall-of-fame entry, is sitting there for $5.\n\n` +
      `Cheapest flex on the internet, one hour left.\n\n` +
      `${site}?r=final`
    );
  }
} else if (mode === "season") {
  // 1st of the month: crown last month's champion from the ledger itself.
  let payload = null;
  try { payload = await (await fetch(BOARD_URL, { headers: { accept: "application/json" } })).json(); } catch {}
  const bids = payload && (Array.isArray(payload) ? payload : payload.bids);
  if (!Array.isArray(bids) || !bids.length) { console.log("No ledger data for a season coronation — staying quiet."); process.exit(0); }
  const lastMonth = new Date(Date.UTC(nowUTC.getUTCFullYear(), nowUTC.getUTCMonth() - 1, 1));
  const key = lastMonth.toISOString().slice(0, 7);
  const monthName = lastMonth.toLocaleString("en-US", { month: "long", timeZone: "UTC" });
  const totals = new Map();
  for (const bid of bids) {
    if (new Date(bid.at * 1000).toISOString().slice(0, 7) !== key) continue;
    const n = decodeRef(bid.ref).name;
    totals.set(n, (totals.get(n) || 0) + (+bid.amount || 0));
  }
  const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  if (!ranked.length) { console.log("Last month had no bids — staying quiet."); process.exit(0); }
  const [champ, champTotal] = ranked[0];
  const runner = ranked[1];
  const lines = [
    `🏆 SEASON CORONATION`,
    ``,
    `${champ} is the ${monthName} Season Champion with ${usd(champTotal)} — engraved in the record books forever.`,
  ];
  if (runner) lines.push(``, `${runner[0]} finished ${usd(champTotal - runner[1])} behind. A whole month, ${usd(champTotal - runner[1])} short.`);
  lines.push(``, `The new season starts now. Every listing back to zero. Every crown up for grabs.`, ``, `${site}?r=season`);
  await post(lines.join("\n"));
} else if (mode === "week") {
  // Sunday hall-of-fame recap: the week's daily kings, computed from the
  // ledger itself, plus any active streak worth taunting about.
  let payload = null;
  try { payload = await (await fetch(BOARD_URL, { headers: { accept: "application/json" } })).json(); } catch {}
  const bids = payload && (Array.isArray(payload) ? payload : payload.bids);
  if (!Array.isArray(bids) || !bids.length) {
    console.log("No ledger data for a weekly recap — staying quiet."); process.exit(0);
  }
  const byDay = new Map();
  for (const bid of bids) {
    const d = new Date(bid.at * 1000).toISOString().slice(0, 10);
    const m = byDay.get(d) || new Map();
    const n = decodeRef(bid.ref).name;
    m.set(n, (m.get(n) || 0) + (+bid.amount || 0));
    byDay.set(d, m);
  }
  const days = [];
  for (let i = 7; i >= 1; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    const m = byDay.get(d);
    if (!m) continue;
    const [name, total] = [...m.entries()].sort((a, x) => x[1] - a[1])[0];
    days.push({ d, dow: ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][new Date(d).getUTCDay()], name, total });
  }
  if (!days.length) { console.log("No crowned days this week — staying quiet."); process.exit(0); }
  let streak = 1;
  for (let i = days.length - 2; i >= 0 && days[i].name === days[days.length - 1].name; i--) streak++;
  const lines = [`👑 This week's kings:`, ``];
  for (const k of days) lines.push(`${k.dow} — ${k.name} · ${usd(k.total)}`);
  lines.push(``);
  lines.push(streak > 1
    ? `${days[days.length - 1].name} is on a ${streak}-day streak. Somebody please stop them.`
    : `No streaks survived the week. The board shows no mercy.`);
  lines.push(``, `${site}?r=week`);
  await post(lines.join("\n"));
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
