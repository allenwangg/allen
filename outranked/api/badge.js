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
    `<rect x="1" y="1" width="208" height="34" rx="10" fill="#FFFFFF" stroke="#F5A524" stroke-width="2"/>` +
    `<text x="12" y="23" font-family="system-ui,sans-serif" font-weight="800" font-size="13" fill="#171A1F">OUT<tspan fill="#F5A524">RANKED</tspan></text>` +
    `<text x="112" y="23" font-family="monospace" font-size="13" fill="#F5A524" font-weight="700">${escXml(rankLabel)}</text>` +
    `<text x="198" y="23" text-anchor="end" font-family="monospace" font-size="13" fill="#0E9F5B" font-weight="700">${escXml(totalLabel)}</text>` +
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
