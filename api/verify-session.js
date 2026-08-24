/**
 * GET /verify-session?session_id=cs_... — exchange a completed Checkout
 * session for the entitlement the client should store.
 *
 * This is the authoritative answer to "did they pay". The client never
 * decides that for itself.
 */
import { stripe, cors, send, fail, HttpError } from './_stripe.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  try {
    if (req.method !== 'GET') throw new HttpError(405, 'Method not allowed.');

    const url = new URL(req.url, 'http://localhost');
    const id = url.searchParams.get('session_id');
    if (!id || !/^cs_[A-Za-z0-9_]+$/.test(id)) throw new HttpError(400, 'Invalid session id.');

    const s = await stripe();
    const session = await s.checkout.sessions.retrieve(id, { expand: ['subscription'] });

    if (session.payment_status !== 'paid' && session.status !== 'complete') {
      send(res, 200, { status: 'incomplete' });
      return;
    }

    const sub = session.subscription;
    send(res, 200, {
      status: 'active',
      plan: session.metadata?.plan || 'monthly',
      customerId: typeof session.customer === 'string' ? session.customer : session.customer?.id,
      // Milliseconds, to match Date.now() on the client.
      periodEnd: sub?.current_period_end ? sub.current_period_end * 1000 : null,
    });
  } catch (err) {
    fail(res, err);
  }
}
