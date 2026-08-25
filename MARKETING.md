# MARKETING.md — the OUTRANKED launch playbook

Built from a research pass over outbid.lol's actual launch (Aug 19–24, 2026): the
founder's own posts, hour-by-hour traffic reconstruction, the copycat post-mortems,
and 2026 channel mechanics. Sources at the bottom. Numbers about outbid.lol are
founder-reported and unverified — treat them as narrative, not accounting.

## What actually made outbid.lol viral (the engine, not the vibes)

1. **5-second comprehension.** A screenshot of the board needs no explanation. Every
   screenshot is a complete ad.
2. **Public money = spectacle.** Founders making increasingly expensive decisions in
   public. Every outbid is drama; drama is shareable; shares bring bidders.
3. **Founder-as-broadcaster on X.** One punchy launch post to 21k followers, then
   *camping the thread* — replying to everything, quote-posting every bid war,
   turning even crises (analytics crash, payment-provider kick-off) into content.
4. **Concrete-number ritual posts.** The 24h recap ("200k+ visitors · $21,499 ·
   broke my analytics provider · got offered $100k to sell · 3 copycats already")
   was its own viral artifact. Then daily "Good morning friends! The madness doesn't
   stop" stat dashboards.
5. **The $100k turndown story.** A publicly declined acquisition offer became a
   story beat every blogger repeated.
6. **ROI proof for bidders.** Public click counts (~$1.29/click near the top,
   13k+ clicks for #1) made bids defensible as ad spend, not just ego. Bidders got
   real traffic → bids became self-justifying → more bids.

**Why 190+ copycats made ~nothing:** they cloned the mechanic, not the distribution.
An empty board is "a dead page with a payment button." The moat is *everyone is
already looking at the same board*.

**How OUTRANKED out-mechanics the original** (already built): exact price-to-take
buttons · auto-defend budgets (the original's bidders had to come back manually) ·
the **Today board with daily reset** — outbid.lol's all-time board froze for hours
once #1 hit five figures, and the founder had to retrofit `/today`; we launch with
it — · public click counts · reign timers · share intents on every win.

---

## T-48h checklist (before any post)

- [ ] Stripe activated, bank linked, Payment Link pasted into `CONFIG` (see MONEY.md).
      **Describe the product to Stripe as "leaderboard placement — digital advertising
      service."** outbid.lol got kicked off its first payment provider (Polar) mid-viral
      for AUP mismatch; wording and a backup processor (Lemon Squeezy/Paddle) matter.
- [ ] Site live on the public URL; OG card renders in the X card validator.
- [ ] X account has Premium (non-Premium link posts lose 30–80% reach in 2026).
- [ ] Line up 10–15 friendly founders/mutuals for opening bids in hour one — the
      board must have drama on day one; clones died with empty boards. **These must
      be real, disclosed-if-asked, actually-paid bids** — staged/undisclosed seeding
      is an FTC problem and a reputational time bomb in exactly the community you're
      courting.
- [ ] Pre-write the first 10 posts (below) so launch hour is all engagement, no writing.

## Launch hour (X) — the only channel that mattered

**The launch post** (single post, punchy, NO link in the body — link goes in the
first reply; algorithm suppresses body links):

> Aaaaaand we're live.
>
> OUTRANKED: a leaderboard where your rank is exactly what you paid for it.
>
> No ads. No API keys. No algorithm. No mercy.
>
> Pay more → rank higher. Get outbid → pay again.
> The #1 spot resets every midnight, so today's crown is always for sale.
>
> Link below 👇

**First reply (the link post):**
> Take the board: https://outranked.vercel.app/
> $5 claims a spot. #1 on the Today board costs whatever today's king paid, plus a dollar.

**Then camp the thread for 48 hours.** Author replies carry outsized algorithmic
weight (~150× a like); first-30-minute velocity decides distribution. Reply to every
comment, quote-post every overtake, thank every bidder by name with their click count.

## The ritual posts (pre-written templates)

**24-hour recap** (fill blanks, keep the absurd texture — it's the hook):
> Okay let me summarize the past 24 hours 🤯
> – launched at {time} yesterday
> – {visitors} visitors
> – ${revenue} in bids
> – today's crown changed hands {n} times
> – someone set a ${x} auto-defend budget and it fought off {y} attacks while they slept
> – {n} copycats already

**Morning ritual (daily):**
> Good morning friends. The board never sleeps:
> 👀 {visitors} visitors
> 👑 all-time #1: {name} at ${amount}
> 🔥 today's king: {name} at ${amount} — resets in {h}h
> 🔗 {clicks} outbound clicks delivered to bidders
> 💰 ${revenue} total

**Drama QTs (post within minutes of the event):**
> {A} just spent ${x} to dethrone {B} after a {t}-hour reign. {B}'s auto-defend
> budget ran dry at ${y}. The crown is cursed and I love it.

**The offer story (if/when someone offers to buy it — answer publicly):**
> Got offered ${x} for OUTRANKED today. The board made ${y} while I read the DM.
> Declined. The crown is not for sale. The #1 spot, however, is ${z} right now.

## Reddit (post the *story*, not the launch)

- **r/SideProject** — Wednesday or weekend morning 9am–12pm ET. Title: *"I built a
  pay-to-rank leaderboard where #1 resets every midnight — here's what the first 48
  hours of bids looked like"*. Body: what/why/how-built/numbers/feedback ask. Real
  product link (no gates). No bare links.
- **r/EntrepreneurRideAlong** — value-first breakdown: *"Ride along: cloning the
  outbid.lol playbook with a daily-reset twist — day 3 numbers inside"*.
- **r/InternetIsBeautiful** — do NOT founder-post (bans business tools, enforces
  90/10). Only viable if a third party submits it organically.

## Hacker News (lottery ticket, not a pillar)

Both outbid.lol threads were flagged/removed — pay-to-rank is flag-bait. If you try:
Tue–Thu 8–11am ET, title *"Show HN: A leaderboard ranked only by dollars paid, with
a daily reset"*, immediate first comment with the backstory and the mechanic-flaw
fix (frozen boards → daily reset). Zero marketing language. Expect flags; shrug.

## Product Hunt (backlinks + social proof only)

12:01am PT Tue–Thu. Tagline: *"The leaderboard where money is the only algorithm."*
First 6 hours decide ranking; be in comments all day; no upvote-begging (penalized).

## Short-form video (the untapped channel — outbid never used it)

Faceless screen-record + voiceover over the live board. Hook with the dollar figure
in the first 2 seconds:
1. *"Strangers are burning $14,000 to be #1 on this website"* → scroll the board,
   zoom the reign timer, end on the Today board countdown.
2. *"This site's #1 spot resets every midnight — and grown adults are fighting for
   it"* → serialize as daily episodes (bid-war drama is naturally episodic).
3. Million Dollar Homepage nostalgia framing: *"In 2005 it was pixels. In 2026 it's
   pure rank."*

## Press (day 3–5, after there are numbers)

Newswire press release (Newsfile/Plentisoft route — that's literally what outbid.lol
did; the Manila Times / Globe and Mail coverage was a paid release) with headline
numbers + the daily-reset angle. Pitch the indie-hacker newsletters that covered
outbid unprompted (Generative AI Pub etc.) — press follows traction, so send it the
same hour as a milestone post.

## Parasite SEO (the topple.lol play)

`outbid-lol-alternative.html` ships in this repo — it targets "outbid.lol
alternative / price / how it works" queries and funnels that search demand here.
Add more as queries emerge ("outbid.lol today board", "outbid.lol clone list").

## Cadence calendar

| Day | Beat |
|---|---|
| 0 | Launch post + link reply + 48h thread camping; seed bids land in hour 1 |
| 1 | 24h recap listicle; ship + announce one visible user-requested feature |
| 2 | Morning ritual; drama QTs; r/SideProject story post |
| 3 | Morning ritual; press release out; newsletter pitches; first TikTok |
| 4 | Morning ritual; r/EntrepreneurRideAlong breakdown; Show HN attempt |
| 5+ | Daily ritual + drama QTs; PH launch the following Tue–Thu; TikTok episodes |

## Honest constraints

- outbid.lol's spark was a 21k-follower X account plus big-account amplification.
  Distribution starts from *your* actual reach — the mechanics above maximize
  whatever that is; they don't conjure an audience from zero. The Today board is
  the wedge: "you don't have to beat a $14k all-time king to get seen today."
- The window: you're launching after the trend's peak week. The counter-positioning
  IS the pitch: "the board where you don't need $14k to be seen."
- All revenue/traffic numbers about outbid.lol are founder-reported; several
  conflict (…$120k/48h vs $93k/2d vs $139k/65h). Use them as story, never as claims
  you make about your own product.

## Sources

- explainx.ai — outbid.lol viral analysis · automatio.ai — inside outbid.lol ·
  saascity.io — the .lol frenzy · bestaiso.com — review with bid-war details
- Founder posts: launch (x.com/jonathan_wilke/status/2090184058810544467), 24h recap
  (…/2090548427616555154), morning stats (…/2091084486838464564), /today launch
  (…/2091564621404491892), Polar crisis (…/2091142379524739305)
- Newsfile press release (syndicated: Manila Times, Globe and Mail) · Generative AI
  Pub coverage · topple.lol parasite-SEO pages + click-ROI tracker · outbid-directory.lol
  clone census · Chad Etzel mechanic critique (x.com/jazzychad/status/2090624392346665254)
- Channel mechanics: Teract X-algorithm 2026 · Syften HN guide · InnMind PH 2026
  playbook · Redship/MediaFast/WillItStay subreddit rule guides · Virlo TikTok
  trends Aug 2026
