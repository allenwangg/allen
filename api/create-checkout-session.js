/** POST /create-checkout-session — begin a Stripe Checkout for a plan. */
import { stripe, PRICES, cors, send, fail, safeUrl, readJson, HttpError } from './_stripe.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed.');

    const { plan, successUrl, cancelUrl } = await readJson(req);
    const price = PRICES()[plan];
    // Whitelist the plan rather than trusting a price id from the client —
    // otherwise anyone can substitute a $0 price of their own creation.
    if (!price) throw new HttpError(400, 'Unknown plan.');

    const origin = process.env.ALLOWED_ORIGIN || '';
    const s = await stripe();
    const session = await s.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price, quantity: 1 }],
      success_url: safeUrl(successUrl, `${origin}/app/?receipt={CHECKOUT_SESSION_ID}#today`),
      cancel_url: safeUrl(cancelUrl, `${origin}/app/#upgrade`),
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
      // Surfacing the cancellation path inside the portal is a retention
      // decision as much as an ethical one: people subscribe more readily to
      // something they know they can leave.
      subscription_data: { metadata: { product: 'vitalarc', plan } },
      metadata: { product: 'vitalarc', plan },
    });

    send(res, 200, { url: session.url, id: session.id });
  } catch (err) {
    fail(res, err);
  }
}
