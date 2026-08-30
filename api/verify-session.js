/**
 * GET /verify-session?session_id=cs_... — exchange a completed Checkout
 * session for the entitlement the client should store.
 *
 * This is the authoritative answer to "did they pay". The client never
 * decides that for itself.
 */
import { stripe, cors, send, fail, HttpError, mintPortalToken } from './_stripe.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  try {
    if (req.method !== 'GET') throw new HttpError(405, 'Method not allowed.');

    const url = new URL(req.url, 'http://localhost');
    const id = url.searchParams.get('session_id');
    if (!id || !/^cs_[A-Za-z0-9_]+$/.test(id)) throw new HttpError(400, 'Invalid session id.');

    const s = await stripe();
    const session = await s.checkout.sessions.retrieve(id, { expand: ['subscription'] });

    // Only sessions this product created mint entitlement. Without this check,
    // ANY completed checkout on the same Stripe account — a different product,
    // a one-off invoice link — could be replayed here to unlock Pro and to
    // learn that session's customer id.
    if (session.metadata?.product !== 'vitalarc') {
      throw new HttpError(404, 'Unknown session.');
    }

    if (session.payment_status !== 'paid' && session.status !== 'complete') {
      send(res, 200, { status: 'incomplete' });
      return;
    }

    const sub = session.subscription;
    const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
    send(res, 200, {
      status: 'active',
      plan: session.metadata?.plan || 'monthly',
      customerId,
      // Proof of ownership for the billing-portal endpoint; see _stripe.js.
      portalToken: customerId ? mintPortalToken(customerId) : null,
      // Milliseconds, to match Date.now() on the client.
      periodEnd: sub?.current_period_end ? sub.current_period_end * 1000 : null,
    });
  } catch (err) {
    fail(res, err);
  }
}
