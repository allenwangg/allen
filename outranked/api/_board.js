// Shared Stripe reader. Files prefixed with "_" are not routed by Vercel.
//
// OUTRANKED has no database. The board IS the Stripe ledger: every listing on
// the leaderboard corresponds to a real, completed Stripe payment, and the
// ranking is recomputed from those payments on every request. That means no
// KV store, no Postgres, no webhook plumbing to keep in sync — and no way for
// a listing to appear without money actually having changed hands.
//
// Setup is one environment variable in Vercel: STRIPE_SECRET_KEY.

// STRIPE_API_BASE is overridable so the test suite can exercise this against a mock.
const STRIPE_API = (process.env.STRIPE_API_BASE || "https://api.stripe.com") + "/v1/checkout/sessions";

// Stripe lists newest-first, so truncation drops the OLDEST payments — which would
// silently understate lifetime totals. We therefore page generously and, if we ever
// do run out of room, say so (`partial`) rather than publishing a wrong board.
// Ceiling: 5,000 paid sessions. Past that, add a cached aggregate (Vercel KV or a
// nightly snapshot committed to the repo) and only page back to the snapshot.
const crypto = require("crypto");
/* Stable per-session public reference: same input always yields the same id, so
   replaying the ledger stays idempotent, but it reveals nothing about Stripe. */
function refId(sessionId) {
  return crypto.createHash("sha256").update(String(sessionId)).digest("hex").slice(0, 20);
}

const MAX_PAGES = 50;
const TIME_BUDGET_MS = 7000; // stay well inside the function timeout

// Stripe reports amounts in a currency's MINOR unit, and that is not always
// 1/100: zero-decimal currencies quote whole units, three-decimal ones quote
// thousandths. Dividing everything by 100 credited a KRW payer 100x what they
// paid. Floor, never round — the board must never credit money nobody sent.
const ZERO_DECIMAL = new Set(["bif","clp","djf","gnf","jpy","kmf","krw","mga",
  "pyg","rwf","ugx","vnd","vuv","xaf","xof","xpf"]);
const THREE_DECIMAL = new Set(["bhd","iqd","jod","kwd","omr","tnd"]);
function majorUnits(minor, currency) {
  const c = String(currency || "usd").toLowerCase();
  if (ZERO_DECIMAL.has(c)) return Math.floor(minor);
  if (THREE_DECIMAL.has(c)) return Math.floor(minor / 1000);
  return Math.floor(minor / 100);
}

/**
 * Fetch completed checkout sessions and reduce them to public bid records.
 * Deliberately returns ONLY: session id, the client_reference_id the page
 * encoded, the amount, and the timestamp. No customer email, name, address,
 * or payment details ever leave this function.
 */
async function fetchBids(key) {
  const bids = [];
  let startingAfter = null;
  let partial = false;
  const deadline = Date.now() + TIME_BUDGET_MS;

  for (let page = 0; page < MAX_PAGES; page++) {
    if (Date.now() > deadline) { partial = true; break; }
    const qs = new URLSearchParams({ limit: "100" });
    // Needed to see refunds and disputes: neither changes payment_status, so
    // without the charge a refunded bid would hold its rank forever.
    qs.append("expand[]", "data.payment_intent.latest_charge");
    if (startingAfter) qs.set("starting_after", startingAfter);

    const r = await fetch(`${STRIPE_API}?${qs}`, {
      headers: { authorization: `Bearer ${key}` },
    });
    if (!r.ok) throw new Error(`stripe ${r.status}`);

    const body = await r.json();
    const rows = body.data || [];
    for (const s of rows) {
      if (s.payment_status !== "paid") continue;
      const charge = s.payment_intent && s.payment_intent.latest_charge;
      // A lost dispute means the money is gone; rank must go with it.
      if (charge && charge.disputed) continue;
      const refunded = charge ? (charge.amount_refunded || 0) : 0;
      const net = (s.amount_total || 0) - refunded;
      if (net <= 0) continue;
      const amount = majorUnits(net, s.currency);
      if (amount < 1) continue;
      bids.push({
        // The ledger page tells visitors the full records stay in Stripe. That
        // was only true of the page: this endpoint published every raw session
        // ID cross-origin. A stable digest keeps the client's dedup working
        // without publishing Stripe's own identifiers.
        id: refId(s.id),
        ref: typeof s.client_reference_id === "string" ? s.client_reference_id.slice(0, 200) : "",
        amount,
        at: s.created,
      });
    }
    if (!body.has_more || !rows.length) break;
    startingAfter = rows[rows.length - 1].id;
    if (page === MAX_PAGES - 1) partial = true;
  }

  bids.sort((a, b) => a.at - b.at); // oldest first: ties go to the earlier bid
  bids.partial = partial;
  return bids;
}

/** Decode the "name|url|decree" payload the page base64url-encodes into the reference. */
function decodeRef(ref) {
  if (!ref) return { name: "Anonymous", url: "", decree: "" };
  // Legacy form: "<name>_<amount>_<nonce>"
  if (!/^b64\./.test(ref)) return { name: ref.split("_")[0] || "Anonymous", url: "", decree: "" };
  const body = ref.slice(4);
  if (!/^[A-Za-z0-9\-_]+$/.test(body)) return { name: "Anonymous", url: "", decree: "" };
  try {
    const b64 = body.replace(/-/g, "+").replace(/_/g, "/");
    const raw = Buffer.from(b64, "base64").toString("utf8");
    const [name, url, decree] = raw.split("|");
    return {
      name: (name || "Anonymous").slice(0, 30),
      url: (url || "").slice(0, 60),
      decree: (decree || "").slice(0, 60),
    };
  } catch {
    return { name: "Anonymous", url: "", decree: "" };
  }
}

/**
 * Aggregate bids into a ranked board.
 *
 * Listings are keyed by name and nobody logs in, so a stranger can always pay
 * INTO someone else's listing. Two rules keep that from being an attack:
 *   - the URL is claimed by the first bid that sets one, so a later $1 bid can
 *     never repoint an established listing's link at somewhere else;
 *   - the decree belongs to the largest single bid on the listing, so nobody
 *     can put cheap words in an expensive mouth.
 * Either way the money still lands on the listing — griefing it costs you a
 * donation to your target.
 */
function rank(bids) {
  const byName = new Map();
  for (const b of bids) {
    const { name, url, decree } = decodeRef(b.ref);
    const keyName = name.toLowerCase();
    const e = byName.get(keyName) || { name, url: "", total: 0, bids: 0, decree: "", last: 0, topBid: 0 };
    e.total += b.amount;
    e.bids += 1;
    e.last = b.at;
    if (url && !e.url) e.url = url;
    if (decree && b.amount >= e.topBid) e.decree = decree;
    if (b.amount > e.topBid) e.topBid = b.amount;
    byName.set(keyName, e);
  }
  return [...byName.values()].sort((a, b) => b.total - a.total || a.last - b.last);
}

module.exports = { fetchBids, decodeRef, rank, refId };
