/**
 * intake-link.test.js — the link a contractor fills in must survive the trip.
 *
 * A corrupted link means their ten minutes of work is gone and you have to ask
 * again, which is the one thing that would make the audit ask feel expensive.
 */
import { encodeIntake, decodeIntake, readIntakeFrom, INTAKE_CATEGORIES } from './intake-link.js';

let passed = 0, failed = 0; const failures = [];
const t = (n, f) => { try { f(); passed++; } catch (e) { failed++; failures.push(`${n}\n    ${e.message}`); } };
const eq = (a, b, m = '') => { if (a !== b) throw new Error(`${m} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const ok = (c, m = 'failed') => { if (!c) throw new Error(m); };

const SAMPLE = {
  title: 'Kitchen — Alder St',           // em dash: not Latin-1
  client: 'Dana Whitmore',
  quotedTotal: 42000,
  budget: { labor: 12000, material: 9000, subcontractor: 8000, equipment: 0, other: 900 },
  spent: { labor: 15200.55, material: 9400, subcontractor: 8000, equipment: 0, other: 900 },
  changes: [
    { title: 'Rot under the tub', amount: 2400, signed: false },
    { title: 'Upgraded venting', amount: 800, signed: true },
  ],
};

t('a full summary round-trips intact', () => {
  const got = decodeIntake(encodeIntake(SAMPLE));
  eq(got.title, SAMPLE.title, 'a non-Latin-1 title must survive:');
  eq(got.client, SAMPLE.client);
  eq(got.quotedTotal, 42000);
  for (const c of INTAKE_CATEGORIES) {
    eq(got.budget[c], SAMPLE.budget[c], `budget.${c}:`);
    eq(got.spent[c], SAMPLE.spent[c], `spent.${c}:`);
  }
  eq(got.changes.length, 2);
  eq(got.changes[0].signed, false);
  eq(got.changes[1].signed, true);
  eq(got.changes[1].amount, 800);
});

t('the encoded link stays a sane length', () => {
  const code = encodeIntake(SAMPLE);
  ok(code.length < 400, `a realistic job encoded to ${code.length} chars — too long to paste comfortably`);
  ok(!/[+/=]/.test(code), 'the code must be URL-safe');
});

t('unicode and quotes in free text survive', () => {
  const got = decodeIntake(encodeIntake({
    ...SAMPLE,
    title: 'Café renovation — "phase 2" · 60% done',
    client: "O'Brien & Sons",
  }));
  eq(got.title, 'Café renovation — "phase 2" · 60% done');
  eq(got.client, "O'Brien & Sons");
});

t('a job with nothing filled in still round-trips', () => {
  const got = decodeIntake(encodeIntake({}));
  eq(got.quotedTotal, 0);
  eq(got.changes.length, 0);
  for (const c of INTAKE_CATEGORIES) eq(got.budget[c], 0);
});

t('malformed input returns null instead of throwing', () => {
  for (const bad of ['', null, undefined, 'not-base64!!', 'YWJj', '{}', 42, 'eyJhIjoxfQ']) {
    eq(decodeIntake(bad), null, `input ${JSON.stringify(bad)}:`);
  }
});

t('a truncated link is rejected, not half-read', () => {
  const code = encodeIntake(SAMPLE);
  for (let n = 1; n < 20; n++) {
    eq(decodeIntake(code.slice(0, code.length - n)), null, `cut ${n} chars:`);
  }
});

t('NO single-character corruption is ever accepted', () => {
  // This is the test that matters, and the one that was missing. Tail
  // truncation always fails JSON.parse, so a truncation-only test cannot fail
  // and proves nothing. A character altered in transit — a chat client eating
  // one, someone retyping by hand — used to be accepted 408 ways, 90 of which
  // silently carried DIFFERENT money into a report shown to the contractor.
  const code = encodeIntake(SAMPLE);
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let accepted = 0;
  for (let i = 0; i < code.length; i++) {
    for (const ch of alphabet) {
      if (ch === code[i]) continue;
      if (decodeIntake(code.slice(0, i) + ch + code.slice(i + 1)) !== null) accepted++;
    }
  }
  eq(accepted, 0, `${accepted} corrupted links were accepted — each can carry wrong money:`);
});

t('a valid link still decodes after all that', () => {
  eq(decodeIntake(encodeIntake(SAMPLE)).quotedTotal, 42000);
});

t('a link from a future version is refused', () => {
  const bytes = new TextEncoder().encode(JSON.stringify([99, 'x', '', 0, [0,0,0,0,0], [0,0,0,0,0], []]));
  let bin = ''; for (const b of bytes) bin += String.fromCharCode(b);
  const code = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  eq(decodeIntake(code), null,
    'an unknown version must be refused, never guessed at — the numbers are money');
});

t('readIntakeFrom accepts a full URL, a fragment, or a bare code', () => {
  const code = encodeIntake(SAMPLE);
  const forms = [
    code,
    `#j=${code}`,
    `j=${code}`,
    `https://example.com/quoteforge/intake.html#j=${code}`,
    `  https://example.com/intake.html#j=${code}  `,
  ];
  for (const form of forms) {
    const got = readIntakeFrom(form);
    ok(got !== null, `failed to read: ${form.slice(0, 40)}…`);
    eq(got.quotedTotal, 42000, `from ${form.slice(0, 30)}…:`);
  }
  eq(readIntakeFrom('https://example.com/nothing-here'), null);
});

t('cents are preserved and junk numbers are neutralised', () => {
  const got = decodeIntake(encodeIntake({
    ...SAMPLE,
    quotedTotal: '42000.49',
    budget: { labor: NaN, material: '9412.07', subcontractor: null, equipment: undefined },
  }));
  // Contractors type figures off a bank statement, so two decimals must survive
  // exactly. Anything that is not a number becomes zero rather than travelling
  // as NaN and poisoning the audit downstream.
  eq(got.quotedTotal, 42000.49);
  eq(got.budget.material, 9412.07, 'cents must survive the trip:');
  eq(got.budget.labor, 0, 'NaN must not travel:');
  eq(got.budget.subcontractor, 0);
  eq(got.budget.equipment, 0);
});

t('an absurd number of changes is capped rather than blowing up the link', () => {
  const many = Array.from({ length: 200 }, (_, i) => ({ title: `c${i}`, amount: 10, signed: false }));
  eq(decodeIntake(encodeIntake({ ...SAMPLE, changes: many })).changes.length, 40);
});

/**
 * Build a link the way an ATTACKER would: by hand, never through encodeIntake.
 * Testing caps only via the encoder proves nothing, because a hostile payload
 * was never encoded by us in the first place.
 */
function forge(payload) {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  let bin = ''; for (const b of bytes) bin += String.fromCharCode(b);
  const body = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  let h = 0x811c9dc5;
  for (let i = 0; i < body.length; i++) { h ^= body.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let sum = ''; for (let i = 0; i < 4; i++) sum += abc[(h >>> (i * 6)) & 63];
  return sum + body;
}

t('the DECODER enforces its own caps against a hand-forged link', () => {
  const hostile = forge([2, 'x'.repeat(20000), 'y'.repeat(20000), 5,
    [0, 0, 0, 0, 0], [0, 0, 0, 0, 0],
    Array.from({ length: 5000 }, (_, i) => [`c${i}`.repeat(500), 1, 0])]);
  const got = decodeIntake(hostile);
  // Either refused outright for size, or accepted with every cap applied —
  // never accepted whole.
  if (got !== null) {
    ok(got.title.length <= 120, `title came through at ${got.title.length} chars`);
    ok(got.changes.length <= 40, `${got.changes.length} changes came through`);
    ok(got.changes.every((c) => c.title.length <= 120), 'a change title exceeded the cap');
  }
  ok(got === null || got.changes.length <= 40);
});

t('absurd money magnitudes cannot reach the arithmetic', () => {
  const got = decodeIntake(forge([2, 'j', '', 1e308, [1e308, 0, 0, 0, 0], [0, 0, 0, 0, 0],
    [['c', 1e308, 1]]]));
  if (got !== null) {
    ok(Number.isFinite(got.quotedTotal) && Math.abs(got.quotedTotal) <= 1e12,
      `quotedTotal came through as ${got.quotedTotal}`);
    ok(Number.isFinite(got.budget.labor) && Math.abs(got.budget.labor) <= 1e12);
    ok(got.changes.every((c) => Number.isFinite(c.amount) && Math.abs(c.amount) <= 1e12));
  }
});

t('a link longer than any real job is refused before parsing', () => {
  eq(decodeIntake('A'.repeat(20000)), null);
});

console.log(`\n  intake link: ${passed} passed, ${failed} failed\n`);
if (failed) { failures.forEach((f) => console.log(`  FAIL  ${f}\n`)); process.exit(1); }
