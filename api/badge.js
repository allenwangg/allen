// GET /api/badge?name=Acme — a live rank badge, served as SVG.
//
// Bidders embed this on their own site:
//   <a href="https://outranked.vercel.app/"><img src="https://outranked.vercel.app/api/badge?name=Acme" height="36"></a>
// It updates itself as their rank changes, and every embed is a backlink.

const { fetchBids, rank } = require("./_board.js");

const escXml = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function svg(rankLabel, totalLabel) {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="210" height="36" role="img" aria-label="OUTRANKED rank badge">` +
    `<rect width="210" height="36" rx="6" fill="#0e120f" stroke="#d9a944"/>` +
    `<text x="12" y="23" font-family="Georgia,serif" font-weight="900" font-size="13" fill="#ecefe6">OUT<tspan fill="#d9a944">RANKED</tspan></text>` +
    `<text x="112" y="23" font-family="monospace" font-size="13" fill="#d9a944" font-weight="700">${escXml(rankLabel)}</text>` +
    `<text x="198" y="23" text-anchor="end" font-family="monospace" font-size="13" fill="#63c08e" font-weight="700">${escXml(totalLabel)}</text>` +
    `</svg>`
  );
}

module.exports = async (req, res) => {
  const name = String((req.query && req.query.name) || "").slice(0, 30);
  const key = process.env.STRIPE_SECRET_KEY;

  let rankLabel = "—";
  let totalLabel = "$0";

  if (key && name) {
    try {
      const board = rank(await fetchBids(key));
      const idx = board.findIndex((e) => e.name.toLowerCase() === name.toLowerCase());
      if (idx !== -1) {
        rankLabel = `#${idx + 1}`;
        totalLabel = `$${board[idx].total.toLocaleString("en-US")}`;
      }
    } catch {
      /* fall through to the empty badge rather than serving an error image */
    }
  }

  res.setHeader("content-type", "image/svg+xml; charset=utf-8");
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("cache-control", "public, s-maxage=300, stale-while-revalidate=600");
  return res.status(200).send(svg(rankLabel, totalLabel));
};
