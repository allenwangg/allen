/**
 * POST /webhook — Stripe subscription lifecycle.
 *
 * SIGNATURE VERIFICATION IS NOT OPTIONAL. This endpoint is public, and without
 * verification anyone could POST a fabricated `checkout.session.completed` and
 * grant themselves a subscription. It needs the RAW body — a framework that
 * JSON-parses first will silently break the signature check, which is why the
 * raw read is done explicitly here.
 */
import { stripe, send, fail, HttpError } from './_stripe.js';

// Vercel: disable the automatic body parser so we can verify the signature.
export const config = { api: { bodyParser: false } };

async function rawBody(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > 1024 * 1024) throw new HttpError(413, 'Payload too large.');
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed.');

    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) throw new HttpError(500, 'STRIPE_WEBHOOK_SECRET is not configured.');

    const s = await stripe();
    const body = await rawBody(req);
    const sig = req.headers['stripe-signature'];

    let event;
    try {
      event = s.webhooks.constructEvent(body, sig, secret);
    } catch (err) {
      // A bad signature is a 400, never a 500 — Stripe retries 5xx forever.
      throw new HttpError(400, `Signature verification failed: ${err.message}`);
    }

    switch (event.type) {
      case 'checkout.session.completed':
        await onSubscriptionStarted(event.data.object);
        break;
      case 'customer.subscription.updated':
      case 'customer.subscription.created':
        await onSubscriptionChanged(event.data.object);
        break;
      case 'customer.subscription.deleted':
        await onSubscriptionEnded(event.data.object);
        break;
      case 'invoice.payment_failed':
        await onPaymentFailed(event.data.object);
        break;
      default:
        // Unhandled event types are acknowledged, not errored. Returning a
        // non-2xx makes Stripe retry indefinitely for events we do not want.
        break;
    }

    send(res, 200, { received: true });
  } catch (err) {
    fail(res, err);
  }
}

/*
 * Persistence is intentionally left as a single seam.
 *
 * VitalArc keeps health data on the device, so the only thing that needs a
 * server-side record is the subscription itself: customer id, plan, status and
 * period end. Any key-value store will do — Redis, KV, a single Postgres
 * table. Implement `saveSubscription` for whichever you deploy against.
 */
async function saveSubscription(record) {
  // TODO: wire to your store, e.g.
  //   await kv.set(`sub:${record.customerId}`, record);
  console.log('[billing] subscription record', record);
}

async function onSubscriptionStarted(session) {
  await saveSubscription({
    customerId: typeof session.customer === 'string' ? session.customer : session.customer?.id,
    subscriptionId: session.subscription,
    plan: session.metadata?.plan || 'monthly',
    status: 'active',
    updatedAt: Date.now(),
  });
}

async function onSubscriptionChanged(sub) {
  await saveSubscription({
    customerId: typeof sub.customer === 'string' ? sub.customer : sub.customer?.id,
    subscriptionId: sub.id,
    plan: sub.metadata?.plan || 'monthly',
    status: sub.status,                                  // active | past_due | canceled | ...
    periodEnd: sub.current_period_end ? sub.current_period_end * 1000 : null,
    cancelAtPeriodEnd: !!sub.cancel_at_period_end,
    updatedAt: Date.now(),
  });
}

async function onSubscriptionEnded(sub) {
  await saveSubscription({
    customerId: typeof sub.customer === 'string' ? sub.customer : sub.customer?.id,
    subscriptionId: sub.id,
    status: 'canceled',
    endedAt: Date.now(),
  });
}

async function onPaymentFailed(invoice) {
  // The client already honours a short grace window, so a single failed
  // renewal does not lock someone out of their own data mid-week.
  await saveSubscription({
    customerId: typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id,
    status: 'past_due',
    updatedAt: Date.now(),
  });
}
