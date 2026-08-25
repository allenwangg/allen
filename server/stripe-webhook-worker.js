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

    // Live rank badge — embeddable proof of rank, and a backlink from every
    // bidder's own site: <img src="https://<worker>/badge?name=Acme">
    if (req.method === "GET" && url.pathname === "/badge") {
      const name = (url.searchParams.get("name") || "").slice(0, 30);
      const bids = JSON.parse((await env.BOARD.get("bids")) || "[]");
      const totals = {};
      for (const b of bids) {
        const n = String(b.ref || "").split("_")[0] || "Anonymous";
        totals[n] = (totals[n] || 0) + (+b.amount || 0);
      }
      const ranked = Object.entries(totals).sort((a, b) => b[1] - a[1]);
      const idx = ranked.findIndex(([n]) => n.toLowerCase() === name.toLowerCase());
      const rank = idx === -1 ? "—" : "#" + (idx + 1);
      const total = idx === -1 ? "$0" : "$" + ranked[idx][1].toLocaleString("en-US");
      const escXml = s => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
      const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" width="210" height="36" role="img" aria-label="OUTRANKED rank badge">` +
        `<rect width="210" height="36" rx="6" fill="#0e120f" stroke="#d9a944"/>` +
        `<text x="12" y="23" font-family="Georgia,serif" font-weight="900" font-size="13" fill="#ecefe6">OUT<tspan fill="#d9a944">RANKED</tspan></text>` +
        `<text x="112" y="23" font-family="monospace" font-size="13" fill="#d9a944" font-weight="700">${escXml(rank)}</text>` +
        `<text x="198" y="23" text-anchor="end" font-family="monospace" font-size="13" fill="#63c08e" font-weight="700">${escXml(total)}</text></svg>`;
      return new Response(svg, {
        headers: {
          "content-type": "image/svg+xml",
          "access-control-allow-origin": "*",
          "cache-control": "public, max-age=300",
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
