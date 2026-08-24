/**
 * POST /create-portal-session — Stripe's hosted billing portal.
 *
 * This is where a subscriber updates their card or cancels. Cancelling is two
 * clicks and takes effect at period end; we do not make anyone email support.
 */
import { stripe, cors, send, fail, safeUrl, readJson, HttpError } from './_stripe.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed.');

    const { customerId, returnUrl } = await readJson(req);
    if (!customerId || !/^cus_[A-Za-z0-9]+$/.test(customerId)) {
      throw new HttpError(400, 'A customer id is required.');
    }

    const origin = process.env.ALLOWED_ORIGIN || '';
    const s = await stripe();
    const session = await s.billingPortal.sessions.create({
      customer: customerId,
      return_url: safeUrl(returnUrl, `${origin}/app/#settings`),
    });

    send(res, 200, { url: session.url });
  } catch (err) {
    fail(res, err);
  }
}
