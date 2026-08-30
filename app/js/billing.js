/**
 * billing.js — Stripe Checkout integration, client half.
 *
 * ARCHITECTURE. The client never sees a secret key and never decides what
 * someone paid for. It asks our own endpoint to create a Checkout Session,
 * Stripe collects the payment, Stripe calls our webhook, and the webhook is
 * what writes entitlement. On return the client exchanges a short-lived
 * receipt token for its entitlement record.
 *
 * The client-side entitlement cache in store is therefore a CONVENIENCE, not a
 * security boundary. Anyone can edit it in devtools and unlock Pro locally.
 * That is fine and deliberate: the app is local-first, so there is no
 * expensive server resource to steal. Features that ever do cost money to
 * serve must verify server-side against the receipt, never against this cache.
 *
 * DEMO MODE. With no backend configured the app runs fully functional in demo
 * mode so the product can be evaluated end to end. It says so plainly rather
 * than pretending a payment occurred.
 */

const CONFIG_URL = './billing-config.json';

let config = null;

async function loadConfig() {
  if (config !== null) return config;
  try {
    const res = await fetch(CONFIG_URL, { cache: 'no-store' });
    config = res.ok ? await res.json() : {};
  } catch {
    config = {};
  }
  return config;
}

export function isDemoMode(cfg) {
  return !cfg || !cfg.apiBase || !cfg.publishableKey;
}

/**
 * Start a checkout. Returns one of:
 *   { redirected: true }                       -> navigating to Stripe
 *   { simulated: true, entitlement }           -> demo mode
 *   { redirected: false, message }             -> could not proceed
 */
export async function beginCheckout(plan) {
  if (plan !== 'monthly' && plan !== 'annual') {
    return { redirected: false, message: 'Unknown plan.' };
  }
  const cfg = await loadConfig();

  if (isDemoMode(cfg)) {
    if (!confirm(
      'Demo mode: no payment provider is configured for this build.\n\n'
      + 'Continue to unlock Pro locally so you can evaluate the full app? '
      + 'No card will be charged and nothing is sent anywhere.'
    )) {
      return { redirected: false, message: 'Cancelled.' };
    }
    const periodMs = plan === 'annual' ? 365 * 86400000 : 30 * 86400000;
    return {
      simulated: true,
      entitlement: {
        status: 'active', tier: 'pro', plan,
        source: 'demo',
        startedAt: Date.now(),
        periodEnd: Date.now() + periodMs,
      },
    };
  }

  const res = await fetch(`${cfg.apiBase}/create-checkout-session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      plan,
      successUrl: `${location.origin}${location.pathname}?receipt={CHECKOUT_SESSION_ID}#today`,
      cancelUrl: `${location.origin}${location.pathname}#upgrade`,
    }),
  });

  if (!res.ok) {
    return { redirected: false, message: `Checkout failed (${res.status}). Please try again.` };
  }
  const { url } = await res.json();
  if (!url) return { redirected: false, message: 'Checkout session had no URL.' };
  location.assign(url);
  return { redirected: true };
}

/**
 * After returning from Stripe, exchange the session id for an entitlement.
 * Verification happens server-side; we only store what it hands back.
 */
export async function restoreFromReceipt() {
  const params = new URLSearchParams(location.search);
  const receipt = params.get('receipt');
  if (!receipt) return null;

  // Clean the URL immediately so a refresh doesn't re-trigger this.
  const clean = location.pathname + location.hash;
  history.replaceState(null, '', clean);

  const cfg = await loadConfig();
  if (isDemoMode(cfg)) return null;

  try {
    const res = await fetch(`${cfg.apiBase}/verify-session?session_id=${encodeURIComponent(receipt)}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== 'active') return null;
    return {
      status: 'active',
      tier: 'pro',
      plan: data.plan,
      source: 'subscription',
      customerId: data.customerId,
      // Proof-of-ownership for the billing portal; minted server-side and
      // meaningless to anyone who is not this customer.
      portalToken: data.portalToken || null,
      periodEnd: data.periodEnd,
      startedAt: Date.now(),
    };
  } catch {
    return null;
  }
}

/**
 * Open Stripe's billing portal for an existing subscriber.
 *
 * `customerId` comes from the entitlement record written by restoreFromReceipt
 * (which got it from our own server, not from the client). The portal endpoint
 * requires it — an earlier version of this function omitted it and every
 * "Manage billing" click would have failed with a 400.
 */
export async function openBillingPortal(customerId, portalToken) {
  const cfg = await loadConfig();
  if (isDemoMode(cfg)) {
    return { redirected: false, message: 'Demo mode — no billing portal is configured.' };
  }
  if (!customerId) {
    return { redirected: false, message: 'No subscription found on this device. If you subscribed elsewhere, reopen the link from your receipt email.' };
  }
  try {
    const res = await fetch(`${cfg.apiBase}/create-portal-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId, portalToken, returnUrl: location.href }),
    });
    if (!res.ok) return { redirected: false, message: 'Could not open the billing portal.' };
    const { url } = await res.json();
    if (!url) return { redirected: false, message: 'No portal URL returned.' };
    location.assign(url);
    return { redirected: true };
  } catch {
    return { redirected: false, message: 'Network error opening the billing portal.' };
  }
}
