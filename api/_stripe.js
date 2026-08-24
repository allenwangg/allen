/**
 * Shared helpers for the billing endpoints.
 *
 * Kept dependency-light on purpose: the only import is the Stripe SDK, and it
 * is loaded lazily so that a deployment missing the key fails with a clear
 * message instead of a module-load crash.
 */

let _stripe = null;

export async function stripe() {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new HttpError(500, 'STRIPE_SECRET_KEY is not configured.');
  const { default: Stripe } = await import('stripe');
  _stripe = new Stripe(key, { apiVersion: '2024-06-20' });
  return _stripe;
}

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export const PRICES = () => ({
  monthly: process.env.STRIPE_PRICE_MONTHLY,
  annual: process.env.STRIPE_PRICE_ANNUAL,
});

/**
 * CORS. Echoes a single configured origin rather than `*`, because these
 * endpoints will eventually carry customer identifiers.
 */
export function cors(req, res) {
  const allowed = process.env.ALLOWED_ORIGIN || '';
  const origin = req.headers.origin || '';
  if (allowed && origin === allowed) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  }
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return true; }
  return false;
}

export function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

export function fail(res, err) {
  const status = err instanceof HttpError ? err.status : 500;
  // Never leak internals to the client; log the real thing server-side.
  if (status >= 500) console.error('[billing]', err);
  send(res, status, { error: status >= 500 ? 'Internal error.' : err.message });
}

/**
 * Validate a redirect URL against the configured origin.
 *
 * Without this, an attacker can pass their own successUrl and turn our
 * Checkout session into an open redirect that looks like it came from us.
 */
export function safeUrl(candidate, fallback) {
  const allowed = process.env.ALLOWED_ORIGIN;
  if (!allowed) return fallback;
  try {
    const u = new URL(candidate);
    const a = new URL(allowed);
    if (u.origin !== a.origin) return fallback;
    return u.toString();
  } catch {
    return fallback;
  }
}

export async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;   // already parsed
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > 64 * 1024) throw new HttpError(413, 'Payload too large.');
    chunks.push(c);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new HttpError(400, 'Invalid JSON body.'); }
}
