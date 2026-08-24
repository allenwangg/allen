# Monetization

An honest assessment, including the parts that argue against this business.

## Model

Freemium subscription, priced at **$8.99/month or $59/year** (45% saving, $4.92
effective monthly). A 7-day Pro trial with no card required.

| Free, forever | Pro |
|---|---|
| Daily logging, all 20 habit fields | Everything in Free |
| Healthspan Score and pillar breakdown | Personal insight engine |
| Streaks and weekday patterns | What-if simulator |
| Last 14 days of history | Highest-leverage rankings |
| Full data export, any time | Unlimited history and long-range trends |
| | Biomarker tracking |
| | Shareable report |

## Why the free tier is genuinely useful

The temptation in this category is to cripple free until it hurts. That
maximises week-one conversion and destroys month-six retention, which is the
only number that matters in subscriptions.

The gate here is **depth, not function**. You can log forever, see your score
forever, and export everything on any plan. What Pro sells is analysis — the
part that was expensive to build and is genuinely hard to copy.

The 14-day free history limit trims the *view*, never the stored data. Someone
who lapses and later resubscribes gets their full history back. Deleting
paid-for data on downgrade generates chargebacks and one-star reviews.

## Why annual is the featured plan

Annual subscribers churn far less than monthly ones, and in a habit app the
value compounds with time logged — a user with 200 days of data gets insights a
30-day user cannot. Annual buys the time the product needs to become useful.

The 45% discount is real, and computed from the prices at runtime so marketing
copy cannot drift out of sync with billing.

## What is deliberately not done

No countdown timers manufactured from the current clock. No fake scarcity. No
trial that starts silently and bills on expiry. No burying the cancel path — it
is two clicks in the Stripe portal, and the app says so on the pricing page.

These tactics lift week-one conversion and destroy month-six retention. In a
health app they are also a regulatory and reputational liability.

## Unit economics

Local-first is a *cost* strategy as much as a privacy one. Health data never
leaves the device, so:

- No per-user storage or database cost. A free user costs approximately the
  bandwidth of one cached page load.
- No data-breach surface for the most sensitive category of personal data.
- No GDPR/HIPAA data-processing burden for the health data itself.
- Marginal cost of a Pro user is Stripe's fee and nothing else.

The whole backend is four serverless endpoints that only ever touch
subscription records. That is the entire server-side footprint.

## Realistic expectations

**No app is guaranteed to make money, and this one is not either.** Health and
fitness is one of the most crowded categories on both app stores. Honest
framing:

- Consumer subscription apps convert **1–5%** of active free users. A trial with
  no card converts lower per-start than a card-required trial but starts far more
  often, and produces meaningfully better retention.
- Typical monthly churn for a consumer health subscription is **5–10%**, implying
  an average subscriber lifetime of 10–20 months.
- At $59/year with a 3% conversion rate, **10,000 monthly actives is roughly
  $17,700/year** in gross subscription revenue before Stripe fees and taxes.
- Getting to 10,000 monthly actives is the hard part. It is a distribution
  problem, not a product problem, and this repository solves none of it.

The product's defensible advantage is narrow but real: the statistical rigour of
the insight engine is genuinely uncommon in this category, it is documented and
testable, and "on pure noise it reports nothing — measured, 0 of 30 datasets" is
a claim almost no competitor can make. That is a marketing asset as much as an
engineering one.

The corresponding weakness is equally real: **rigour is hard to convey in an app
store screenshot.** Most buyers cannot tell a permutation test from a
correlation coefficient. Distribution likely has to come from content that
demonstrates the reasoning — showing the twelve-findings-to-one detrending
result is more persuasive than any feature list.

## Compliance

VitalArc is positioned as a **wellness and habit-tracking tool**, not a medical
device, and the copy is written to stay on the right side of that line:

- No diagnostic claims anywhere.
- Healthspan Age is labelled an illustrative estimate wherever it appears, with
  a confidence tier attached.
- Every insight surface states that correlation is not causation.
- Clinician-referral language in the disclaimers.

Anyone shipping this commercially should have the marketing copy reviewed
against FTC health-claim guidance and, if targeting the EU, MDR Annex VIII
Rule 11 — the boundary between "wellness" and "medical device software" is
narrower than most founders assume, and it is drawn by claims, not by code.
