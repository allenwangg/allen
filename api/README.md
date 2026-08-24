# Billing backend

Four serverless endpoints. Written for Vercel/Netlify-style handlers; the logic
is plain Node and ports to Express or Workers with a different signature.

| Endpoint | Purpose |
|---|---|
| `POST /create-checkout-session` | Starts a Stripe Checkout session for a plan |
| `GET  /verify-session` | Exchanges a returned session id for entitlement |
| `POST /create-portal-session` | Opens Stripe's billing portal (cancel, update card) |
| `POST /webhook` | Receives subscription lifecycle events from Stripe |

## Why a backend at all, for a local-first app

The client cannot be trusted to decide what someone paid for. Stripe collects
the money and tells *us*, over a signed webhook. Everything else in VitalArc
runs on the device.

The client-side entitlement record is therefore a **convenience cache**, not a
security boundary — a user can flip it in devtools and unlock Pro locally. That
is an accepted trade: there is no expensive server resource behind the paywall
to steal. If a feature is ever added that genuinely costs money to serve, it
must verify against the receipt server-side rather than trusting that cache.

## Setup

```bash
npm i stripe
```

Environment variables:

| Variable | Notes |
|---|---|
| `STRIPE_SECRET_KEY` | Server only. Never ship to the client. |
| `STRIPE_WEBHOOK_SECRET` | From the Stripe CLI or dashboard endpoint. |
| `STRIPE_PRICE_MONTHLY` | Price id for the monthly plan. |
| `STRIPE_PRICE_ANNUAL` | Price id for the annual plan. |
| `ALLOWED_ORIGIN` | Your site origin, for CORS. |

Then create `app/billing-config.json`:

```json
{ "apiBase": "https://your-api.example.com", "publishableKey": "pk_live_..." }
```

Without that file the app runs in demo mode and says so.

## Local testing

```bash
stripe listen --forward-to localhost:3000/api/webhook
stripe trigger checkout.session.completed
```
