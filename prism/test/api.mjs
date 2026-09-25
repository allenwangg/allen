// Prism api/verify.js — driven against a mock Stripe, the same way the sibling
// project tests its ledger reader. No network, no real key.
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let fail = 0; const ok = (c, n) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) fail++; };

const future = Math.floor(Date.now() / 1000) + 30 * 86400;
const seen = [];
const routes = {
  '/v1/checkout/sessions/cs_paid': { id: 'cs_paid', mode: 'payment', payment_status: 'paid', payment_intent: 'pi_ok', customer_details: { email: 'buyer@example.com' } },
  '/v1/checkout/sessions/cs_unpaid': { id: 'cs_unpaid', mode: 'payment', payment_status: 'unpaid', payment_intent: 'pi_x' },
  '/v1/checkout/sessions/cs_sub': { id: 'cs_sub', mode: 'subscription', payment_status: 'paid',
    subscription: { id: 'sub_live', status: 'active', current_period_end: future, items: { data: [{ price: { recurring: { interval: 'year' } } }] } } },
  '/v1/checkout/sessions/cs_subdead': { id: 'cs_subdead', mode: 'subscription', payment_status: 'paid',
    subscription: { id: 'sub_dead', status: 'canceled', current_period_end: 0, items: { data: [] } } },
  '/v1/payment_intents/pi_ok': { id: 'pi_ok', latest_charge: { id: 'ch_1', refunded: false } },
  '/v1/payment_intents/pi_ref': { id: 'pi_ref', latest_charge: { id: 'ch_2', refunded: true } },
  '/v1/subscriptions/sub_live': { id: 'sub_live', status: 'active', current_period_end: future + 86400 },
  '/v1/subscriptions/sub_dead': { id: 'sub_dead', status: 'canceled', current_period_end: 0 },
};
const stripe = createServer((q, r) => {
  const path = q.url.split('?')[0];
  seen.push({ path, auth: q.headers.authorization || '' });
  if (path === '/v1/checkout/sessions/cs_boom') { r.writeHead(500); return r.end('{}'); }
  const body = routes[path];
  if (!body) { r.writeHead(404, { 'content-type': 'application/json' }); return r.end('{"error":{"type":"invalid_request_error"}}'); }
  r.writeHead(200, { 'content-type': 'application/json' });
  r.end(JSON.stringify(body));
});
await new Promise(r => stripe.listen(0, r));
process.env.STRIPE_API_BASE = `http://127.0.0.1:${stripe.address().port}`;
process.env.STRIPE_SECRET_KEY = 'sk_test_fake_for_tests';

const require = createRequire(import.meta.url);
const handler = require(join(root, 'api/verify.js'));

async function call(method, body, opts = {}) {
  const res = { headers: {}, statusCode: 200, setHeader(k, v) { this.headers[k] = v; }, end(s) { this.out = s; } };
  await handler({ method, body, headers: {} }, res);
  return { status: res.statusCode, body: JSON.parse(res.out || 'null') };
}

// method and configuration guards
ok((await call('GET', {})).status === 405, 'GET is refused');
const key = process.env.STRIPE_SECRET_KEY; delete process.env.STRIPE_SECRET_KEY;
ok((await call('POST', { session_id: 'cs_paid' })).status === 503, 'no Stripe key -> 503 unconfigured');
process.env.STRIPE_SECRET_KEY = key;
ok((await call('POST', {})).status === 400, 'a body with neither session nor token -> 400');
ok((await call('POST', { session_id: 'not a session' })).body.reason === 'invalid', 'a malformed session id is rejected without calling Stripe');

// a paid one-time checkout issues a lifetime token
const paid = await call('POST', { session_id: 'cs_paid' });
ok(paid.status === 200 && paid.body.ok === true && paid.body.plan === 'lifetime', 'a paid session issues a lifetime token');
ok(typeof paid.body.token === 'string' && paid.body.token.split('.').length === 2, 'the token is payload.signature');
const payload = JSON.parse(Buffer.from(paid.body.token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
ok(!JSON.stringify(payload).includes('example.com') && !('email' in payload), 'the token carries no email or personal data');
ok(seen.some(s => s.auth === 'Bearer ' + key), 'Stripe is called with the secret key as a bearer token');

ok((await call('POST', { session_id: 'cs_unpaid' })).body.reason === 'unpaid', 'an unpaid session issues nothing');
ok((await call('POST', { session_id: 'cs_missing' })).body.reason === 'invalid', 'an unknown session is invalid');
ok((await call('POST', { session_id: 'cs_boom' })).status === 502, 'a Stripe outage is a 502, not a grant');

// tokens round-trip, and tampering is caught
const again = await call('POST', { token: paid.body.token });
ok(again.body.ok === true && again.body.plan === 'lifetime', 'a lifetime token validates (restore on another device)');
const [pl, sig] = paid.body.token.split('.');
const forged = Buffer.from(JSON.stringify(Object.assign({}, payload, { plan: 'lifetime', pi: 'pi_ok', sid: 'cs_forged' })))
  .toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_') + '.' + sig;
ok((await call('POST', { token: forged })).body.reason === 'invalid', 'a token with an edited payload is rejected');
ok((await call('POST', { token: pl + '.' + sig.slice(0, -2) + 'AA' })).body.reason === 'invalid', 'a token with a bad signature is rejected');
ok((await call('POST', { token: 'garbage' })).body.reason === 'invalid', 'garbage is rejected');

// a refund revokes
const refunded = handler.sign({ v: 1, iat: 1, sid: 'cs_r', plan: 'lifetime', pi: 'pi_ref' });
ok((await call('POST', { token: refunded })).body.reason === 'refunded', 'a refunded purchase no longer validates');

// subscriptions carry a period end and lapse when cancelled
const sub = await call('POST', { session_id: 'cs_sub' });
ok(sub.body.ok === true && sub.body.plan === 'year' && sub.body.until === future, 'a subscription checkout issues an annual token with its period end');
const subAgain = await call('POST', { token: sub.body.token });
ok(subAgain.body.ok === true && subAgain.body.until === future + 86400, 'validating a subscription token refreshes the period end from Stripe');
ok((await call('POST', { session_id: 'cs_subdead' })).body.reason === 'unpaid', 'a cancelled subscription checkout issues nothing');
const dead = handler.sign({ v: 1, iat: 1, sid: 'cs_d', plan: 'year', sub: 'sub_dead', until: 0 });
ok((await call('POST', { token: dead })).body.reason === 'lapsed', 'a lapsed subscription token is revoked');

// a rotated signing secret invalidates old tokens, as it should
process.env.LICENSE_SECRET = 'rotated';
ok((await call('POST', { token: paid.body.token })).body.reason === 'invalid', 'rotating LICENSE_SECRET retires old tokens');
delete process.env.LICENSE_SECRET;

stripe.close();
console.log(fail ? `${fail} FAILED` : 'ALL PASS');
process.exit(fail ? 1 : 0);
