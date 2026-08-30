/**
 * GET /entitlement?customerId=cus_...&portalToken=... — current subscription
 * state for a device that has already proved ownership.
 *
 * WHY THIS EXISTS. The client writes its entitlement exactly once, when the
 * browser returns from Stripe Checkout carrying the session id. That record's
 * periodEnd is the FIRST period's end. Stripe then renews silently, and
 * without this endpoint the device has no way to learn that — so a paying
 * subscriber's local record goes stale one month in and the app previously
 * concluded they had lapsed. This is the missing half of that loop.
 *
 * Authentication is the same HMAC proof-of-ownership token the billing portal
 * requires: minted by verify-session, which only the paying browser's return
 * URL can reach. Customer ids alone are not secrets.
 */
import { stripe, cors, send, fail, HttpError, verifyPortalToken } from './_stripe.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  try {
    if (req.method !== 'GET') throw new HttpError(405, 'Method not allowed.');

    const url = new URL(req.url, 'http://localhost');
    const customerId = url.searchParams.get('customerId');
    const portalToken = url.searchParams.get('portalToken');

    if (!customerId || !/^cus_[A-Za-z0-9]+$/.test(customerId)) {
      throw new HttpError(400, 'A customer id is required.');
    }
    if (!verifyPortalToken(customerId, portalToken)) {
      throw new HttpError(403, 'Invalid or missing portal token.');
    }

    const s = await stripe();
    const subs = await s.subscriptions.list({
      customer: customerId,
      status: 'all',
      limit: 10,
    });

    // Any subscription that still entitles the customer to the product.
    const live = subs.data.find((sub) => sub.status === 'active' || sub.status === 'trialing');
    if (live) {
      send(res, 200, {
        status: 'active',
        plan: live.metadata?.plan || 'monthly',
        periodEnd: live.current_period_end ? live.current_period_end * 1000 : null,
        cancelAtPeriodEnd: !!live.cancel_at_period_end,
        pastDue: false,
      });
      return;
    }

    // past_due / unpaid: the card failed but Stripe is still retrying. Keep
    // the customer in Pro and let the UI ask them to update their payment
    // method — locking someone out mid-retry is how you turn a expired card
    // into a cancellation.
    const retrying = subs.data.find((sub) => sub.status === 'past_due' || sub.status === 'unpaid');
    if (retrying) {
      send(res, 200, {
        status: 'active',
        plan: retrying.metadata?.plan || 'monthly',
        periodEnd: retrying.current_period_end ? retrying.current_period_end * 1000 : null,
        pastDue: true,
      });
      return;
    }

    // Nothing live and nothing retrying: genuinely over. This is the only
    // response that takes Pro away.
    send(res, 200, { status: 'canceled' });
  } catch (err) {
    fail(res, err);
  }
}
