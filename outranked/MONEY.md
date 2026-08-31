# MONEY.md — how the money works

## The architecture: there is no database

The leaderboard is computed **directly from your Stripe payment ledger**. Every time
someone loads the page, `/api/board` asks Stripe for completed checkout sessions and
rebuilds the rankings from them.

```
bidder clicks "Pay & rank"
  → Stripe Checkout (bid encoded in client_reference_id)
  → payment completes, money lands in YOUR Stripe balance
  → /api/board reads the ledger  →  the board, ranked
  → Stripe pays out to your bank
```

What this buys you, versus every other board in this category:

- **One environment variable is the entire backend.** No database, no KV store, no
  webhook endpoint to keep in sync, nothing to maintain or pay for.
- **Nothing can appear on the board without money having moved.** The ranking is a
  view of the payment ledger — an unpaid listing is not "unverified," it is
  impossible.
- **Nothing to lose.** Wipe the deployment, redeploy anywhere, and the board rebuilds
  itself perfectly from Stripe. Your data lives in the most durable place it could.

Until `STRIPE_SECRET_KEY` is set, `/api/board` reports `configured: false` and the site
runs a clearly-labeled **demo mode** with a seeded board. The moment the key exists,
the page wipes the demo data and shows only real, paid listings. No code change,
no redeploy.

## Turning it on

Both steps happen on Stripe's own website — they legally require the account owner, and
you should never give banking credentials to anyone (or any AI) to do them for you.

### 1. Stripe account + bank link (~15 min, one time)

1. [stripe.com](https://stripe.com) → Sign up.
2. **Activate payments**: legal name, address, tax ID (SSN in the US), and **your bank
   account** for payouts. That is the "link my bank" step.
3. When asked what you sell, describe it as
   **"leaderboard placement — digital advertising service."**
   (Not an auction, not a raffle, not gambling — this wording matches what the product
   actually is, and it is what keeps the account healthy.)

### 2. The Payment Link (~3 min)

1. Stripe Dashboard → **Payment Links** → **+ New**.
2. Product: `OUTRANKED bid` → price: **"Customers choose what to pay"**, minimum $1,
   suggested $5.
3. After payment → redirect to `https://<your-domain>/?paid=1`.
4. Copy the link.

### 3. Two values into the deployment

| Where | Name | Value |
|---|---|---|
| `index.html` → `CONFIG` | `STRIPE_PAYMENT_LINK` | your `https://buy.stripe.com/...` link |
| Vercel → Settings → Environment Variables | `STRIPE_SECRET_KEY` | your Stripe key |

The key is only ever read server-side inside `/api/board` — it is never sent to the
browser, and the endpoint returns only public bid data (listing name, URL, amount,
timestamp). No customer email, name, or payment details ever leave Stripe.

**Recommended:** use a **restricted key** rather than the full secret key —
Stripe Dashboard → Developers → API keys → **Create restricted key**, grant
*Checkout Sessions: read* and nothing else. If it ever leaked, it could read your
session list and do nothing else.

## When the money reaches your bank

- Charges appear in your Stripe balance **immediately**.
- Stripe holds a new account's **first payout for 7–14 days** (an anti-fraud rule
  nobody can waive), then pays out automatically every ~2 business days.
- Stripe's cut: ~2.9% + 30¢ per bid. That is the only cost in the entire stack.

## Housekeeping that protects the revenue

- **Refunds:** the page says "No refunds. Obviously." Put the same line in the Payment
  Link's description so it is part of the checkout record.
- **Disputes:** answer with a screenshot of the board showing the placement was
  delivered, plus the listing's public click count. Placement is a delivered service.
- **Taxes:** ordinary business income; Stripe issues a 1099-K past the threshold.
- **Have a backup processor in mind** (Lemon Squeezy, Paddle). outbid.lol was thrown
  off its first payment provider mid-viral. Correct product wording is your best
  protection; a backup is your insurance.
