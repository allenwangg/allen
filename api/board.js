// GET /api/board — the live leaderboard, computed from completed Stripe payments.
//
// Response: { configured, bids: [{ id, ref, amount, at }] }
//   configured:false  → no STRIPE_SECRET_KEY set; the page runs in demo mode
//   configured:true   → live mode; these bids are the board's entire truth
//
// Cached at Vercel's edge for 15s so a viral spike hits Stripe a few times a
// minute rather than a few thousand.

const { fetchBids } = require("./_board.js");

module.exports = async (req, res) => {
  res.setHeader("access-control-allow-origin", "*");

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    res.setHeader("cache-control", "public, s-maxage=60");
    return res.status(200).json({ configured: false, bids: [] });
  }

  try {
    const bids = await fetchBids(key);
    res.setHeader("cache-control", "public, s-maxage=15, stale-while-revalidate=120");
    return res.status(200).json({ configured: true, bids });
  } catch (err) {
    // Never break the board on a Stripe hiccup: the page keeps the bids it has.
    res.setHeader("cache-control", "no-store");
    return res.status(200).json({ configured: true, error: "stripe_unavailable", bids: [] });
  }
};
