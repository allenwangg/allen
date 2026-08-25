// Shared Stripe reader. Files prefixed with "_" are not routed by Vercel.
//
// OUTRANKED has no database. The board IS the Stripe ledger: every listing on
// the leaderboard corresponds to a real, completed Stripe payment, and the
// ranking is recomputed from those payments on every request. That means no
// KV store, no Postgres, no webhook plumbing to keep in sync — and no way for
// a listing to appear without money actually having changed hands.
//
// Setup is one environment variable in Vercel: STRIPE_SECRET_KEY.

const STRIPE_API = "https://api.stripe.com/v1/checkout/sessions";
const MAX_PAGES = 20; // 2,000 most recent sessions

/**
 * Fetch completed checkout sessions and reduce them to public bid records.
 * Deliberately returns ONLY: session id, the client_reference_id the page
 * encoded, the amount, and the timestamp. No customer email, name, address,
 * or payment details ever leave this function.
 */
async function fetchBids(key) {
  const bids = [];
  let startingAfter = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    const qs = new URLSearchParams({ limit: "100" });
    if (startingAfter) qs.set("starting_after", startingAfter);

    const r = await fetch(`${STRIPE_API}?${qs}`, {
      headers: { authorization: `Bearer ${key}` },
    });
    if (!r.ok) throw new Error(`stripe ${r.status}`);

    const body = await r.json();
    const rows = body.data || [];
    for (const s of rows) {
      if (s.payment_status !== "paid") continue;
      const amount = Math.round((s.amount_total || 0) / 100);
      if (amount < 1) continue;
      bids.push({
        id: s.id,
        ref: typeof s.client_reference_id === "string" ? s.client_reference_id.slice(0, 200) : "",
        amount,
        at: s.created,
      });
    }
    if (!body.has_more || !rows.length) break;
    startingAfter = rows[rows.length - 1].id;
  }

  bids.sort((a, b) => a.at - b.at); // oldest first: ties go to the earlier bid
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

/** Aggregate bids into a ranked board. */
function rank(bids) {
  const byName = new Map();
  for (const b of bids) {
    const { name, url, decree } = decodeRef(b.ref);
    const keyName = name.toLowerCase();
    const e = byName.get(keyName) || { name, url: "", total: 0, bids: 0, decree: "", last: 0 };
    e.total += b.amount;
    e.bids += 1;
    e.last = b.at;
    if (url) e.url = url;
    if (decree) e.decree = decree;
    byName.set(keyName, e);
  }
  return [...byName.values()].sort((a, b) => b.total - a.total || a.last - b.last);
}

module.exports = { fetchBids, decodeRef, rank };
