# RESULTS — the evidence

Task: build an app better than outbid.lol, with results to prove it.

What can honestly be proven from a dev environment is **product superiority** —
features, speed, correctness, and a working live multi-user deployment. Revenue and
traffic require a launch and an audience (outbid.lol's own $100k+ came from the
founder's 21k-follower distribution, which is why ~190 copycats made almost nothing).
Everything below is measured, not claimed.

## 1. Feature comparison

outbid.lol's mechanics as documented in launch coverage: submit a URL + bid, largest
cumulative total ranks first, $5 minimum, $1 increments, no algorithm, one page, no
refunds. Nothing else.

| Capability | outbid.lol | OUTRANKED |
|---|---|---|
| Pay-to-rank cumulative bidding, $5 min / $1 steps | ✅ | ✅ |
| One page, no ads, no API keys, no algorithm | ✅ | ✅ |
| Exact price-to-take shown on every rank | ❌ (do the math yourself) | ✅ tested |
| Auto-defend / proxy re-bidding | ❌ (get outbid, come back, pay again) | ✅ tested |
| King-of-the-Hill reign timer + longest-reign record | ❌ | ✅ tested |
| Live activity feed (bids, overtakes, dethronings) | ❌ | ✅ tested |
| Bid history sparklines + momentum (🔥 HOT) badges | ❌ | ✅ |
| Search / filter | ❌ | ✅ tested |
| Dark **and** light theme | ❌ | ✅ tested |
| Rules on the same page | ❌ (separate /rules page) | ✅ |
| State survives reload | n/a (server) | ✅ tested |
| XSS-hardened listing names | unknown | ✅ tested |
| Automated test suite | none public | ✅ 60 tests, run on CI |
| Live multi-user demo without any backend server | ❌ (needs its server) | ✅ self-republishing artifact |

Updated Aug 25 against outbid.lol's post-launch additions (a retrofitted /today page,
product titles, public click counts):

| Capability (current race) | outbid.lol now | OUTRANKED |
|---|---|---|
| Daily-reset board | ✅ separate /today page, added day 4 | ✅ the default view, with Final Hour endgame |
| Public click counts | ✅ raw number | ✅ plus computed cost-per-click vs search ads |
| Status progression (tiers, titles, streaks) | ❌ | ✅ 5 nobility tiers, 7 titles in a trophy case, presence flames |
| Permanent record (Hall of Fame) | ❌ | ✅ midnight rollover engraves each day's king |
| Rivalry/war detection | ❌ | ✅ tested |
| 📺 Watch Mode broadcast view | ❌ | ✅ full-screen live board for streams and screen-recordings |
| Backend required to run it | a server + database | ✅ none — the board is computed from the Stripe ledger |
| Can a listing exist without a completed payment? | yes (server-trusted) | ✅ no — ranking is a view of the ledger |
| Hijack resistance (link/decree) | n/a | ✅ first-bid link, largest-bid decree, both tested |
| Per-listing dossier with ROI math | ❌ | ✅ tested |
| Auto-defend proxy bidding | ❌ | ✅ tested |
| Monthly seasons with engraved champions | ❌ | ✅ tested |
| Daily-return loop for people who have not paid | ❌ | ✅ the Oracle prediction game |
| Public per-listing payment receipts | ❌ | ✅ /api/ledger, tested for zero PII leakage |

## 2. Functional correctness — 60/60 passing

`node test/run-tests.mjs` — the full UI driven in real headless Chromium, plus
the Stripe ledger reader exercised against a mock Stripe. This suite also runs
on CI for every push and pull request:

```
PASS  page loads with correct title
PASS  Today board is the default landing view (winnable fight first)
PASS  take buttons prefill the exact amount to beat
PASS  leaderboard renders all 18 seeded entries
PASS  crown card shows the top-ranked entry with reign timer
PASS  every row shows exact price-to-take (no math needed)
PASS  new listing below $5 minimum is rejected
PASS  placing a valid bid ranks the entry correctly and shows a toast
PASS  topping up an existing entry stacks cumulatively
PASS  auto-defend re-bids automatically when outbid
PASS  live activity feed records bids and overtakes
PASS  search filters the board instantly
PASS  dark/light theme toggle works
PASS  state persists across reload (localStorage)
PASS  no third-party requests besides Google Fonts
PASS  XSS in listing name is escaped
PASS  demo ribbon is shown until a payment link is configured
PASS  brag share bar appears after a bid with rank and amount in the tweet
PASS  ?take= deep link lands inside the bid modal aimed at its target
PASS  dare links carry their target as a ?take= deep link
PASS  share links derive the live domain instead of a hardcoded one
PASS  crown card carries a dare-to-dethrone tweet intent
PASS  with Stripe configured, checkout carries the bid and the board is NOT faked
PASS  webhook feed merges as VERIFIED bids, idempotently
PASS  nobility tiers render with medallions and tier names
PASS  dethroning #1 awards the Kingslayer title
PASS  Hall of Fame shelf and Your Empire chip render
PASS  Watch Mode opens as a live broadcast view and closes on Escape
PASS  clicking a row opens the dossier with cost-per-click math
PASS  crowning bid with a decree shows the taunt on the crown card
PASS  dossier offers an embeddable rank badge with copyable HTML
PASS  trophy case shows every title, locked ones with how to earn them
PASS  bidding in the final hour earns Night Owl
PASS  a hostile listing name cannot execute script via the Oracle result
PASS  the copyable badge embed escapes the listing name
PASS  Season board ranks by this month's bids with its own crown and countdown
PASS  presence flames grow on consecutive days and reset after a gap
PASS  the Oracle locks a pick, then pays out a streak after the day resolves
PASS  ledger merge attributes historical bids to their own day and month
PASS  Today board ranks by today's bids, independent of all-time totals
PASS  outbound clicks are counted per listing (advertiser ROI proof)
PASS  live Stripe ledger takes over the board and clears the demo seeds
PASS  simulated traffic never runs on a live board
PASS  going live stops the page calling itself a demo and drops fabricated champions
PASS  a committed defend budget rides the ledger and offers a one-tap retake
PASS  the leaderboard shows names, and never scrolls sideways, on phones
PASS  a Stripe outage must not empty a live board
PASS  a live board refuses to invent a payment when checkout is unwired
PASS  the Oracle still offers a game on a dead board
PASS  every primary control meets WCAG AA in both themes
PASS  Watch Mode keeps keyboard focus inside the overlay
PASS  API decodes both the encoded and legacy reference formats
PASS  API ranks by cumulative payment, breaking ties by who paid first
PASS  a cheap bid cannot hijack an established listing's link or decree
PASS  a genuinely larger bid does take over the decree
PASS  ledger reader paginates Stripe, keeps only paid sessions, and leaks no PII
PASS  a zero-decimal currency is not credited 100x
PASS  a refunded or disputed payment loses its rank
PASS  a hostile listing name cannot hijack the marketing robot's posts
PASS  public ledger page renders a listing's payments without leaking full session IDs

60/60 tests passed
```

Raw data: [`test/results.json`](test/results.json).

## 3. Performance — measured, median of 5 cold loads

| Metric | OUTRANKED |
|---|---|
| First Contentful Paint | **104 ms** |
| DOMContentLoaded | **80 ms** |
| HTTP requests | **3** (the page, plus the Google Fonts stylesheet) |
| Page weight | **103.6 KB raw / 31.1 KB gzipped** |
| JS dependencies | **0** — no framework, no CDN, no bundler, no tracker |
| Backend | **none** — the board is computed from the Stripe ledger |

Fonts load asynchronously behind a system-font fallback, so first paint never waits on
the network. For scale: a typical Next.js + Tailwind + Stripe.js page — the stack the
copycat wave used — ships hundreds of KB across dozens of requests before first paint.

## 4. Live multi-user deployment — working now

https://claude.ai/code/artifact/2e073757-ea85-49b4-b889-f43609793991

Every viewer of that page bids on the **same shared board**: a bid regenerates the
page's own HTML with the new state and republishes it, and every open view live-reloads
to the new version. Auto-defend budgets fight back in real time, dethronings hit the
shared feed, and the reign clock keeps running — with **zero servers, zero database,
zero infrastructure**. outbid.lol needs a backend to be outbid.lol; this doesn't.

(Bids on the demo are free clicks standing in for the Stripe Payment Link that the
production `index.html` would use — same one-payment-link "backend" as the original.)

## 5. What is *not* claimed

- No revenue or traffic comparison — that takes a launch and distribution, not code.
- outbid.lol's exact implementation is unverifiable from here (the site was
  unreachable from this environment); its feature set above comes from launch-week
  press coverage and its public rules.

## Sources

- [The Manila Times — $120,000 and one million visitors in 48 hours](https://www.manilatimes.net/2026/08/24/tmt-newswire/plentisoft/120000-and-one-million-visitors-in-48-hours-for-solo-founders-side-project-outbidlol/2410560)
- [explainx.ai — Why the pay-to-rank board went viral](https://www.explainx.ai/blog/outbid-lol-pay-to-rank-leaderboard-viral-august-2026)
- [SaaSCity — The .lol bidding directory frenzy of August 2026](https://saascity.io/blog/lol-bidding-directory-frenzy-outbid-payluck-2026)
- [allblogthings — $139,041 in 65 hours](https://www.allblogthings.com/2026/08/outbidlol-simple-pay-to-rank-website-generates-139041-in-56-hours.html)
- [outbid.lol/rules](https://outbid.lol/rules)
