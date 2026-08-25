# MONEY.md — turning the bids into your bank balance

The app is fully wired for real payments. Two things stand between you and revenue,
and **both legally require you** (Stripe's KYC verifies the account owner's identity —
nobody can do it for you, and you should never give anyone your banking credentials
to do it "for" you):

## Step 1 — Stripe account + bank link (~10–15 minutes, one time)

1. Go to https://stripe.com and create an account.
2. Complete the activation form: legal name, address, SSN/tax info (US), and **your
   bank account** for payouts. This is the "link my bank account" step — it lives in
   Stripe, not in the code, and that's what makes the money path trustworthy.
3. Payouts land on Stripe's rolling schedule (typically 2 business days after each
   charge).

## Step 2 — create the Payment Link (~3 minutes)

1. Stripe Dashboard → **Payment Links** → **+ New**.
2. Create a product called `OUTRANKED bid` → price: **"Customer chooses price"**
   (suggested amount $5, minimum $1).
3. After-payment behavior: redirect to `https://outranked.vercel.app/?paid=1`.
4. Copy the link (`https://buy.stripe.com/...`).

## Step 3 — flip the switch (~1 minute)

In `outranked/index.html`, set:

```js
const CONFIG = {
  STRIPE_PAYMENT_LINK: "https://buy.stripe.com/YOUR_LINK",
  SITE_URL: "https://outranked.vercel.app/",
  X_HANDLE: "yourhandle",
};
```

Commit + push. The demo ribbon disappears, and every **Pay & rank** click opens real
Stripe checkout with the bid encoded in `client_reference_id`
(`<name>_<amount>_<nonce>`), so each charge in your dashboard reconciles to a listing.

## Verification tiers (start at 1, upgrade when volume justifies)

1. **Honor + reconcile (launch day, zero infra).** Bids appear on the board
   optimistically; you check the Stripe dashboard and remove any listing whose charge
   never arrived. This is the "3 hours, one page, a payment link" configuration that
   made the original $100k+.
2. **Auto-verified (~5 extra minutes).** Deploy `server/stripe-webhook-worker.js` to
   Cloudflare Workers (instructions in the file header). Set `CONFIG.BOARD_FEED_URL`
   to the worker's `/board` URL — the page then merges only webhook-confirmed bids,
   marked ✔ VERIFIED, on every load.

## Housekeeping that protects the revenue

- **Refund policy on the page**: already there ("No refunds. Obviously.") — also add
  it to the Payment Link's custom message so it's part of the checkout record.
- **Disputes**: pay-for-placement is a legitimate digital service (advertising /
  novelty), not gambling and not an auction of goods — describe it in Stripe as
  "leaderboard placement (digital service)". Answer disputes with the public board
  screenshot showing the placement was delivered.
- **Taxes**: this is ordinary business income; Stripe issues a 1099-K past the
  threshold. Keep the dashboard exports.
