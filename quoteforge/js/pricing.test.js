/**
 * pricing.test.js — run with: node quoteforge/js/pricing.test.js
 *
 * No framework, no install step. The assertions below encode the invariants
 * that must never break, because every one of them corresponds to a way a
 * contractor can lose money without noticing.
 */
import {
  toCents, toDollars, formatMoney, markupToMargin, marginToMarkup,
  priceItem, priceEstimate, priceForTargetMargin, discountHeadroom,
  buildSchedule, defaultSettings, defaultMilestones, solveUniformMarkup, isPassThrough,
  priceChangeOrder, summarizeContract, newChangeOrder,
} from './pricing.js';

let passed = 0, failed = 0;
const failures = [];

function t(name, fn) {
  try { fn(); passed++; }
  catch (e) { failed++; failures.push(`${name}\n    ${e.message}`); }
}
function eq(actual, expected, msg = '') {
  if (actual !== expected) {
    throw new Error(`${msg} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
function near(actual, expected, tol = 1e-9, msg = '') {
  if (!(Math.abs(actual - expected) <= tol)) {
    throw new Error(`${msg} expected ~${expected}, got ${actual} (tol ${tol})`);
  }
}
function ok(cond, msg = 'assertion failed') { if (!cond) throw new Error(msg); }

/* ------------------------------------------------------------- money ------ */

t('toCents rounds half away from zero', () => {
  eq(toCents(10.005), 1001);
  eq(toCents(0.1), 10);
  eq(toCents(-2.345), -235);
  eq(toCents('12.50'), 1250);
  eq(toCents(undefined), 0);
  eq(toCents(NaN), 0);
});

t('toCents survives the classic float trap', () => {
  // 0.1 + 0.2 === 0.30000000000000004; naive cent math would drift.
  eq(toCents(0.1) + toCents(0.2), toCents(0.3));
});

t('toDollars inverts toCents', () => {
  eq(toDollars(toCents(1234.56)), 1234.56);
});

t('formatMoney groups and pads', () => {
  eq(formatMoney(123456789), '$1,234,567.89');
  eq(formatMoney(5), '$0.05');
  eq(formatMoney(-2500), '-$25.00');
  eq(formatMoney(100000, { cents: false }), '$1,000');
});

/* --------------------------------------------------- markup vs margin ----- */

t('markup 20% is margin 16.67% — the core trap', () => {
  near(markupToMargin(0.2), 1 / 6, 1e-12);
});

t('marginToMarkup inverts markupToMargin', () => {
  for (const m of [0, 0.05, 0.1, 0.25, 0.4, 0.6, 0.85]) {
    near(markupToMargin(marginToMarkup(m)), m, 1e-12, `margin ${m}`);
  }
});

t('50% margin requires 100% markup', () => {
  near(marginToMarkup(0.5), 1.0, 1e-12);
});

t('100% margin is unreachable', () => {
  eq(marginToMarkup(1), Infinity);
  eq(marginToMarkup(1.5), Infinity);
});

/* -------------------------------------------------------------- items ----- */

const S = defaultSettings();

t('priceItem applies the category markup', () => {
  const l = priceItem(
    { id: 'a', description: 'Framing labor', qty: 40, unitCost: 65, category: 'labor', markup: null },
    S,
  );
  eq(l.costCents, 260000);              // 40 * $65
  eq(l.profitCents, 117000);            // 45% labor markup
  eq(l.priceCents, 377000);
  near(l.markup, 0.45, 1e-12);
  near(l.margin, 117000 / 377000, 1e-12);
});

t('per-item markup overrides the category default', () => {
  const l = priceItem(
    { id: 'b', description: 'Tile', qty: 100, unitCost: 4.5, category: 'material', markup: 0.6 },
    S,
  );
  eq(l.costCents, 45000);
  eq(l.profitCents, 27000);
  near(l.markup, 0.6, 1e-12);
});

t('markup of exactly 0 is honored, not treated as unset', () => {
  const l = priceItem(
    { id: 'c', description: 'Permit fee', qty: 1, unitCost: 350, category: 'other', markup: 0 },
    S,
  );
  eq(l.profitCents, 0, 'a pass-through fee must not be marked up:');
  eq(l.priceCents, 35000);
});

t('fractional quantities price correctly', () => {
  const l = priceItem(
    { id: 'd', description: 'Concrete', qty: 2.5, unitCost: 142.75, category: 'material', markup: 0 },
    S,
  );
  eq(l.costCents, 35688);  // 2.5 * 14275 = 35687.5 -> 35688
});

t('taxability follows the tax mode', () => {
  const mat = { id: 'e', qty: 1, unitCost: 10, category: 'material' };
  const lab = { id: 'f', qty: 1, unitCost: 10, category: 'labor' };
  eq(priceItem(mat, { ...S, taxMode: 'materials' }).taxable, true);
  eq(priceItem(lab, { ...S, taxMode: 'materials' }).taxable, false);
  eq(priceItem(lab, { ...S, taxMode: 'all' }).taxable, true);
  eq(priceItem(mat, { ...S, taxMode: 'none' }).taxable, false);
  eq(priceItem({ ...lab, taxable: true }, { ...S, taxMode: 'none' }).taxable, true,
    'explicit per-item flag must win:');
});

/* ----------------------------------------------------------- estimate ----- */

function sampleEstimate(extra = {}) {
  return {
    items: [
      { id: '1', description: 'Demo labor', qty: 16, unitCost: 55, category: 'labor', markup: null },
      { id: '2', description: 'Lumber package', qty: 1, unitCost: 2400, category: 'material', markup: null },
      { id: '3', description: 'Electrician', qty: 1, unitCost: 1800, category: 'subcontractor', markup: null },
    ],
    ...extra,
  };
}

t('estimate totals are internally consistent', () => {
  const p = priceEstimate(sampleEstimate(), S);
  eq(p.burdenedCostCents, p.baseCostCents + p.overheadCents);
  eq(p.afterDiscountCents, p.subtotalCents + p.contingencyCents - p.discountCents);
  eq(p.totalCents, p.afterDiscountCents + p.taxCents);
});

t('gross profit reconciles exactly to price minus cost', () => {
  const p = priceEstimate(sampleEstimate(), S);
  eq(p.grossProfitCents, p.afterDiscountCents - p.contingencyCents - p.burdenedCostCents);
  near(p.margin, p.grossProfitCents / p.afterDiscountCents, 1e-12);
});

t('contingency is excluded from reported profit', () => {
  const withC = priceEstimate(sampleEstimate(), { ...S, contingency: 0.1 });
  const noC = priceEstimate(sampleEstimate(), { ...S, contingency: 0 });
  ok(withC.totalCents > noC.totalCents, 'contingency should raise the price');
  // Margin must not be inflated by money reserved for unknowns.
  ok(withC.margin < noC.margin + 1e-9,
    'reserved contingency must not be reported as earned profit');
});

t('overhead is marked up, not absorbed', () => {
  const p = priceEstimate(sampleEstimate(), { ...S, overhead: 0.1, contingency: 0 });
  const noOh = priceEstimate(sampleEstimate(), { ...S, overhead: 0, contingency: 0 });
  const addedCost = p.burdenedCostCents - noOh.burdenedCostCents;
  const addedPrice = p.subtotalCents - noOh.subtotalCents;
  ok(addedPrice > addedCost,
    'price must rise by MORE than overhead cost, or overhead eats the profit');
  // Margin should be preserved, not degraded, by carrying overhead.
  near(p.margin, noOh.margin, 1e-3, 'margin should hold when overhead is marked up:');
});

t('optional items are excluded from every total', () => {
  const base = priceEstimate(sampleEstimate(), S);
  const withOpt = priceEstimate(sampleEstimate({
    items: [
      ...sampleEstimate().items,
      { id: '4', description: 'Upgrade fixtures', qty: 1, unitCost: 900, category: 'material', markup: null, optional: true },
    ],
  }), S);
  eq(withOpt.totalCents, base.totalCents, 'optional item leaked into the total:');
  eq(withOpt.optionalLines.length, 1);
});

t('tax hits only the taxable share', () => {
  const allLabor = priceEstimate({
    items: [{ id: '1', qty: 10, unitCost: 100, category: 'labor', markup: null }],
  }, { ...S, taxMode: 'materials', taxRate: 0.1 });
  eq(allLabor.taxCents, 0, 'labor-only job under a materials-tax rule must be untaxed:');

  const allMat = priceEstimate({
    items: [{ id: '1', qty: 10, unitCost: 100, category: 'material', markup: 0 }],
  }, { ...S, taxMode: 'materials', taxRate: 0.1, overhead: 0, contingency: 0 });
  eq(allMat.taxCents, 10000, '10% of $1000:');
});

t('a percent discount comes out of profit, not out of cost', () => {
  const p = priceEstimate(sampleEstimate({ discount: { type: 'percent', value: 0.1 } }), S);
  const base = priceEstimate(sampleEstimate(), S);
  ok(p.discountCents > 0);
  eq(p.burdenedCostCents, base.burdenedCostCents, 'discounting must never reduce real cost:');
  ok(p.margin < base.margin, 'discount must visibly reduce margin');
});

t('a fixed discount cannot exceed the job', () => {
  const p = priceEstimate(sampleEstimate({ discount: { type: 'fixed', value: 999999 } }), S);
  ok(p.afterDiscountCents >= 0, 'discount must clamp at the subtotal');
});

t('an empty estimate is all zeros, not NaN', () => {
  const p = priceEstimate({ items: [] }, S);
  eq(p.totalCents, 0);
  eq(p.grossProfitCents, 0);
  eq(p.margin, 0);
  ok(Number.isFinite(p.margin), 'margin went non-finite on an empty estimate');
});

/* ------------------------------------------------------------ solvers ----- */

t('priceForTargetMargin actually lands on the target', () => {
  const cost = 100000;
  for (const target of [0.1, 0.2, 0.25, 0.4]) {
    const price = priceForTargetMargin(cost, target);
    near((price - cost) / price, target, 1e-4, `target ${target}`);
  }
});

t('target-margin markup applied to lines reproduces the target', () => {
  const target = 0.3;
  const markup = marginToMarkup(target);
  const p = priceEstimate({
    items: [
      { id: '1', qty: 10, unitCost: 100, category: 'labor', markup },
      { id: '2', qty: 5, unitCost: 200, category: 'material', markup },
    ],
  }, { ...S, contingency: 0, overhead: 0.15 });
  near(p.margin, target, 1e-3, 'uniform target markup should hit target margin:');
});

t('discountHeadroom finds the true negotiating floor', () => {
  const p = priceEstimate(sampleEstimate(), { ...S, contingency: 0 });
  const h = discountHeadroom(p, 0.1);
  ok(!h.underwater, 'a healthy job should not report underwater');
  ok(h.headroomCents > 0);
  // Discounting by exactly the headroom should land on the floor margin.
  const discounted = priceEstimate(
    sampleEstimate({ discount: { type: 'fixed', value: toDollars(h.headroomCents) } }),
    { ...S, contingency: 0 },
  );
  near(discounted.margin, 0.1, 5e-3, 'spending all headroom should land on the floor:');
});

t('discountHeadroom flags an underwater job', () => {
  const p = priceEstimate(
    sampleEstimate({ discount: { type: 'percent', value: 0.5 } }),
    { ...S, contingency: 0 },
  );
  const h = discountHeadroom(p, 0.1);
  ok(h.underwater, 'a 50% discount must be reported as underwater');
});

/* ----------------------------------------------------------- schedule ----- */

t('payment schedule sums to the total exactly', () => {
  for (const total of [100000, 333333, 1, 999999999, 7]) {
    const rows = buildSchedule(total, defaultMilestones());
    const summed = rows.reduce((a, r) => a + r.amountCents, 0);
    eq(summed, total, `schedule for ${total} did not reconcile:`);
  }
});

t('schedule handles a single 100% milestone', () => {
  const rows = buildSchedule(50000, [{ label: 'Due on completion', percent: 1 }]);
  eq(rows.length, 1);
  eq(rows[0].amountCents, 50000);
});

/* ------------------------------------------------------- property check --- */

t('property: totals reconcile across 500 random estimates', () => {
  let seed = 42;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const cats = ['labor', 'material', 'subcontractor', 'equipment', 'other'];

  for (let i = 0; i < 500; i++) {
    const items = Array.from({ length: 1 + Math.floor(rnd() * 8) }, (_, j) => ({
      id: String(j),
      qty: Math.round(rnd() * 100 * 100) / 100,
      unitCost: Math.round(rnd() * 5000 * 100) / 100,
      category: cats[Math.floor(rnd() * cats.length)],
      markup: rnd() < 0.3 ? Math.round(rnd() * 200) / 100 : null,
      optional: rnd() < 0.15,
    }));
    const est = {
      items,
      discount: rnd() < 0.3 ? { type: rnd() < 0.5 ? 'percent' : 'fixed', value: rnd() * 0.2 } : null,
    };
    const settings = {
      ...S,
      overhead: rnd() * 0.3,
      contingency: rnd() * 0.15,
      taxRate: rnd() * 0.12,
      taxMode: ['none', 'all', 'materials', 'materials_equipment'][Math.floor(rnd() * 4)],
    };
    const p = priceEstimate(est, settings);

    eq(p.totalCents, p.afterDiscountCents + p.taxCents, `iter ${i} total:`);
    eq(p.burdenedCostCents, p.baseCostCents + p.overheadCents, `iter ${i} cost:`);
    ok(Number.isFinite(p.margin), `iter ${i}: margin was ${p.margin}`);
    ok(Number.isInteger(p.totalCents), `iter ${i}: total was fractional cents (${p.totalCents})`);
    ok(p.taxCents >= 0, `iter ${i}: negative tax`);

    const sched = buildSchedule(p.totalCents, defaultMilestones());
    eq(sched.reduce((a, r) => a + r.amountCents, 0), p.totalCents, `iter ${i} schedule:`);
  }
});


/* --------------------------------------------- uniform markup solver ----- */

t('solveUniformMarkup hits the target with contingency in play', () => {
  const est = {
    items: [
      { id: '1', qty: 20, unitCost: 60, category: 'labor', markup: null },
      { id: '2', qty: 1, unitCost: 3000, category: 'material', markup: null },
    ],
  };
  const settings = { ...S, contingency: 0.05, overhead: 0.1 };
  const m = solveUniformMarkup(est, settings, 0.25);
  const applied = priceEstimate(
    { items: est.items.map((i) => ({ ...i, markup: m })) }, settings,
  );
  near(applied.margin, 0.25, 1e-4, 'solver missed the target with contingency:');
});

t('solveUniformMarkup compensates for zero-markup pass-throughs', () => {
  const est = {
    items: [
      { id: '1', qty: 20, unitCost: 60, category: 'labor', markup: null },
      { id: '2', qty: 1, unitCost: 850, category: 'other', markup: 0 },   // permit
      { id: '3', qty: 1, unitCost: 1400, category: 'other', markup: 0 },  // engineer
    ],
  };
  const settings = { ...S, contingency: 0.05, overhead: 0.1 };
  const m = solveUniformMarkup(est, settings, 0.25);
  ok(m !== null, 'solver should find a markup');

  const applied = priceEstimate({
    items: est.items.map((i) => (isPassThrough(i) ? i : { ...i, markup: m })),
  }, settings);
  near(applied.margin, 0.25, 1e-4, 'solver did not compensate for pass-throughs:');

  // The pass-throughs must still carry no profit of their own.
  const permit = applied.lines.find((l) => l.costCents === 85000);
  eq(permit.profitCents, 0, 'a pass-through was marked up:');
  // And the markup must exceed the naive answer, since fewer lines carry the load.
  ok(m > marginToMarkup(0.25),
    `solver returned ${m}, which is not above the naive ${marginToMarkup(0.25)}`);
});

t('solveUniformMarkup handles a discounted estimate', () => {
  const est = {
    items: [{ id: '1', qty: 10, unitCost: 200, category: 'labor', markup: null }],
    discount: { type: 'percent', value: 0.1 },
  };
  const m = solveUniformMarkup(est, S, 0.3);
  const applied = priceEstimate({ ...est, items: [{ ...est.items[0], markup: m }] }, S);
  near(applied.margin, 0.3, 1e-4, 'solver ignored the discount:');
});

t('solveUniformMarkup reports an impossible target instead of guessing', () => {
  // Every line is a pass-through, so no markup can move the margin.
  const est = { items: [{ id: '1', qty: 1, unitCost: 500, category: 'other', markup: 0 }] };
  eq(solveUniformMarkup(est, S, 0.25), null);
  // A margin of 100% is unreachable at any finite markup.
  const ok1 = { items: [{ id: '1', qty: 1, unitCost: 500, category: 'labor', markup: null }] };
  eq(solveUniformMarkup(ok1, S, 1), null);
});

t('solveUniformMarkup returns 0 when cost alone already beats the target', () => {
  const est = { items: [{ id: '1', qty: 1, unitCost: 100, category: 'labor', markup: null }] };
  eq(solveUniformMarkup(est, { ...S, overhead: 0, contingency: 0 }, -1), 0,
    'a negative target should need no markup at all');
});

t('solver stays accurate across many random shapes', () => {
  let checked = 0;
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < 60; i++) {
    const items = Array.from({ length: 1 + Math.floor(rnd() * 5) }, (_, j) => ({
      id: String(j),
      qty: 1 + Math.round(rnd() * 40),
      unitCost: 10 + Math.round(rnd() * 900),
      category: ['labor', 'material', 'subcontractor'][Math.floor(rnd() * 3)],
      markup: rnd() < 0.25 ? 0 : null,
    }));
    if (items.every(isPassThrough)) continue;
    const settings = { ...S, overhead: rnd() * 0.2, contingency: rnd() * 0.1 };
    const target = 0.1 + rnd() * 0.4;
    const m = solveUniformMarkup({ items }, settings, target);
    ok(m !== null, `iter ${i}: solver gave up on a reachable target`);
    const applied = priceEstimate({
      items: items.map((it) => (isPassThrough(it) ? it : { ...it, markup: m })),
    }, settings);
    near(applied.margin, target, 1e-3, `iter ${i}:`);
    checked++;
  }
  ok(checked > 40, `property test was vacuous — only ${checked} cases actually ran`);
});


/* ------------------------------------------------------ change orders ----- */

function contractFixture(orders = []) {
  return {
    items: [
      { id: '1', qty: 40, unitCost: 60, category: 'labor', markup: null },
      { id: '2', qty: 1, unitCost: 4000, category: 'material', markup: null },
    ],
    changeOrders: orders,
  };
}
const co = (over = {}) => ({
  id: 'co1', number: 'CO-01', status: 'draft', items: [], discount: null, ...over,
});

t('a change order prices with the parent job rules', () => {
  const order = co({ items: [{ id: 'a', qty: 8, unitCost: 55, category: 'labor', markup: null }] });
  const p = priceChangeOrder(order, S, {});
  const standalone = priceEstimate({ items: order.items }, S);
  eq(p.totalCents, standalone.totalCents, 'a change order should price like a small estimate:');
  ok(p.totalCents > 0);
});

t('an empty contract summary is all zeros, not NaN', () => {
  const c = summarizeContract({ items: [], changeOrders: [] }, S);
  eq(c.contractTotalCents, 0);
  eq(c.atRiskCents, 0);
  ok(Number.isFinite(c.contractMargin));
});

t('only approved change orders join the contract total', () => {
  const items = [{ id: 'a', qty: 10, unitCost: 100, category: 'labor', markup: null }];
  const c = summarizeContract(contractFixture([
    co({ id: 'x', status: 'approved', items }),
    co({ id: 'y', status: 'sent', items }),
    co({ id: 'z', status: 'draft', items }),
    co({ id: 'w', status: 'rejected', items }),
  ]), S);

  eq(c.approvedCount, 1);
  eq(c.unapprovedCount, 2, 'draft and sent are both unapproved:');
  eq(c.rejected.length, 1);
  ok(c.contractTotalCents > c.originalTotalCents, 'an approved order should raise the contract');

  const one = priceChangeOrder(co({ items }), S, {});
  eq(c.contractTotalCents, c.originalTotalCents + one.totalCents,
    'exactly one order should be included:');
  eq(c.atRiskCents, one.totalCents * 2, 'both unapproved orders should be at risk:');
});

t('a rejected change order is excluded from every figure', () => {
  const items = [{ id: 'a', qty: 10, unitCost: 100, category: 'labor', markup: null }];
  const withRejected = summarizeContract(contractFixture([co({ status: 'rejected', items })]), S);
  const without = summarizeContract(contractFixture([]), S);
  eq(withRejected.contractTotalCents, without.contractTotalCents);
  eq(withRejected.atRiskCents, 0, 'a rejected order is not at risk — it is simply gone:');
});

t('at-risk exposure reports cost, not just revenue', () => {
  const items = [{ id: 'a', qty: 20, unitCost: 100, category: 'labor', markup: null }];
  const c = summarizeContract(contractFixture([co({ status: 'sent', items })]), S);
  ok(c.atRiskCostCents > 0, 'the money already spent is the real exposure');
  ok(c.atRiskCostCents < c.atRiskCents, 'cost should be less than the price it would bill at');
});

t('contract profit and margin include approved orders', () => {
  const items = [{ id: 'a', qty: 20, unitCost: 100, category: 'labor', markup: null }];
  const base = summarizeContract(contractFixture([]), S);
  const grown = summarizeContract(contractFixture([co({ status: 'approved', items })]), S);
  ok(grown.contractProfitCents > base.contractProfitCents, 'approved work should add profit');
  ok(Number.isFinite(grown.contractMargin));
  near(grown.contractMargin,
    grown.contractProfitCents / (grown.base.afterDiscountCents + grown.approvedTotalCents),
    1e-9);
});

t('a credit change order reduces the contract without breaking margin', () => {
  // Client removes scope: negative quantities represent money given back.
  const credit = co({
    id: 'c', status: 'approved',
    items: [{ id: 'a', qty: -6, unitCost: 100, category: 'labor', markup: null }],
  });
  const base = summarizeContract(contractFixture([]), S);
  const c = summarizeContract(contractFixture([credit]), S);
  ok(c.contractTotalCents < base.contractTotalCents, 'a credit should lower the contract');
  ok(Number.isFinite(c.contractMargin), `margin went non-finite: ${c.contractMargin}`);
  ok(c.contractMargin > 0, 'removing scope should not make a healthy job unprofitable');
});

t('change orders do not disturb the original estimate figures', () => {
  const items = [{ id: 'a', qty: 10, unitCost: 100, category: 'labor', markup: null }];
  const plain = priceEstimate(contractFixture([]), S);
  const c = summarizeContract(contractFixture([co({ status: 'approved', items })]), S);
  eq(c.base.totalCents, plain.totalCents, 'the original contract value must not move:');
  eq(c.originalTotalCents, plain.totalCents);
});

t('newChangeOrder numbers are zero-padded and sequential', () => {
  eq(newChangeOrder(1).number, 'CO-01');
  eq(newChangeOrder(9).number, 'CO-09');
  eq(newChangeOrder(12).number, 'CO-12');
  eq(newChangeOrder(1).status, 'draft');
});

/* -------------------------------------------------------------- report ---- */

console.log(`\n  pricing engine: ${passed} passed, ${failed} failed\n`);
if (failed) {
  failures.forEach((f) => console.log(`  FAIL  ${f}\n`));
  process.exit(1);
}
