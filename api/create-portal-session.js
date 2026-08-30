/**
 * POST /create-portal-session — Stripe's hosted billing portal.
 *
 * This is where a subscriber updates their card or cancels. Cancelling is two
 * clicks and takes effect at period end; we do not make anyone email support.
 */
import { stripe, cors, send, fail, safeUrl, readJson, HttpError, verifyPortalToken } from './_stripe.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed.');

    const { customerId, portalToken, returnUrl } = await readJson(req);
    if (!customerId || !/^cus_[A-Za-z0-9]+$/.test(customerId)) {
      throw new HttpError(400, 'A customer id is required.');
    }
    // Customer ids are not secrets — they appear in receipts and support
    // email. Without this proof, this endpoint is an IDOR that opens any
    // customer's billing portal (card details, invoices, cancellation) to
    // anyone who has seen their id. The token is minted by verify-session,
    // which only the paying browser's checkout return can reach.
    if (!verifyPortalToken(customerId, portalToken)) {
      throw new HttpError(403, 'Invalid or missing portal token.');
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
