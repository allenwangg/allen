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
  priceChangeOrder, summarizeContract, newChangeOrder, compareActuals, allocateLinePrices,
  solveDiscountForTotal, summarizePortfolio,
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


/* -------------------------------------------------------- job costing ----- */

function costedJob(actuals = [], orders = []) {
  return {
    items: [
      { id: '1', qty: 40, unitCost: 60, category: 'labor', markup: null },     // $2400
      { id: '2', qty: 1, unitCost: 4000, category: 'material', markup: null }, // $4000
    ],
    changeOrders: orders,
    actuals,
  };
}

t('an untouched job reports its full budget and zero spend', () => {
  const c = compareActuals(costedJob(), S);
  eq(c.budgetCents, 640000);
  eq(c.spentCents, 0);
  eq(c.overrunCents, 0);
  eq(c.adjustedProfitCents, c.estimatedProfitCents,
    'with nothing spent, profit should be untouched:');
  ok(Number.isFinite(c.adjustedMargin));
});

t('spend rolls up per category', () => {
  const c = compareActuals(costedJob([
    { id: 'a', date: '2026-08-01', category: 'labor', description: 'Week 1 payroll', amount: 1100 },
    { id: 'b', date: '2026-08-02', category: 'labor', description: 'Week 2 payroll', amount: 900 },
    { id: 'c', date: '2026-08-03', category: 'material', description: 'Lumber', amount: 1500 },
  ]), S);
  eq(c.byCategory.labor.spentCents, 200000);
  eq(c.byCategory.material.spentCents, 150000);
  eq(c.spentCents, 350000);
  eq(c.overrunCents, 0, 'nothing is over budget yet:');
});

t('an overrun erodes profit dollar for dollar', () => {
  const base = compareActuals(costedJob(), S);
  const c = compareActuals(costedJob([
    { id: 'a', date: '2026-08-01', category: 'labor', description: 'Payroll', amount: 3000 },
  ]), S);
  eq(c.byCategory.labor.overrunCents, 60000, '$3000 spent against a $2400 labor budget:');
  eq(c.adjustedProfitCents, base.estimatedProfitCents - 60000);
  ok(c.adjustedMargin < c.estimatedMargin);
});

t('underspend in one category does not hide an overrun in another', () => {
  // $600 over on labor, $3900 "under" on material (not yet bought).
  const c = compareActuals(costedJob([
    { id: 'a', date: '2026-08-01', category: 'labor', description: 'Payroll', amount: 3000 },
    { id: 'b', date: '2026-08-02', category: 'material', description: 'First order', amount: 100 },
  ]), S);
  eq(c.overrunCents, 60000,
    'unbought material must not be netted against a real labor overrun:');
});

t('a refund nets against its category', () => {
  const c = compareActuals(costedJob([
    { id: 'a', date: '2026-08-01', category: 'material', description: 'Tile order', amount: 2000 },
    { id: 'b', date: '2026-08-05', category: 'material', description: 'Returned pallet', amount: -350 },
  ]), S);
  eq(c.byCategory.material.spentCents, 165000);
});

t('approved change orders raise the budget; unapproved ones do not', () => {
  const coItems = [{ id: 'x', qty: 10, unitCost: 100, category: 'labor', markup: null }];
  const approved = compareActuals(costedJob([], [
    { id: 'c1', number: 'CO-01', status: 'approved', items: coItems },
  ]), S);
  const pending = compareActuals(costedJob([], [
    { id: 'c1', number: 'CO-01', status: 'sent', items: coItems },
  ]), S);
  const none = compareActuals(costedJob(), S);
  eq(approved.byCategory.labor.budgetCents, none.byCategory.labor.budgetCents + 100000,
    'an approved change should fund its own spend:');
  eq(pending.byCategory.labor.budgetCents, none.byCategory.labor.budgetCents,
    'spending against an unsigned change has no budget behind it:');
});

t('spend in an unknown category lands in other instead of vanishing', () => {
  const c = compareActuals(costedJob([
    { id: 'a', date: '2026-08-01', category: 'misc-typo', description: 'Fees', amount: 250 },
  ]), S);
  eq(c.byCategory.other.spentCents, 25000);
  eq(c.spentCents, 25000, 'no entry may fall out of the totals:');
});

t('entries come back sorted newest first', () => {
  const c = compareActuals(costedJob([
    { id: 'a', date: '2026-08-01', category: 'labor', description: 'old', amount: 10 },
    { id: 'b', date: '2026-08-20', category: 'labor', description: 'new', amount: 10 },
    { id: 'c', date: '2026-08-10', category: 'labor', description: 'mid', amount: 10 },
  ]), S);
  eq(c.entries.map((e) => e.description).join(','), 'new,mid,old');
});

t('same-day entries put the most recently logged first', () => {
  // Three receipts logged the same day: the one just typed must top the grid,
  // or every edit aimed at "the new row" silently hits the oldest one.
  const c = compareActuals(costedJob([
    { id: 'a', date: '2026-08-15', category: 'labor', description: 'first', amount: 10 },
    { id: 'b', date: '2026-08-15', category: 'labor', description: 'second', amount: 10 },
    { id: 'c', date: '2026-08-15', category: 'labor', description: 'third', amount: 10 },
  ]), S);
  eq(c.entries.map((e) => e.description).join(','), 'third,second,first');
});

t('a job with no estimate lines but real spend still reports sanely', () => {
  const c = compareActuals({ items: [], actuals: [
    { id: 'a', date: '2026-08-01', category: 'labor', description: 'Payroll', amount: 500 },
  ] }, S);
  eq(c.budgetCents, 0);
  eq(c.spentCents, 50000);
  eq(c.overrunCents, 50000, 'all spend against no budget is all overrun:');
  ok(Number.isFinite(c.adjustedMargin), 'margin must stay finite with zero revenue');
});

/* ------------------------------------------------- line allocation ------- */

t('allocated line prices sum to the target exactly', () => {
  for (const [lines, target] of [
    [[100, 200, 700], 1234], [[1], 999999], [[333, 333, 333], 1000],
    [[-500, -200], -777], [[0, 0], 500], [[7], 7],
  ]) {
    const out = allocateLinePrices(lines, target);
    eq(out.reduce((a, b) => a + b, 0), target, `lines ${lines} -> ${target}:`);
    eq(out.length, lines.length);
    ok(out.every(Number.isInteger), 'allocation produced fractional cents');
  }
});

t('allocation is proportional, not flat', () => {
  const out = allocateLinePrices([100, 900], 2000);
  ok(out[1] > out[0] * 5, `a 9x bigger line should get ~9x the allocation, got ${out}`);
});

t('allocation of an empty scope is empty, not a crash', () => {
  eq(allocateLinePrices([], 500).length, 0);
});

t('property: allocation always reconciles across random shapes', () => {
  let seed = 99;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < 300; i++) {
    const n = 1 + Math.floor(rnd() * 12);
    const lines = Array.from({ length: n }, () => Math.round((rnd() - 0.2) * 500000));
    const target = Math.round((rnd() - 0.2) * 2000000);
    const out = allocateLinePrices(lines, target);
    eq(out.reduce((a, b) => a + b, 0), target, `iter ${i}:`);
  }
});

/* --------------------------------------------------- discount solver ----- */

t('back-solving a target total lands on it, tax included', () => {
  const est = { items: [{ id: '1', qty: 1, unitCost: 10000, category: 'material', markup: null }] };
  for (const [mode, rate] of [['all', 0.0725], ['materials', 0.09], ['none', 0]]) {
    const settings = { ...S, taxMode: mode, taxRate: rate };
    for (const target of [1234567, 100000, 500000]) {
      const d = solveDiscountForTotal(est, settings, target);
      ok(d !== null, `${mode}/${target}: solver gave up on a reachable target`);
      const got = priceEstimate({ ...est, discount: { type: 'fixed', value: d / 100 } }, settings).totalCents;
      ok(Math.abs(got - target) <= 1,
        `${mode} tax ${rate}: asked ${target}, landed ${got} (naive subtraction is what misses here)`);
    }
  }
});

t('a target above the undiscounted total is refused, not faked', () => {
  const est = { items: [{ id: '1', qty: 1, unitCost: 100, category: 'labor', markup: null }] };
  eq(solveDiscountForTotal(est, S, 99999999), null);
  eq(solveDiscountForTotal(est, S, -5), null, 'a negative target is not a discount');
});

t('a target equal to the current total needs no discount', () => {
  const est = { items: [{ id: '1', qty: 4, unitCost: 250, category: 'labor', markup: null }] };
  const total = priceEstimate(est, S).totalCents;
  eq(solveDiscountForTotal(est, S, total), 0);
});

t('property: the discount solver hits arbitrary targets', () => {
  let seed = 4242;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < 60; i++) {
    const est = { items: [
      { id: '1', qty: 1 + Math.floor(rnd() * 20), unitCost: 50 + Math.round(rnd() * 900), category: 'labor', markup: null },
      { id: '2', qty: 1, unitCost: 100 + Math.round(rnd() * 3000), category: 'material', markup: null },
    ] };
    const settings = { ...S, taxRate: rnd() * 0.12, overhead: rnd() * 0.2, contingency: rnd() * 0.1 };
    const full = priceEstimate(est, settings).totalCents;
    const target = Math.round(full * (0.3 + rnd() * 0.6));
    const d = solveDiscountForTotal(est, settings, target);
    ok(d !== null, `iter ${i}: unreachable target inside range`);
    const got = priceEstimate({ ...est, discount: { type: 'fixed', value: d / 100 } }, settings).totalCents;
    ok(Math.abs(got - target) <= 1, `iter ${i}: asked ${target}, landed ${got}`);
  }
});

/* ------------------------------------------------ audit-found math ------- */

t('a percent discount over 100% cannot drive the job negative', () => {
  const est = { items: [{ id: '1', qty: 1, unitCost: 1000, category: 'labor', markup: null }] };
  for (const value of [1.5, 3, 99]) {
    const p = priceEstimate({ ...est, discount: { type: 'percent', value } }, S);
    ok(p.totalCents >= 0, `a ${value * 100}% discount produced ${p.totalCents}`);
    ok(p.afterDiscountCents >= 0);
  }
});

t('a negative discount is treated as no discount', () => {
  const est = { items: [{ id: '1', qty: 1, unitCost: 1000, category: 'labor', markup: null }] };
  const plain = priceEstimate(est, S).totalCents;
  eq(priceEstimate({ ...est, discount: { type: 'fixed', value: -500 } }, S).totalCents, plain,
    'a negative discount must not inflate the job:');
});

t('a payment schedule never prints a negative milestone', () => {
  const over = buildSchedule(100000, [
    { label: 'A', percent: 0.7 }, { label: 'B', percent: 0.7 }, { label: 'C', percent: 0.7 },
  ]);
  ok(over.every((m) => m.amountCents >= 0),
    `over-allocated schedule produced ${over.map((m) => m.amountCents)}`);
  eq(over.reduce((a, m) => a + m.amountCents, 0), 100000, 'and it must still reconcile:');
});

t('a credit job schedule stays negative and still reconciles', () => {
  const s = buildSchedule(-50000, [{ label: 'A', percent: 0.5 }, { label: 'B', percent: 0.5 }]);
  ok(s.every((m) => m.amountCents <= 0), 'a credit should not produce positive payments');
  eq(s.reduce((a, m) => a + m.amountCents, 0), -50000);
});

t('contract margin uses a pre-tax basis on both halves', () => {
  const items = [{ id: '1', qty: 1, unitCost: 5000, category: 'material', markup: null }];
  const co = { id: 'c', number: 'CO-01', status: 'approved',
    items: [{ id: 'x', qty: 1, unitCost: 2000, category: 'material', markup: null }] };
  const taxed = { ...S, taxMode: 'all', taxRate: 0.10 };
  const c = summarizeContract({ items, changeOrders: [co] }, taxed);

  ok(c.approvedPreTaxCents < c.approvedTotalCents,
    'the pre-tax figure should exclude collected sales tax');
  // Sales tax is collected and remitted, so it must not dilute margin: the
  // margin with tax on should match the margin with tax off.
  const untaxed = summarizeContract({ items, changeOrders: [co] }, { ...S, taxMode: 'none', taxRate: 0 });
  near(c.contractMargin, untaxed.contractMargin, 1e-9,
    'sales tax must not change the margin the contractor earns:');
});

/* ------------------------------------------------------- portfolio ------- */

/** A job as createAuditJob would build it, without needing the Store. */
function auditedJob(title, quoted, budget, spent, changes = []) {
  const overhead = S.overhead;
  const budgetTotal = Object.values(budget).reduce((a, b) => a + Math.max(0, b), 0);
  const burdened = budgetTotal * (1 + overhead);
  const markup = burdened > 0 ? (quoted - burdened) / burdened : 0;
  return {
    id: title, title, isAudit: true,
    settings: { contingency: 0, taxMode: 'none', taxRate: 0, overhead },
    items: Object.entries(budget).filter(([, v]) => v > 0).map(([c, v], i) => ({
      id: `${title}-${i}`, description: c, category: c, unit: 'ls', qty: 1, unitCost: v, markup,
    })),
    actuals: Object.entries(spent).map(([c, v], i) => ({
      id: `${title}-a${i}`, date: '2026-08-01', category: c, description: c, amount: v,
    })),
    changeOrders: changes.map(([t, amount, signed], i) => ({
      id: `${title}-c${i}`, number: `CO-0${i + 1}`, title: t,
      status: signed ? 'approved' : 'draft', items: [{
        id: `${title}-ci${i}`, description: t, category: 'labor', unit: 'ls',
        qty: 1, unitCost: amount / (1 + overhead), markup: 0,
      }],
    })),
  };
}

t('a portfolio total equals the sum of its jobs', () => {
  const jobs = [
    auditedJob('A', 31500, { labor: 9800, material: 6200 }, { labor: 13100, material: 6850 }, [['x', 2200, false]]),
    auditedJob('B', 44000, { labor: 14000, material: 11000 }, { labor: 17800, material: 11400 }, [['y', 900, true]]),
    auditedJob('C', 19000, { labor: 6000, material: 7000 }, { labor: 7900, material: 7200 }),
  ];
  const pf = summarizePortfolio(jobs, S);
  eq(pf.count, 3);
  eq(pf.foundCents, pf.jobs.reduce((a, j) => a + j.foundCents, 0),
    'the headline must equal the job rows beneath it:');
  eq(pf.foundCents, pf.leaks.reduce((a, l) => a + l.cents, 0),
    'and it must equal the leak breakdown too:');
  ok(pf.revenueCents > 0 && Number.isFinite(pf.foundShare));
});

t('jobs are ordered worst first', () => {
  const pf = summarizePortfolio([
    auditedJob('small', 19000, { labor: 6000 }, { labor: 6100 }),
    auditedJob('big', 31500, { labor: 9800 }, { labor: 16000 }),
  ], S);
  ok(pf.jobs[0].foundCents >= pf.jobs[1].foundCents,
    'a report should meet the reader with the costliest job first');
});

t('one catastrophic job is NOT diagnosed as a habit', () => {
  const clean = { labor: 10000, material: 8000 };
  const pf = summarizePortfolio([
    auditedJob('bad', 30000, clean, { labor: 24000, material: 8000 }),
    auditedJob('ok1', 30000, clean, { labor: 10000, material: 8000 }),
    auditedJob('ok2', 30000, clean, { labor: 10000, material: 8000 }),
  ], S);
  eq(pf.systematic, false, 'one bad job must not be reported as a recurring habit:');
  eq(pf.jobsAffected, 1);
  ok(pf.concentration > 0.9, `the worst job should carry almost all of it, got ${pf.concentration}`);
});

t('the same total spread across every job IS a habit', () => {
  const clean = { labor: 10000, material: 8000 };
  const pf = summarizePortfolio(['a', 'b', 'c'].map((n) =>
    auditedJob(n, 30000, clean, { labor: 14667, material: 8000 })), S);
  eq(pf.systematic, true, 'a leak on every job is the definition of systematic:');
  eq(pf.jobsAffected, 3);
  ok(pf.concentration < 0.5);
});

t('a single job is never called systematic', () => {
  const pf = summarizePortfolio([
    auditedJob('only', 30000, { labor: 10000 }, { labor: 20000 }),
  ], S);
  eq(pf.systematic, false, 'one job is not a pattern, whatever it shows:');
});

t('an empty portfolio is zeros, not NaN', () => {
  const pf = summarizePortfolio([], S);
  eq(pf.count, 0);
  eq(pf.foundCents, 0);
  ok(Number.isFinite(pf.foundShare) && Number.isFinite(pf.averageMargin));
  eq(pf.concentration, 0);
});

t('jobs with no actual costs are counted and flagged', () => {
  const pf = summarizePortfolio([
    auditedJob('with', 30000, { labor: 10000 }, { labor: 12000 }),
    auditedJob('without', 30000, { labor: 10000 }, {}),
  ], S);
  eq(pf.jobsMissingActuals, 1,
    'the report must disclose where fade could not be seen:');
  eq(pf.jobs.find((j) => j.title === 'without').fadeCents, 0);
});

t('the dominant leak is the largest one', () => {
  const pf = summarizePortfolio([
    auditedJob('a', 31500, { labor: 9800, material: 6200 }, { labor: 13100, material: 6850 }, [['x', 2200, false]]),
  ], S);
  eq(pf.dominant.cents, Math.max(...pf.leaks.map((l) => l.cents)));
  eq(pf.leaks[0].key, pf.dominant.key, 'leaks must be sorted with the dominant first:');
});


/* -------------------------------------------------------------- report ---- */

console.log(`\n  pricing engine: ${passed} passed, ${failed} failed\n`);
if (failed) {
  failures.forEach((f) => console.log(`  FAIL  ${f}\n`));
  process.exit(1);
}
