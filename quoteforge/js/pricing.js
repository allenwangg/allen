/**
 * pricing.js — the money math.
 *
 * This is the heart of QuoteForge and the reason it exists. Contractors lose
 * real money by confusing MARKUP with MARGIN:
 *
 *   markup = profit / cost        ("I add 20% to my costs")
 *   margin = profit / price       ("I keep 20% of the sale")
 *
 * A 20% markup yields only a 16.7% margin. A contractor who needs 20% margin
 * and applies 20% markup is short every single job, forever. Every number this
 * module produces is derived from explicit cost, so both figures are always
 * shown side by side and can never silently drift apart.
 *
 * All money is handled in integer cents internally to avoid float drift, then
 * surfaced as decimal dollars at the boundary.
 */

export const CATEGORIES = ['labor', 'material', 'subcontractor', 'equipment', 'other'];

export const CATEGORY_LABELS = {
  labor: 'Labor',
  material: 'Material',
  subcontractor: 'Subcontractor',
  equipment: 'Equipment',
  other: 'Other',
};

/* ---------------------------------------------------------------- money --- */

/** Dollars (float, possibly messy) -> integer cents. Half-away-from-zero. */
export function toCents(dollars) {
  const n = Number(dollars);
  if (!Number.isFinite(n)) return 0;
  return Math.sign(n) * Math.round(Math.abs(n) * 100);
}

/** Integer cents -> dollars as a float. */
export function toDollars(cents) {
  return (cents || 0) / 100;
}

/** Multiply cents by a ratio, rounding to whole cents. */
function scale(cents, ratio) {
  if (!Number.isFinite(ratio)) return 0;
  return Math.sign(cents * ratio) * Math.round(Math.abs(cents * ratio));
}

export function formatMoney(cents, { symbol = '$', cents: showCents = true } = {}) {
  const neg = cents < 0;
  const abs = Math.abs(cents || 0);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  const grouped = whole.toLocaleString('en-US');
  const body = showCents ? `${grouped}.${String(frac).padStart(2, '0')}` : grouped;
  return `${neg ? '-' : ''}${symbol}${body}`;
}

export function formatPercent(ratio, digits = 1) {
  if (!Number.isFinite(ratio)) return '—';
  return `${(ratio * 100).toFixed(digits)}%`;
}

/* ------------------------------------------------- markup <-> margin ------ */

/**
 * Convert a markup ratio (profit/cost) to a margin ratio (profit/price).
 * 0.20 markup -> 0.1667 margin.
 */
export function markupToMargin(markup) {
  if (!Number.isFinite(markup) || markup <= -1) return NaN;
  return markup / (1 + markup);
}

/**
 * Convert a target margin ratio to the markup ratio required to hit it.
 * 0.20 margin -> 0.25 markup. This is the number contractors actually need
 * and almost never compute correctly by hand.
 */
export function marginToMarkup(margin) {
  if (!Number.isFinite(margin) || margin >= 1) return Infinity;
  return margin / (1 - margin);
}

/* ------------------------------------------------------------- items ------ */

/**
 * Price a single line item.
 *
 * @param {object} item
 * @param {number} item.qty
 * @param {number} item.unitCost      dollars per unit, what YOU pay
 * @param {string} item.category
 * @param {number|null} item.markup   ratio override; null = use category default
 * @param {boolean} item.taxable      overrides the category tax rule when set
 * @param {object} settings
 * @returns {object} priced line
 */
export function priceItem(item, settings) {
  const qty = Number(item.qty) || 0;
  const unitCostCents = toCents(item.unitCost);
  const cost = scale(unitCostCents, qty);

  const markup = resolveMarkup(item, settings);
  const profit = scale(cost, markup);
  const price = cost + profit;

  return {
    id: item.id,
    description: item.description,
    category: item.category,
    trade: item.trade || '',
    note: item.note || '',
    qty,
    unit: item.unit,
    unitCostCents,
    unitPriceCents: qty === 0 ? 0 : Math.round(price / qty),
    costCents: cost,
    profitCents: profit,
    priceCents: price,
    markup,
    margin: price === 0 ? 0 : profit / price,
    taxable: isTaxable(item, settings),
    optional: !!item.optional,
  };
}

/** Resolve the effective markup ratio for an item. */
export function resolveMarkup(item, settings) {
  if (item.markup !== null && item.markup !== undefined && item.markup !== '') {
    const m = Number(item.markup);
    if (Number.isFinite(m)) return m;
  }
  const byCat = settings.categoryMarkup?.[item.category];
  if (Number.isFinite(byCat)) return byCat;
  return Number(settings.defaultMarkup) || 0;
}

/** Whether an item is subject to sales tax under the current settings. */
export function isTaxable(item, settings) {
  if (item.taxable === true || item.taxable === false) return item.taxable;
  switch (settings.taxMode) {
    case 'none': return false;
    case 'all': return true;
    case 'materials': return item.category === 'material';
    case 'materials_equipment': return item.category === 'material' || item.category === 'equipment';
    default: return false;
  }
}

/* ------------------------------------------------------------ estimate ---- */

/**
 * Price a whole estimate.
 *
 * Order of operations matters and is deliberate:
 *   1. line cost      (qty x unit cost)
 *   2. overhead       (a % of cost — your trucks, insurance, phone)
 *   3. markup         (applied to cost+overhead, so overhead is not eaten)
 *   4. contingency    (a % of the marked-up subtotal, for unknowns)
 *   5. discount       (comes straight out of YOUR profit — shown as such)
 *   6. tax            (on taxable lines only, after discount is prorated)
 *
 * Optional items are priced but excluded from every total until accepted.
 */
export function priceEstimate(estimate, settings) {
  const s = { ...defaultSettings(), ...settings, ...(estimate.settings || {}) };
  const lines = (estimate.items || []).map((it) => priceItem(it, s));
  const included = lines.filter((l) => !l.optional);

  const baseCost = sum(included, 'costCents');

  const overheadRatio = Number(s.overhead) || 0;
  const overheadCents = scale(baseCost, overheadRatio);

  // Overhead behaves as a cost: it must be marked up too, or you are working
  // for free on the portion of the job that keeps the lights on.
  const burdenedCost = baseCost + overheadCents;
  const lineProfit = sum(included, 'profitCents');
  const overheadProfit = scale(overheadCents, weightedMarkup(included, s));
  const subtotal = burdenedCost + lineProfit + overheadProfit;

  const contingencyRatio = Number(s.contingency) || 0;
  const contingencyCents = scale(subtotal, contingencyRatio);

  const preDiscount = subtotal + contingencyCents;
  const discountCents = resolveDiscount(estimate, preDiscount);
  const afterDiscount = preDiscount - discountCents;

  // Tax applies to the taxable share of the job, after the discount has been
  // prorated across it — this is how state tax authorities expect it.
  const taxableBase = sum(included.filter((l) => l.taxable), 'priceCents');
  const taxableShare = subtotal === 0 ? 0 : taxableBase / subtotal;
  const taxableAfterDiscount = scale(afterDiscount, taxableShare);
  const taxRate = Number(s.taxRate) || 0;
  const taxCents = scale(taxableAfterDiscount, taxRate);

  const total = afterDiscount + taxCents;

  // True profit: what is left after every real cost is paid. Contingency is
  // counted as profit only if unspent, so it is reported separately and
  // deliberately NOT folded into the headline margin.
  const trueCost = burdenedCost;
  const grossProfit = afterDiscount - contingencyCents - trueCost;
  const margin = afterDiscount === 0 ? 0 : grossProfit / afterDiscount;
  const effMarkup = trueCost === 0 ? 0 : grossProfit / trueCost;

  return {
    lines,
    optionalLines: lines.filter((l) => l.optional),
    baseCostCents: baseCost,
    overheadCents,
    burdenedCostCents: burdenedCost,
    subtotalCents: subtotal,
    contingencyCents,
    discountCents,
    afterDiscountCents: afterDiscount,
    taxableBaseCents: taxableAfterDiscount,
    taxCents,
    taxRate,
    totalCents: total,
    grossProfitCents: grossProfit,
    margin,
    markup: effMarkup,
    byCategory: rollupByCategory(included),
    breakEvenCents: trueCost,
    settings: s,
  };
}

function sum(rows, key) {
  return rows.reduce((acc, r) => acc + (r[key] || 0), 0);
}

/**
 * The cost-weighted average markup across included lines. Used so that
 * overhead earns the same markup the job as a whole earns, rather than an
 * arbitrary default.
 */
function weightedMarkup(lines, settings) {
  const cost = sum(lines, 'costCents');
  if (cost === 0) return Number(settings.defaultMarkup) || 0;
  return sum(lines, 'profitCents') / cost;
}

function resolveDiscount(estimate, base) {
  const d = estimate.discount;
  if (!d || !d.value) return 0;
  if (d.type === 'percent') return scale(base, Number(d.value) || 0);
  return Math.min(base, toCents(d.value));
}

function rollupByCategory(lines) {
  const out = {};
  for (const cat of CATEGORIES) {
    const rows = lines.filter((l) => l.category === cat);
    if (!rows.length) continue;
    const costCents = sum(rows, 'costCents');
    const priceCents = sum(rows, 'priceCents');
    out[cat] = {
      count: rows.length,
      costCents,
      priceCents,
      profitCents: priceCents - costCents,
      margin: priceCents === 0 ? 0 : (priceCents - costCents) / priceCents,
    };
  }
  return out;
}

/* ------------------------------------------------------------- solvers ---- */

/**
 * What uniform markup must every line carry for the job to land on a target
 * margin? Solved directly rather than iteratively: with overhead folded in,
 * price = burdenedCost / (1 - targetMargin), so the markup on burdened cost
 * is exactly marginToMarkup(target). Contingency and tax do not participate
 * because neither is profit.
 */
export function markupForTargetMargin(targetMargin) {
  return marginToMarkup(targetMargin);
}

/**
 * The price this job must sell at to hit a target margin, given its costs.
 * Returns cents.
 */
export function priceForTargetMargin(burdenedCostCents, targetMargin) {
  if (!Number.isFinite(targetMargin) || targetMargin >= 1) return Infinity;
  return Math.round(burdenedCostCents / (1 - targetMargin));
}

/**
 * How much room is there to discount before the job stops clearing a floor
 * margin? This is the single most useful number in a negotiation and the one
 * contractors most often guess at.
 */
export function discountHeadroom(priced, floorMargin = 0) {
  const floorPrice = priceForTargetMargin(priced.burdenedCostCents, floorMargin);
  const headroom = priced.afterDiscountCents - priced.contingencyCents - floorPrice;
  return {
    floorPriceCents: floorPrice,
    headroomCents: Math.max(0, headroom),
    headroomRatio: priced.afterDiscountCents === 0
      ? 0
      : Math.max(0, headroom) / priced.afterDiscountCents,
    underwater: headroom < 0,
  };
}

/* --------------------------------------------------- payment schedule ----- */

/**
 * Build a payment schedule from a set of milestone percentages. The final
 * milestone absorbs any rounding remainder so the parts always sum exactly to
 * the total — an off-by-a-penny schedule reads as sloppy on a signed contract.
 */
export function buildSchedule(totalCents, milestones) {
  const rows = [];
  let allocated = 0;
  milestones.forEach((m, i) => {
    const isLast = i === milestones.length - 1;
    const amount = isLast
      ? totalCents - allocated
      : scale(totalCents, Number(m.percent) || 0);
    allocated += amount;
    rows.push({
      label: m.label,
      percent: totalCents === 0 ? 0 : amount / totalCents,
      amountCents: amount,
      due: m.due || '',
    });
  });
  return rows;
}

export function defaultMilestones() {
  return [
    { label: 'Deposit — due at signing', percent: 0.3, due: 'On acceptance' },
    { label: 'Progress payment — at rough-in', percent: 0.4, due: 'At rough-in' },
    { label: 'Final balance — on completion', percent: 0.3, due: 'On completion' },
  ];
}

/* ------------------------------------------------------------ defaults ---- */

export function defaultSettings() {
  return {
    defaultMarkup: 0.35,
    categoryMarkup: {
      labor: 0.45,
      material: 0.25,
      subcontractor: 0.15,
      equipment: 0.2,
      other: 0.3,
    },
    overhead: 0.1,
    contingency: 0.05,
    taxMode: 'materials',
    taxRate: 0.0725,
    targetMargin: 0.25,
    floorMargin: 0.12,
    currency: '$',
  };
}

/**
 * Solve for the uniform markup that lands a whole estimate on a target margin.
 *
 * A closed form exists, but only for the simple case. Once pass-through lines
 * (markup locked at 0), contingency in the denominator, discounts, and
 * overhead's own weighted markup are all in play, the algebra is both ugly and
 * fragile — it would silently go wrong the next time the pricing pipeline
 * changes. So this bisects against the real priceEstimate instead: margin is
 * monotonically increasing in markup, the search space is tiny, and the answer
 * stays correct by construction no matter how the pipeline evolves.
 *
 * Lines whose markup is explicitly 0 are treated as pass-throughs and left
 * alone, because marking up a permit fee is how you end up defending a $1,200
 * "permit" line to an irritated client.
 *
 * @returns {number|null} the markup ratio, or null if the target is unreachable
 */
export function solveUniformMarkup(estimate, settings, targetMargin) {
  const target = Number(targetMargin);
  if (!Number.isFinite(target) || target >= 1) return null;

  const markable = (estimate.items || []).filter((i) => !i.optional && !isPassThrough(i));
  if (!markable.length) return null;

  const marginAt = (m) => priceEstimate(
    { ...estimate, items: (estimate.items || []).map((i) => (isPassThrough(i) ? i : { ...i, markup: m })) },
    settings,
  ).margin;

  let lo = 0;
  let hi = 1;
  // Expand the upper bound until it brackets the target (or we give up).
  for (let i = 0; i < 40 && marginAt(hi) < target; i++) hi *= 2;
  if (marginAt(hi) < target) return null;
  if (marginAt(lo) > target) return 0;

  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (marginAt(mid) < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * A line the user has EXPLICITLY pinned to zero profit.
 *
 * The explicitness matters: `markup: null` means "use my category default",
 * and Number(null) is 0, so a naive equality check silently reclassifies every
 * default-markup line as a pass-through and under-prices the entire job.
 */
export function isPassThrough(item) {
  const m = item.markup;
  if (m === null || m === undefined || m === '') return false;
  return Number(m) === 0;
}

/* ======================================================= change orders ==== */

/**
 * A change order is priced exactly like a small estimate, using the parent
 * job's own settings so that markup, overhead, and tax stay consistent with
 * the contract it amends. Nothing about the math is special; what is special
 * is that people forget to write them.
 */
export function priceChangeOrder(order, settings, parentSettings = {}) {
  return priceEstimate(
    { items: order.items || [], discount: order.discount || null, settings: parentSettings },
    settings,
  );
}

/** Change orders that have been signed off and are part of the contract. */
export const CO_APPROVED = 'approved';
/** Written up and sent, but not yet authorized. */
export const CO_SENT = 'sent';
/** Not yet sent to the client. */
export const CO_DRAFT = 'draft';
/** Client declined; excluded from every total. */
export const CO_REJECTED = 'rejected';

/**
 * Roll the original contract and its change orders into one picture.
 *
 * The number worth building the feature for is `atRiskCents`: the cost of work
 * described by change orders that are NOT yet approved. On a real job that is
 * money already being spent on someone's say-so, with nothing signed. It is
 * the second-biggest profit leak in contracting after mispricing, and unlike
 * mispricing it is invisible until the final invoice is disputed.
 */
export function summarizeContract(estimate, settings) {
  const base = priceEstimate(estimate, settings);

  const orders = (estimate.changeOrders || []).map((co) => ({
    order: co,
    priced: priceChangeOrder(co, settings, estimate.settings || {}),
  }));

  const by = (status) => orders.filter((o) => o.order.status === status);
  const approved = by(CO_APPROVED);
  const unapproved = orders.filter(
    (o) => o.order.status === CO_DRAFT || o.order.status === CO_SENT,
  );

  const sumTotal = (rows) => rows.reduce((a, r) => a + r.priced.totalCents, 0);
  const sumProfit = (rows) => rows.reduce((a, r) => a + r.priced.grossProfitCents, 0);
  const sumCost = (rows) => rows.reduce((a, r) => a + r.priced.burdenedCostCents, 0);

  const approvedTotal = sumTotal(approved);
  const approvedProfit = sumProfit(approved);
  const approvedCost = sumCost(approved);

  const contractTotal = base.totalCents + approvedTotal;
  const contractProfit = base.grossProfitCents + approvedProfit;
  const contractCost = base.burdenedCostCents + approvedCost;

  // Margin is computed on the revenue that actually backs the profit, so a
  // credit change order (negative total) cannot make the ratio nonsensical.
  const revenue = base.afterDiscountCents + approvedTotal;

  return {
    base,
    orders,
    approved,
    unapproved,
    rejected: by(CO_REJECTED),
    approvedCount: approved.length,
    approvedTotalCents: approvedTotal,
    contractTotalCents: contractTotal,
    contractCostCents: contractCost,
    contractProfitCents: contractProfit,
    contractMargin: revenue === 0 ? 0 : contractProfit / revenue,
    originalTotalCents: base.totalCents,

    /** Unapproved change-order value — revenue you may never be paid. */
    atRiskCents: sumTotal(unapproved),
    /** Your own cost inside that unapproved work — the actual exposure. */
    atRiskCostCents: sumCost(unapproved),
    unapprovedCount: unapproved.length,
  };
}

export function newChangeOrder(seq = 1) {
  return {
    id: `co_${seq}`,
    number: `CO-${String(seq).padStart(2, '0')}`,
    title: '',
    reason: '',
    status: CO_DRAFT,
    createdAt: '',
    decidedAt: '',
    items: [],
    discount: null,
    daysAdded: 0,
    signature: null,
  };
}

/* ========================================================== job costing === */

/**
 * Compare actual spend against the job's budget.
 *
 * The third leak, after mispricing and unbilled changes, is margin fade: the
 * job was priced at 25%, finished at 14%, and nobody can say which trade ate
 * the difference — because receipts went into a shoebox and were never laid
 * against the estimate. This closes that loop with the cheapest possible
 * discipline: a flat log of what was actually spent, rolled up per category
 * against what the estimate said it would cost.
 *
 * The budget is DIRECT cost only — the line costs of the estimate plus its
 * approved change orders. Overhead is a percentage carried in the price, not
 * something anyone writes a check against per job, so it stays out of the
 * category budgets and remains accounted for inside contract profit.
 *
 * Erosion is the sum of PER-CATEGORY overruns, deliberately not the net
 * against underspent categories. Money not yet spent on tile is usually tile
 * that has not been bought, not savings — netting it against a labor overrun
 * reports a healthy job right up until it suddenly is not.
 */
export function compareActuals(estimate, settings) {
  const contract = summarizeContract(estimate, settings);

  // Budget per category: estimate lines plus approved change order lines.
  const budget = {};
  for (const cat of CATEGORIES) budget[cat] = 0;
  for (const [cat, v] of Object.entries(contract.base.byCategory)) budget[cat] += v.costCents;
  for (const { priced } of contract.approved) {
    for (const [cat, v] of Object.entries(priced.byCategory)) budget[cat] += v.costCents;
  }

  // Spend per category. Amounts are dollars at the boundary, cents inside;
  // negative entries (a refund, a returned pallet) net against the category.
  const spent = {};
  for (const cat of CATEGORIES) spent[cat] = 0;
  // Newest first — by date, and within a day by most recently logged. A
  // stable date-only sort leaves every same-day tie in insertion order, which
  // buries the receipt the user just typed at the bottom of the grid.
  const entries = (estimate.actuals || []).map((a, i) => ({
    ...a,
    amountCents: toCents(a.amount),
    _seq: i,
  }));
  for (const e of entries) {
    const cat = CATEGORIES.includes(e.category) ? e.category : 'other';
    spent[cat] += e.amountCents;
  }

  const byCategory = {};
  let budgetTotal = 0;
  let spentTotal = 0;
  let overrunTotal = 0;
  for (const cat of CATEGORIES) {
    if (!budget[cat] && !spent[cat]) continue;
    const over = Math.max(0, spent[cat] - budget[cat]);
    byCategory[cat] = {
      budgetCents: budget[cat],
      spentCents: spent[cat],
      remainingCents: budget[cat] - spent[cat],
      overrunCents: over,
    };
    budgetTotal += budget[cat];
    spentTotal += spent[cat];
    overrunTotal += over;
  }

  // Every dollar over budget in any category comes straight out of profit.
  const adjustedProfit = contract.contractProfitCents - overrunTotal;
  const revenue = contract.base.afterDiscountCents + contract.approvedTotalCents;

  return {
    contract,
    entries: entries
      .sort((a, b) => (b.date || '').localeCompare(a.date || '') || b._seq - a._seq)
      .map(({ _seq, ...rest }) => rest),
    byCategory,
    budgetCents: budgetTotal,
    spentCents: spentTotal,
    remainingCents: budgetTotal - spentTotal,
    overrunCents: overrunTotal,
    estimatedProfitCents: contract.contractProfitCents,
    adjustedProfitCents: adjustedProfit,
    estimatedMargin: contract.contractMargin,
    adjustedMargin: revenue === 0 ? 0 : adjustedProfit / revenue,
    /** Fraction of the direct budget consumed so far. */
    spendRatio: budgetTotal === 0 ? 0 : spentTotal / budgetTotal,
  };
}

/**
 * Distribute a target total across line items so the displayed amounts sum to
 * it EXACTLY, in proportion to each line's own price.
 *
 * Client-facing documents itemize work and then print a total. If the column
 * does not add up, two bad things happen at once: the client loses trust in a
 * document they are about to sign, and the difference — overhead, its markup,
 * and contingency — is recoverable by subtraction, handing them the
 * contractor's loading. Allocating the loading back into the line prices fixes
 * both. The last line absorbs the rounding remainder so the column reconciles
 * to the penny.
 */
export function allocateLinePrices(lineCents, targetCents) {
  const n = lineCents.length;
  if (!n) return [];
  const base = lineCents.reduce((a, c) => a + c, 0);
  // With no meaningful base to scale by, spread the target evenly rather than
  // dividing by zero — an all-zero scope with a nonzero total is degenerate,
  // but it must still add up.
  if (base === 0) {
    const each = Math.trunc(targetCents / n);
    return lineCents.map((_, i) => (i === n - 1 ? targetCents - each * (n - 1) : each));
  }
  let allocated = 0;
  return lineCents.map((c, i) => {
    if (i === n - 1) return targetCents - allocated;
    const share = Math.round((c / base) * targetCents);
    allocated += share;
    return share;
  });
}

/**
 * Solve for the fixed discount that makes an estimate total EXACTLY a target.
 *
 * Subtracting (currentTotal - target) looks right and is wrong: tax is charged
 * on the after-discount base, so removing a dollar of price removes slightly
 * more than a dollar of total. A contractor asking to land on $15,000 landed
 * on $14,974.36 — on the one feature whose entire purpose is hitting a round
 * number. Bisected against the real pipeline for the same reason the markup
 * solver is: total is monotonic in discount, and the answer stays correct
 * however the pipeline changes.
 *
 * @returns {number|null} discount in CENTS, or null if the target is
 *   unreachable (above the undiscounted total, or below zero).
 */
export function solveDiscountForTotal(estimate, settings, targetCents) {
  if (!Number.isFinite(targetCents) || targetCents < 0) return null;

  const totalAt = (discountCents) => priceEstimate(
    { ...estimate, discount: { type: 'fixed', value: discountCents / 100 } },
    settings,
  ).totalCents;

  const undiscounted = totalAt(0);
  if (targetCents > undiscounted) return null;   // cannot discount upward
  if (targetCents === undiscounted) return 0;

  let lo = 0;                 // total = undiscounted
  let hi = undiscounted;      // total at or near zero
  for (let i = 0; i < 60; i++) {
    const mid = Math.round((lo + hi) / 2);
    if (totalAt(mid) > targetCents) lo = mid;
    else hi = mid;
    if (hi - lo <= 1) break;
  }
  // Prefer whichever endpoint lands nearer the target.
  return Math.abs(totalAt(lo) - targetCents) <= Math.abs(totalAt(hi) - targetCents) ? lo : hi;
}
