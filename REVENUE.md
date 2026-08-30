# How this actually makes money

Written plainly, because the request was "make me the most money" and the most
expensive thing I could do is tell you what you want to hear.

## The honest starting position

**As it stands, this app earns $0.** It is a free, serverless, client-side tool. That
is a deliberate product decision — it is why it costs nothing to run, needs no signup,
and works with no signal on a job site — but free tools do not generate revenue on
their own. Revenue requires a mechanism, and a mechanism requires a decision from you.

What you have is not revenue. It is the two things that are genuinely hard to buy:

1. **A working product** that solves an expensive, specific, recurring problem for a
   customer segment with real money.
2. **A wedge** — a single sharp claim ("a 20% markup is a 16.7% margin") that is true,
   verifiable in ten seconds, and uncomfortable enough to be remembered.
3. **A second leak the tool now closes** — unsigned change orders. Mispricing loses money
   at the moment of the bid; unsigned changes lose it during the job, and unlike
   mispricing the contractor usually knows it is happening and does it anyway.
4. **The third leak, closed end to end** — margin fade. The tool now tracks actual spend
   against the estimate per trade, so "the job was 25% on paper and 14% at the end" stops
   being a mystery. This matters commercially because it turns the product from a
   bidding tool used for an hour per job into something opened every week the job runs —
   and retention, not features, is what a paid tier would eventually rest on.

Distribution is the part you do not have, and it is the part that decides the outcome.

## Why this segment, specifically

Most software ideas die on willingness to pay. This one is better positioned than most:

- Contractors are a **business** buyer, not a consumer. Business buyers expense $50/mo
  without a family discussion.
- The pain is **quantified and recurring**. A remodeler doing 12 jobs a year at a 6-point
  margin gap is looking at real five-figure money. The tool's value is not "convenience,"
  it is a number they can check.
- The incumbents (Joist, Jobber, Buildertrend, ServiceTitan) charge **$29–$400/mo** and
  are heavy. There is room underneath them for something sharp and fast.
- The buyer is **reachable**. Contractors congregate in identifiable places, which is
  not true of most B2B segments.

## The realistic paths, ranked

### 1. Sell the outcome, not the software — highest expected value
Do not compete with Jobber on features. Charge for the thing the tool reveals.

A **margin audit**: a contractor sends you three recent jobs, you rebuild them in
QuoteForge and hand back a document showing what each one actually kept versus what
they thought — and, separately, what they did on those jobs that never made it onto an
invoice. Charge $300–800. The tool makes the work take an hour instead of a day.
Roughly 40 of those a year is a real income, and it needs zero engineering.

The unbilled-work half of that audit is often the more persuasive number, because it is
not a disagreement about pricing philosophy. It is work they remember doing, for free,
recently.

This is the highest-probability path because it converts the product's insight into
money without requiring you to win a software distribution fight.

### 2. Paid tier for what genuinely needs a server
The current architecture makes the free tier nearly free to run, which is defensible
messaging. Charge for what the browser cannot do:

- Sync across phone and office computer
- **A hosted signature link** (client opens, signs, you get notified). This is the
  strongest candidate on the list, and change orders are why. A proposal gets signed
  once, at a kitchen table, where printing is fine. A change order gets signed
  mid-job, urgently, while the client is at work and the crew is standing in a room
  they cannot finish — and that is exactly the moment "I'll sign it tonight" turns
  into work performed on a handshake. Texting a link that can be signed on a phone in
  thirty seconds is worth real money to the contractor precisely because the
  alternative costs them real money
- Team seats, shared price book
- Job costing against actuals

**Realistic pricing:** $19–29/mo. **Realistic conversion** on a free tool with no brand:
1–3% of active users. That means 3,000+ engaged users to clear $1,000/mo. Which is to
say: the revenue problem is the traffic problem.

### 3. The price book as the product
The estimating engine is commodity. Accurate, current, **local** cost data is not.
A contractor in Denver desperately wants Denver numbers. Regional price data as a
$15/mo add-on is defensible, hard to copy, and gets more valuable over time — but it
requires ongoing data work, which is a real operating cost, not a one-time build.

### 4. Lead generation — the highest ceiling, and I would be cautious
Contractors pay $50–200 for a qualified homeowner lead. A homeowner-facing "what should
this remodel cost?" calculator built on this same engine could produce those leads.

The ceiling here is far above the others. I am flagging it rather than recommending it
because it is a **different business** — lead gen lives or dies on paid acquisition
economics and marketplace dynamics, not on product quality. It also means your customer
becomes the contractor buying leads, and your product becomes the homeowner's attention.
Go in knowing that, or not at all.

## What has to be true

Every path above bottlenecks on the same thing: **people have to find this.** Ranked by
what actually works for this segment:

1. **The calculator is the marketing.** "A 20% markup is a 16.7% margin" is a shareable,
   argument-starting claim. It belongs in contractor Facebook groups, r/Contractor,
   r/HomeImprovement, and trade forums — as a useful post, not a link drop. Those
   communities eject advertisers instantly and reward people who are actually helpful.
2. **Trade-specific SEO.** "bathroom remodel cost per square foot", "contractor markup vs
   margin", "how much to charge for a deck". High intent, and the assemblies already
   contain the answers.
3. **One trade association or supplier partnership** is worth more than months of
   cold outreach.

## The operational version

This document is the strategy. `SELL.md` is the checklist form of it — deploy, wire a
payment link into `audit.html` (one line), rehearse the fulfillment once on your own
job, then run the five free audits. The audit deliverable itself is now generated by
the app (Costs tab → Audit report), which drops fulfillment to about an hour per
client.

## What I would do first

If you only do one thing: **run five margin audits for actual contractors, free.**

Not to make money — to find out whether the gaps are real and painful in their books, or
just true on a landing page. Ask each one two questions:

1. What did you quote this job at, and what did it actually cost you? (If they cannot
   answer the second half — most cannot — that inability is itself the finding, and the
   job-cost log is the fix you demonstrate.)
2. What did you do on it that you never billed for?

The second question is the one to watch. If contractors answer it quickly and with
irritation, the change-order half of this product is the wedge and the hosted signature
link is the thing to build. If they shrug, it is not, and you have saved yourself
months. That answer determines which path above is worth building and which are fantasy.
It costs you a week and it is the only step here that cannot be skipped.

## Risks worth stating

- **The free tier may cannibalize the paid one.** The app is genuinely complete. A
  contractor may never need to upgrade. That is a real strategic tension in the current
  design, not an oversight — decide deliberately what stays free.
- **Local storage will lose someone's data eventually**, and they will be angry in
  public. The export path exists and the UI warns about it, but the first time someone
  clears their browser and loses a quote, that is a reputational event.
- **Price book accuracy is a liability surface.** If someone bids a job off default
  numbers and loses money, they will blame the tool. The app labels the costs as
  editable estimates; keep that framing prominent.
- **This is a crowded market with funded incumbents.** The wedge is sharp but narrow.
  Being better at one thing is a real strategy, but it is not a moat.
- **Change orders are a discipline problem before they are a software problem.** The app
  makes writing one fast and makes the exposure visible, but a contractor who does not
  want to have the awkward conversation with their client still will not have it. Tools
  do not supply nerve. Expect this to help the contractors who already half-know they
  should be doing it, and to bounce off the ones who do not.
- **Nothing here is a guarantee.** Most software products, including good ones, make
  approximately nothing. The product being solid raises the odds; it does not settle them.
