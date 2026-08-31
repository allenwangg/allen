// GET /api/ledger?name=Acme — a listing's public receipt.
//
// Every listing on the board is a set of completed Stripe payments; this page
// prints that set. It is the product's trust mechanism made visible — a bidder
// can hand this URL to anyone who asks "is that rank real?", and the operator
// answers chargeback disputes with it. Renders on-brand HTML.

const { fetchBids, decodeRef, rank } = require("./_board.js");

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const usd = (n) => "$" + Math.round(n).toLocaleString("en-US");
const day = (t) => new Date(t * 1000).toISOString().slice(0, 10);

function page(title, body) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="robots" content="noindex">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;700;800&family=Spline+Sans+Mono:wght@500;700&display=swap">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>👑</text></svg>">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{min-height:100vh;background:#FBF8F2;color:#171A1F;font-family:"Plus Jakarta Sans",system-ui,sans-serif;padding:40px 18px}
.wrap{max-width:640px;margin:0 auto}
.card{background:#fff;border:2px solid #E8E2D6;border-radius:20px;box-shadow:0 4px 0 #E8E2D6;padding:26px 28px}
.kick{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#C8811A;font-weight:800}
h1{font-size:30px;font-weight:800;letter-spacing:-.03em;margin-top:4px}
.sum{display:flex;gap:10px;flex-wrap:wrap;margin:14px 0 6px}
.chip{background:#F4F0E7;border:1.5px solid #E8E2D6;border-radius:12px;padding:8px 14px;font-size:13px;font-weight:700;color:#6C7079}
.chip b{color:#171A1F;font-family:"Spline Sans Mono",monospace}
table{width:100%;border-collapse:collapse;margin-top:16px;font-size:14px}
th{text-align:left;padding:9px 10px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#9AA0AA;border-bottom:2px solid #E8E2D6}
td{padding:10px;border-bottom:1px solid #F0EBDF;color:#6C7079;font-weight:600}
td.amt{text-align:right;font-family:"Spline Sans Mono",monospace;font-weight:700;color:#0A7B45}
td.id{font-family:"Spline Sans Mono",monospace;font-size:12px;color:#9AA0AA}
.note{font-size:12.5px;color:#9AA0AA;font-weight:600;margin-top:16px;line-height:1.5}
a.back{display:inline-block;margin-top:18px;background:#0E9F5B;color:#fff;font-weight:800;padding:11px 20px;border-radius:13px;text-decoration:none;box-shadow:0 4px 0 #0A7B45}
a.back:active{transform:translateY(3px);box-shadow:0 1px 0 #0A7B45}
</style></head><body><div class="wrap">${body}</div></body></html>`;
}

module.exports = async (req, res) => {
  const name = String((req.query && req.query.name) || "").slice(0, 30);
  const key = process.env.STRIPE_SECRET_KEY;
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.setHeader("cache-control", "public, s-maxage=60, stale-while-revalidate=300");

  if (!key || !name) {
    return res.status(200).send(page("OUTRANKED ledger", `<div class="card">
      <div class="kick">Public ledger</div><h1>${name ? "Ledger not available" : "No listing named"}</h1>
      <p class="note">${key ? "Add ?name=<listing> to look one up." : "This board is running in demo mode — there are no real payments to show yet."}</p>
      <a class="back" href="/">Back to the board</a></div>`));
  }

  try {
    const bids = await fetchBids(key);
    const mine = bids.filter((b) => decodeRef(b.ref).name.toLowerCase() === name.toLowerCase());
    if (!mine.length) {
      return res.status(200).send(page(`${name} · OUTRANKED ledger`, `<div class="card">
        <div class="kick">Public ledger</div><h1>${esc(name)}</h1>
        <p class="note">No completed payments found under this name. On this board, no payment means no listing — that's the whole system.</p>
        <a class="back" href="/">Back to the board</a></div>`));
    }
    const board = rank(bids);
    const pos = board.findIndex((e) => e.name.toLowerCase() === name.toLowerCase()) + 1;
    const total = mine.reduce((s, b) => s + b.amount, 0);
    const rows = mine.slice().reverse().map((b) =>
      `<tr><td>${day(b.at)}</td><td class="id">${esc(b.id.slice(0, 12))}…</td><td class="amt">${usd(b.amount)}</td></tr>`).join("");
    return res.status(200).send(page(`${name} · OUTRANKED ledger`, `<div class="card">
      <div class="kick">Public ledger — every payment behind this listing</div>
      <h1>${esc(decodeRef(mine[mine.length - 1].ref).name)}</h1>
      <div class="sum">
        <span class="chip">Rank <b>#${pos}</b> of ${board.length}</span>
        <span class="chip">Total <b>${usd(total)}</b></span>
        <span class="chip">Payments <b>${mine.length}</b></span>
      </div>
      <table><tr><th>Date (UTC)</th><th>Stripe session</th><th style="text-align:right">Amount</th></tr>${rows}</table>
      <p class="note">Each row is a completed Stripe Checkout payment. The leaderboard is computed from
      these records — there is no other way onto it. Each reference is a one-way digest
      of the payment, stable enough to check a row against but carrying nothing back:
      the payment records themselves live in Stripe's systems, not ours.</p>
      <a class="back" href="/">Back to the board</a></div>`));
  } catch {
    res.setHeader("cache-control", "no-store");
    return res.status(200).send(page("OUTRANKED ledger", `<div class="card">
      <div class="kick">Public ledger</div><h1>Ledger briefly unavailable</h1>
      <p class="note">Stripe didn't answer in time — refresh in a few seconds.</p>
      <a class="back" href="/">Back to the board</a></div>`));
  }
};
