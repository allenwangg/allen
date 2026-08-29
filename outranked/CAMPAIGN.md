# CAMPAIGN.md — The Midnight Wave

The X campaign. Full designed version with copy-paste buttons:
https://claude.ai/code/artifact/1298f189-ddb5-44dd-980c-da160c7fb4cc

## The bet

Coverage of outbid.lol noted that **"each argument sent more people back to the board."**
The debate *was* the distribution. So this campaign doesn't dodge the criticism — it picks
the fight and settles it with receipts the product already publishes.

Three things make it work:

- **A nightly event.** Every midnight UTC a king dies and the crown falls to $5. That's 365
  launch moments a year, not one.
- **A real argument.** "Smart ad buy or expensive status game?" is the live debate in this
  category. The board publishes cost-per-click either way.
- **A credible referee.** Every listing is a completed Stripe payment; there is no admin
  button that adds one. No competitor can make that claim without rebuilding their backend.

## Five pillars

Every post serves one. If a draft doesn't, it doesn't ship.

1. **The Wall** — the enemy is a *mechanic, never a person*. Uncapped boards freeze;
   outbid.lol froze at $14,013. Attack the math, credit the founder.
2. **The Coronation** — midnight makes a new king. Name them, tag them. Your users become
   your broadcasters because the story is about them.
3. **The Receipts** — publish cost-per-click against search-ad benchmarks, *including when
   it looks bad*. The only honest answer to "money bonfire."
4. **The House Rules** — bind yourself publicly: the operator never bids. Constraints are
   content.
5. **The Ledger** — build in public with numbers that come from Stripe, not vibes. One
   inflated number costs the whole campaign.

## The press kit (`press/`)

Rendered, on-brand 1200×675 images so the key posts never go out as bare text:

- **`wall.png`** — the thesis chart: uncapped board (staircase to $14,013, then a dead
  plateau) vs daily reset (a living sawtooth). Attach to tweet 1 of the Wave 0 thread.
  Colour pair validated for colour-vision deficiency; identity is also carried by
  panel, shape, and direct labels, never colour alone.
- **`house-rules.png`** — the day-one accountability card, designed to *be* the screenshot.
- **`coronation.html`** — fill `{NAME}` / `{AMOUNT}` / `{RUNNER_UP}` / `{DIFF}` / `{DATE}`,
  then `node press/render.mjs coronation` for that night's card.
- **`render.mjs`** — re-renders any template to PNG.

## The robot now runs the engine

Three rituals fire automatically from GitHub Actions, every day, $0 — with numbers
read live from the Stripe ledger, and silence instead of invented milestones:

| UTC | Post |
|---|---|
| 00:05 | 👑 **Coronation** — names the crowned king *and how close the runner-up came* |
| 14:00 | 💰 **Morning ritual** — revenue, listings, both kings, price to take the crown |
| 23:00 | ⏳ **Final Hour** — the snipe deadline (or "the crown is sitting there for $5" on a quiet day) |

Preview any of them from the repo's Actions tab (Run workflow → mode + dry run), or
locally: `DRY_RUN=1 MODE=final node scripts/daily-post.mjs`.

## The waves

| Wave | When | Job |
|---|---|---|
| **0 · Earn the right** | T-4 → T-1 | Post the mechanic thesis with no product and no link. Be a known voice before you sell. |
| **1 · Launch night** | Day 0, Tue–Thu am | Punchy post, link in the first reply, House Rules within the hour, 10–15 real seeded bids in 30 min. |
| **2 · The coronation** | Nightly | The robot posts the reset and stats; you supply names and drama. Final Hour alert at 23:00 UTC. |
| **3 · Pick the fight** | Day 2–5 | Receipts post, ask the ROI question outright, engage critics head-on. |
| **4 · Keep it alive** | Week 2+ | Weekly hall of fame, records, ship-and-announce, the offer story. |

All post copy lives in the artifact above, with copy buttons.

## The objection playbook

Eight objections you *will* receive, each with a prepared answer, in the artifact. The
important ones:

- **"Money bonfire?"** → answer with a specific listing's real CPC, even an unflattering one.
- **"Just a clone?"** → concede the lineage instantly, then the reset mechanic.
- **"Are the bids real?"** → there's no database; the board is computed from Stripe payments.
- **"Did you seed it?"** → yes, friends, with their own money, said publicly on day one.
- **Silence** → a distribution problem, not a product one. Go reply where the argument
  already is, without a link.

## Rules of engagement

- Never inflate a number — every figure comes from the ledger.
- Never bid on your own board, under any name.
- Never buy followers, upvotes, or engagement.
- Never punch at outbid.lol's founder. Attack the mechanic, credit the man.
- Never let a good-faith critic go unanswered. The reply is the content.
- Never post the same format twice in a day.

## Sources

Campaign built on the research in [MARKETING.md](MARKETING.md), plus:
[explainx.ai](https://www.explainx.ai/blog/outbid-lol-pay-to-rank-leaderboard-viral-august-2026) ·
[automatio.ai](https://automatio.ai/articles/dev-tools/inside-outbid-lol-the-pay-to-rank-board-taking-over-tech) ·
[Founder Best newsletter](https://newsletter.founder.best/newsletter/outbid-auctions-outbid-lol-founder-guide-2026) ·
[SaaSCity](https://saascity.io/blog/lol-bidding-directory-frenzy-outbid-payluck-2026)
