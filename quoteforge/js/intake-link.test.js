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
  eq(decodeIntake(code.slice(0, code.length - 12)), null,
    'a partial paste must fail cleanly rather than produce wrong numbers');
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
  const got = decodeIntake(encodeIntake({ ...SAMPLE, changes: many }));
  eq(got.changes.length, 40);
});

console.log(`\n  intake link: ${passed} passed, ${failed} failed\n`);
if (failed) { failures.forEach((f) => console.log(`  FAIL  ${f}\n`)); process.exit(1); }
