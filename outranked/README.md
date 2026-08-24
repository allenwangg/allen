# OUTRANKED

**Pay more. Rank higher. Stay on top.**

A pay-to-rank leaderboard in the spirit of outbid.lol — one page, no ads, no API keys,
no algorithm, your rank is exactly what you paid — but with the mechanics that make
people come back and pay again:

| Mechanic | What it does |
|---|---|
| **The Today board** | The flagship board resets at midnight UTC, so there's a winnable bid war every day at every budget. outbid.lol had to retrofit this (/today) after its all-time board froze at a five-figure #1 — OUTRANKED launches with it. |
| **Public click counts** | Every listing shows the outbound clicks it received — the ROI proof that turns bids from ego spend into defensible ad spend. |
| **Price-to-take buttons** | Every row shows the exact dollar amount to take that rank. No math, no friction between impulse and payment. |
| **Auto-defend budgets** | Set a defense budget; the board re-bids +$1 for you the moment you're outbid. Proxy bidding captures revenue while you sleep. |
| **King-of-the-Hill reign timer** | #1 wears the crown and the clock runs. The longest reign is recorded forever — a second competition (time) layered on the first (money). |
| **Live drama feed** | Every bid, overtake, and dethroning streams across the ticker. The drama is the distribution. |
| **Bid sparklines & 🔥 HOT badges** | Momentum is visible, which invites counter-bids. |
| **Search, dark/light theme, mobile-first** | Table stakes the original never shipped. |

## Files

- `index.html` — the entire product. Self-contained: zero external requests, zero
  dependencies, zero build step. Runs from a file:// URL. Ships with demo mode
  (simulated market activity + localStorage persistence). In production the
  **Pay & rank** button submits to a Stripe Payment Link — that's the whole backend.
  Append `?nosim` to the URL to disable the demo market simulation.
- `test/run-tests.mjs` — 14 functional tests + performance benchmark, run against the
  real page in headless Chromium (Playwright). Writes `test/results.json`.

## Live multi-user demo

A live version where **every viewer bids on the same shared board** (the page
republishes itself with the new state on every bid) is deployed as a Claude artifact:

https://claude.ai/code/artifact/2e073757-ea85-49b4-b889-f43609793991

## Turning the money on

See [MONEY.md](MONEY.md) — Stripe account + bank link (the one step only the operator
can do), then paste the Payment Link into `CONFIG` in `index.html`. Optional
auto-verification via `server/stripe-webhook-worker.js`.

## Launching it

See [MARKETING.md](MARKETING.md) — the full launch playbook reverse-engineered from
outbid.lol's actual viral run, with ready-to-post copy for X, Reddit, HN, PH, video,
and press. `outbid-lol-alternative.html` is the SEO intercept page for "outbid.lol
alternative" queries.

## Running the tests

```
node test/run-tests.mjs
```

## Measured results

See [RESULTS.md](RESULTS.md) for the full evidence: 14/14 tests passing, ~84 ms first
contentful paint, 9.4 KB gzipped, 1 HTTP request, and the feature-by-feature comparison
against outbid.lol.
