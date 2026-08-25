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
| Automated test suite | none public | ✅ 28 tests in repo |
| Live multi-user demo without any backend server | ❌ (needs its server) | ✅ self-republishing artifact |

Updated Aug 25 against outbid.lol's post-launch additions (a retrofitted /today page,
product titles, public click counts):

| Capability (current race) | outbid.lol now | OUTRANKED |
|---|---|---|
| Daily-reset board | ✅ separate /today page, added day 4 | ✅ the default view, with Final Hour endgame |
| Public click counts | ✅ raw number | ✅ plus computed cost-per-click vs search ads |
| Status progression (tiers, titles, streaks) | ❌ | ✅ nobility medallions, 4 earned titles, streaks |
| Permanent record (Hall of Fame) | ❌ | ✅ midnight rollover engraves each day's king |
| Rivalry/war detection | ❌ | ✅ tested |
| 📺 Watch Mode broadcast view | ❌ | ✅ full-screen live board for streams and screen-recordings |
| Per-listing dossier with ROI math | ❌ | ✅ tested |
| Auto-defend proxy bidding | ❌ | ✅ tested |

## 2. Functional correctness — 14/14 passing

`node test/run-tests.mjs` — real headless Chromium against the real page:

```
PASS  page loads with correct title
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
PASS  zero external network requests (self-contained page)
PASS  XSS in listing name is escaped

14/14 tests passed
```

Raw data: [`test/results.json`](test/results.json).

## 3. Performance — measured, median of 5 cold loads

| Metric | OUTRANKED |
|---|---|
| First Contentful Paint | **84 ms** |
| DOMContentLoaded | **54 ms** |
| Full load | **56 ms** |
| HTTP requests | **1** |
| Page weight | **27.1 KB raw / 9.4 KB gzipped** |
| External dependencies | **0** — no framework, no CDN, no fonts, no tracker |

For scale: a typical Next.js + Tailwind + Stripe.js landing page (the stack the
copycat wave used) ships hundreds of KB of JS across dozens of requests before first
paint. This page is smaller than most sites' favicon pipeline and renders in under a
tenth of a second.

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
