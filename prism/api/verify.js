// POST /api/verify — Prism's entire backend.
//
// Prism has no database. Stripe is the ledger and the license token is the
// receipt: a small signed statement that a particular checkout was paid. Two
// requests are served:
//
//   { session_id }  the buyer just came back from Stripe Checkout. Confirm the
//                   session was actually paid, then issue a token.
//   { token }       a token being restored on another device, or the app's
//                   daily re-check. Verify the signature, then ask Stripe
//                   whether the purchase still stands (refunded? lapsed?).
//
// Setup is one environment variable in Vercel: STRIPE_SECRET_KEY. Set
// LICENSE_SECRET too if you ever want to rotate the Stripe key without
// invalidating every token in the world.
//
// Nothing personal leaves this function: a token carries a session id, a plan,
// and a period end. No email, no name, no card.

const crypto = require('crypto');

// STRIPE_API_BASE is overridable so the test suite can run this against a mock.
const STRIPE = (process.env.STRIPE_API_BASE || 'https://api.stripe.com') + '/v1';

const secret = () => process.env.LICENSE_SECRET || process.env.STRIPE_SECRET_KEY || '';
const b64u = (buf) => Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const unb64u = (str) => Buffer.from(String(str).replace(/-/g, '+').replace(/_/g, '/'), 'base64');

function sign(payload) {
  const body = b64u(JSON.stringify(payload));
  const sig = b64u(crypto.createHmac('sha256', secret()).update(body).digest());
  return body + '.' + sig;
}

function verify(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const want = b64u(crypto.createHmac('sha256', secret()).update(parts[0]).digest());
  const a = Buffer.from(want), b = Buffer.from(parts[1]);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try { return JSON.parse(unb64u(parts[0]).toString('utf8')); } catch { return null; }
}

async function stripe(path) {
  const r = await fetch(STRIPE + path, { headers: { authorization: 'Bearer ' + process.env.STRIPE_SECRET_KEY } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('stripe ' + r.status);
  return r.json();
}

function interval(sub) {
  const item = sub && sub.items && sub.items.data && sub.items.data[0];
  const iv = item && item.price && item.price.recurring && item.price.recurring.interval;
  return iv === 'year' ? 'year' : iv === 'month' ? 'month' : 'subscription';
}

const LIVE = ['active', 'trialing', 'past_due'];

async function fromSession(id) {
  if (!/^cs_[A-Za-z0-9_]+$/.test(id)) return { ok: false, reason: 'invalid' };
  const s = await stripe('/checkout/sessions/' + encodeURIComponent(id) + '?expand[]=subscription');
  if (!s) return { ok: false, reason: 'invalid' };
  const payload = { v: 1, iat: Math.floor(Date.now() / 1000), sid: s.id };
  if (s.mode === 'subscription') {
    const sub = s.subscription;
    if (!sub || !LIVE.includes(sub.status)) return { ok: false, reason: 'unpaid' };
    payload.plan = interval(sub);
    payload.sub = sub.id;
    payload.until = sub.current_period_end;
  } else {
    if (s.payment_status !== 'paid') return { ok: false, reason: 'unpaid' };
    payload.plan = 'lifetime';
    payload.pi = typeof s.payment_intent === 'string' ? s.payment_intent : (s.payment_intent && s.payment_intent.id) || null;
  }
  return { ok: true, token: sign(payload), plan: payload.plan, until: payload.until || null };
}

async function fromToken(token) {
  const p = verify(token);
  if (!p || p.v !== 1) return { ok: false, reason: 'invalid' };
  if (p.plan === 'lifetime') {
    if (p.pi) {
      const pi = await stripe('/payment_intents/' + encodeURIComponent(p.pi) + '?expand[]=latest_charge');
      if (!pi) return { ok: false, reason: 'invalid' };
      const ch = pi.latest_charge;
      if (ch && typeof ch === 'object' && ch.refunded) return { ok: false, reason: 'refunded' };
    }
    return { ok: true, token, plan: 'lifetime', until: null };
  }
  if (p.sub) {
    const sub = await stripe('/subscriptions/' + encodeURIComponent(p.sub));
    if (!sub) return { ok: false, reason: 'invalid' };
    if (!LIVE.includes(sub.status)) return { ok: false, reason: 'lapsed' };
    const fresh = Object.assign({}, p, { iat: Math.floor(Date.now() / 1000), until: sub.current_period_end });
    return { ok: true, token: sign(fresh), plan: p.plan, until: fresh.until };
  }
  return { ok: false, reason: 'invalid' };
}

function readBody(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'string') { try { return Promise.resolve(JSON.parse(req.body)); } catch { return Promise.resolve(null); } }
    return Promise.resolve(req.body);
  }
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 4096) { raw = ''; req.destroy(); } });
    req.on('end', () => { try { resolve(JSON.parse(raw)); } catch { resolve(null); } });
    req.on('error', () => resolve(null));
  });
}

module.exports = async (req, res) => {
  res.setHeader('content-type', 'application/json');
  res.setHeader('cache-control', 'no-store');
  const send = (status, body) => { res.statusCode = status; res.end(JSON.stringify(body)); };
  if (req.method !== 'POST') return send(405, { ok: false, reason: 'method' });
  if (!process.env.STRIPE_SECRET_KEY) return send(503, { ok: false, reason: 'unconfigured' });
  const body = await readBody(req);
  try {
    if (body && typeof body.session_id === 'string') return send(200, await fromSession(body.session_id));
    if (body && typeof body.token === 'string') return send(200, await fromToken(body.token));
    return send(400, { ok: false, reason: 'invalid' });
  } catch (e) {
    return send(502, { ok: false, reason: 'error' });
  }
};

module.exports.sign = sign;
module.exports.verify = verify;
