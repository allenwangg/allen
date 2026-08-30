# Go-live playbook

`REVENUE.md` is the strategy. This is the checklist. Everything below is in the order
to do it, and nothing here requires writing code.

Honesty first, as always: this playbook raises the probability of revenue by removing
your setup work and your activation energy. It does not create demand, and nothing in
it is a guarantee. The one genuinely load-bearing step is #4 — the free audits — because
it is the only one that produces evidence instead of hope.

---

## 1. Deploy (~5 minutes)

Follow `DEPLOY.md`: merge to `master`, turn on GitHub Pages. You now have three URLs:

- `…/allen/` — the landing page
- `…/allen/quoteforge/` — the app
- `…/allen/audit.html` — the paid offer

Fill in **Settings → Your company** in the app before showing it to anyone; every
document is branded from it.

## 2. Wire the money (~15 minutes, one line of code)

Open `audit.html`. The config block is at the top and it is the only thing to edit:

```js
const AUDIT_CONFIG = {
  price: '$400',
  freeSlots: 5,
  bookingUrl: '',      // <- paste a link here
  contactEmail: '',    // <- or an email here
};
```

**Fastest (email):** put an email address in `contactEmail`. The Book button becomes a
prefilled email. Zero accounts, live today. Fine for the free-audit phase.

**Proper (payment link):** create a Stripe Payment Link — stripe.com → Payment Links →
New → product "Margin audit (3 jobs)", price $400, one-time → copy the URL into
`bookingUrl`. Stripe's fee is ~3%; there is no monthly cost. Calendly or any booking
URL works the same way if you would rather take a call first and invoice after.

Commit, push, done. The page refuses to show a booking button until one of these is
set, so there is no state where a visitor hits a dead end.

## 3. Rehearse the fulfillment once (~1 hour)

Before anyone pays you, run one audit on **your own** last job:

1. **Audit a job** in the toolbar → fill in the twelve fields.
2. It lands on the Costs tab with the report already built → print to PDF.

That is the whole delivery. The intake asks only for what a contractor can
actually tell you on a phone call — what they charged, roughly what they paid
out by trade, and what changed — because nobody can reconstruct their own line
items from memory, and asking them to ends the conversation.

If you want to build a job up properly instead (your own quotes, not an audit),
the estimator, Changes and Costs tabs still do that line by line.

If step 4's number surprises you, you have both rehearsed the product and acquired
your first marketing story — yours, true, and specific.

## 3b. Send the link instead of booking the call

`quoteforge/intake.html` is the same twelve questions, as a page a contractor
fills in themselves. They hit *Create my summary*, get a link, and send it back;
you paste it into **Audit a job** and everything is filled in.

This is the only part of the funnel that scales without a backend. Five booked
calls is a scheduling problem; twenty sent links is not. Say the privacy line
out loud when you ask, because it is true and it is unusual: their figures live
in the link's fragment, which browsers never transmit — the page has no server
to send them to.

Their answers still need your eyes. Rough numbers are the point, but a missing
zero in "what you charged" will produce a confident, wrong report.

## 4. The five free audits — the step that cannot be skipped

Offer five real contractors a free audit. Not to be generous: to find out whether the
pain is real before you spend months on the assumption that it is. The two questions,
from `REVENUE.md`:

1. What did you quote this job at, and what did it actually cost you?
2. What did you do on it that you never billed for?

Watch the second answer. Quick and irritated = the offer works, raise `freeSlots` to 0
and start charging. A shrug = you just saved yourself a year; the app is still a good
free tool and the audit is not a business.

Where to find the five: contractors you already know beat strangers. Failing that, the
posts below.

## 5. Two posts, ready to adapt

Rules for posting anywhere contractors gather (r/Contractor, r/HomeImprovement is
homeowners — skip it, trade Facebook groups, ContractorTalk): be useful first, disclose
that it is your tool, never post the same text twice, and read each community's
self-promotion rules before posting. One good post beats five spammy ones — these
communities permanently eject advertisers.

**Post A — the useful-first post (no link unless asked):**

> Something I wish someone had told me years earlier: a 20% markup is not a 20% margin.
> Marking up $32k of cost by 20% quotes $38.4k — but the $6.4k you keep is 16.7% of the
> sale, not 20%. If you need to actually keep 20%, the math is cost ÷ 0.80, not
> cost × 1.20. On that job it's a $1,600 difference, on every job you do.
> Worth checking which one your spreadsheet does — mine did the wrong one for years.

Answer questions in the comments. If someone asks how you check it now, then link the
free app. That order matters.

**Post B — the audit offer (only where self-promo is allowed, and say it is yours):**

> I built a free estimating tool and I'm calibrating a paid add-on: a margin audit.
> You send me the numbers from three recent jobs, you get back a one-page report per
> job — what it actually kept vs what you priced for, what you did that never got
> billed, and what your next quote has to be. Doing the first five free in exchange for
> blunt feedback. [link] — and the tool itself is free either way if you'd rather DIY.

## 6. First-week checklist

- [ ] Deployed, company profile filled in
- [ ] `AUDIT_CONFIG` wired (email counts)
- [ ] One audit run on your own job
- [ ] Five free audits offered (names written down, asked in person or by DM first)
- [ ] Post A published in one community
- [ ] After each audit: did question 2 land? Note the answer verbatim.

## When to stop

If after five audits nobody was stung by question 2 and nobody asked what you would
charge — stop selling audits. Keep the app free, keep using it yourself, and revisit
`REVENUE.md` for the other paths. Evidence over sunk cost, in both directions.
