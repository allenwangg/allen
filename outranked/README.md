# OUTRANKED

**Pay more. Rank higher. Stay on top.**

A pay-to-rank leaderboard in the spirit of outbid.lol — one page, no ads, no API keys,
no algorithm, your rank is exactly what you paid — with the mechanics that make people
come back and pay again, and a backend that consists of one environment variable.

## The architecture: the board *is* the Stripe ledger

There is no database. `/api/board` reads your completed Stripe payments and rebuilds
the rankings from them on every request.

- **One environment variable is the whole backend** (`STRIPE_SECRET_KEY`). No KV, no
  Postgres, no webhook plumbing.
- **A listing cannot exist without a completed payment behind it.** Ranking is a view
  of the ledger, so an unpaid entry isn't "unverified" — it's impossible.
- **Nothing to lose.** Redeploy anywhere and the board rebuilds itself from Stripe.

Without a key set, the site runs a clearly-labeled demo board. The moment the key
exists, it wipes the demo data and shows only real listings. See [MONEY.md](MONEY.md).

## What it does that the category doesn't

| Mechanic | What it does |
|---|---|
| **The Today board** | The default view resets at midnight UTC, so there's a winnable bid war every day at every budget. outbid.lol retrofitted this only after its all-time board froze at a five-figure #1. |
| **King's Decree** | A crowning bid can attach a public taunt to the crown. Decrees die with the reign. |
| **Nobility tiers** | Lifetime spend buys a permanent medallion: Baron → Viscount → Duke → Archduke → Sovereign. |
| **Earned titles** | ⚔️ Kingslayer, 🐋 Whale, 🩸 First Blood, 🛡 Defender — status money alone can't buy. |
| **Hall of Fame** | Midnight engraves each day's king forever, with win streaks. |
| **Auto-defend** | Set a budget; the board re-bids for you the moment you're outbid. |
| **📺 Watch Mode** | A full-screen broadcast view built for streams and screen-recorded video. |
| **Listing dossiers** | Per-listing stats with cost-per-click computed against search-ad benchmarks. |
| **Rank badges** | Embeddable live badges — every bidder becomes a backlink. |
| **Rivalries, Final Hour, brag cards, price-to-take buttons, click counts** | See [RESULTS.md](RESULTS.md). |

## Trust mechanics

Listings are keyed by name and nobody logs in, so anyone can pay *into* anyone's
listing. Two rules make that harmless: a listing's **link is claimed by its first
bid** (no later bid can repoint it), and its **decree belongs to its largest single
bid** (no cheap words in an expensive mouth). Attacking a listing just funds it.

## Files

- `index.html` — the entire product. One request, ~22 KB gzipped, no framework, no
  build step. `?nosim` disables the demo market simulation.
- `api/board.js` — the leaderboard, computed from Stripe. `api/badge.js` — live rank
  badges. `api/_board.js` — shared ledger reader (returns no customer PII, ever).
- `scripts/daily-post.mjs` — the $0 marketing robot. `DRY_RUN=1 MODE=reset|ritual`
  previews a post without sending it.
- `test/run-tests.mjs` — 37 tests: the full UI in headless Chromium, plus the ledger
  reader against a mock Stripe. Also benchmarks load performance.
- `live/index.html` — a self-republishing variant used for the shared-board demo.

## Running the tests

```
node test/run-tests.mjs
```

## Docs

- **[LAUNCH.md](LAUNCH.md)** — the $0 launch manual, one click to deploy.
- **[MONEY.md](MONEY.md)** — Stripe setup, the ledger architecture, payout timing.
- **[MARKETING.md](MARKETING.md)** — the launch playbook, researched from outbid.lol's
  actual viral run, with ready-to-post copy.
- **[RESULTS.md](RESULTS.md)** — measured evidence and the feature comparison.
