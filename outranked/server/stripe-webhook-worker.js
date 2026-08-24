/**
 * OUTRANKED — Stripe webhook → confirmed-bids feed (Cloudflare Worker).
 *
 * Turns the static site into a fully verified pay-to-rank board:
 *   Stripe Payment Link  →  checkout.session.completed webhook  →  this worker
 *   →  KV store  →  GET /board JSON  →  the page merges confirmed bids.
 *
 * Deploy (once, ~5 minutes):
 *   1. `npm i -g wrangler && wrangler login`
 *   2. `wrangler kv namespace create BOARD` — put the returned id in wrangler.toml:
 *        name = "outranked-webhook"
 *        main = "stripe-webhook-worker.js"
 *        kv_namespaces = [{ binding = "BOARD", id = "<id>" }]
 *   3. `wrangler secret put STRIPE_WEBHOOK_SECRET`  (whsec_... from step 4)
 *   4. Stripe dashboard → Developers → Webhooks → Add endpoint:
 *        URL:    https://outranked-webhook.<you>.workers.dev/stripe
 *        Event:  checkout.session.completed
 *   5. `wrangler deploy`, then set CONFIG.BOARD_FEED_URL in index.html to
 *        https://outranked-webhook.<you>.workers.dev/board
 */

async function hmacHex(secret, payload) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    // Public confirmed-bids feed, consumed by the leaderboard page.
    if (req.method === "GET" && url.pathname === "/board") {
      const data = (await env.BOARD.get("bids")) || "[]";
      return new Response(data, {
        headers: {
          "content-type": "application/json",
          "access-control-allow-origin": "*",
          "cache-control": "public, max-age=15",
        },
      });
    }

    // Stripe webhook receiver.
    if (req.method === "POST" && url.pathname === "/stripe") {
      const body = await req.text();
      const sig = req.headers.get("stripe-signature") || "";
      const parts = Object.fromEntries(sig.split(",").map(p => p.split("=")));
      if (!parts.t || !parts.v1) return new Response("malformed signature", { status: 400 });
      // Reject replays older than 5 minutes.
      if (Math.abs(Date.now() / 1000 - Number(parts.t)) > 300)
        return new Response("stale timestamp", { status: 400 });
      const expected = await hmacHex(env.STRIPE_WEBHOOK_SECRET, `${parts.t}.${body}`);
      if (!timingSafeEqual(expected, parts.v1))
        return new Response("bad signature", { status: 400 });

      const event = JSON.parse(body);
      if (event.type === "checkout.session.completed") {
        const s = event.data.object;
        if (s.payment_status === "paid") {
          const bids = JSON.parse((await env.BOARD.get("bids")) || "[]");
          if (!bids.some(b => b.id === s.id)) {           // idempotent per session
            bids.push({
              id: s.id,
              ref: s.client_reference_id || "",           // "<name>_<amount>_<nonce>" from the page
              amount: (s.amount_total || 0) / 100,
              at: s.created,
            });
            await env.BOARD.put("bids", JSON.stringify(bids));
          }
        }
      }
      return new Response("ok");
    }

    return new Response("not found", { status: 404 });
  },
};
