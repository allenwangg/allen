/**
 * pricebook.test.js — the catalog, the override layer, and assemblies.
 *
 * The assembly checks matter more than they look: an assembly that prices a
 * bathroom 40% off reality is worse than no assembly at all, because the user
 * trusts it.
 */
import {
  PRICE_BOOK, ASSEMBLIES, UNITS, findSku, trades, searchPriceBook, expandAssembly,
  effectivePriceBook, effectiveItem, effectiveTrades, searchEffective, expandAssemblyWith,
} from './pricebook.js';
import { priceEstimate, defaultSettings, CATEGORIES } from './pricing.js';

let passed = 0, failed = 0; const failures = [];
const t = (n, f) => { try { f(); passed++; } catch (e) { failed++; failures.push(`${n}\n    ${e.message}`); } };
const eq = (a, b, m = '') => { if (a !== b) throw new Error(`${m} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const ok = (c, m = 'failed') => { if (!c) throw new Error(m); };

/* ---------------------------------------------------------- integrity --- */

t('every sku is unique', () => {
  const skus = PRICE_BOOK.map((i) => i.sku);
  eq(new Set(skus).size, skus.length, `duplicates: ${skus.filter((s, i) => skus.indexOf(s) !== i)}`);
});

t('every item is well formed', () => {
  for (const i of PRICE_BOOK) {
    ok(i.description && i.description.length > 2, `${i.sku}: bad description`);
    ok(CATEGORIES.includes(i.category), `${i.sku}: unknown category ${i.category}`);
    ok(UNITS.includes(i.unit), `${i.sku}: unknown unit ${i.unit}`);
    ok(Number.isFinite(i.unitCost) && i.unitCost > 0, `${i.sku}: bad unitCost ${i.unitCost}`);
    ok(i.trade && i.trade.length > 1, `${i.sku}: missing trade`);
    if (i.waste !== undefined) ok(i.waste >= 1 && i.waste <= 1.5, `${i.sku}: implausible waste ${i.waste}`);
  }
});

t('every assembly reference resolves', () => {
  for (const a of ASSEMBLIES) {
    ok(a.items.length >= 5, `${a.id}: too few lines to be worth an assembly`);
    ok(a.defaultDriver > 0, `${a.id}: bad default driver`);
    for (const ref of a.items) {
      ok(findSku(ref.sku), `${a.id} references unknown sku ${ref.sku}`);
      ok(Number.isFinite(ref.factor) && ref.factor > 0, `${a.id}/${ref.sku}: bad factor`);
    }
  }
});

t('assembly ids are unique', () => {
  const ids = ASSEMBLIES.map((a) => a.id);
  eq(new Set(ids).size, ids.length);
});

/* ------------------------------------------------------------ pricing --- */

t('assemblies price inside plausible market ranges', () => {
  // Guards against a fat-fingered cost or factor silently doubling a quote.
  const bounds = {
    'asm-bath-full': [200, 600],   // $/sf, full gut bath
    'asm-kitchen': [140, 420],     // $/sf
    'asm-roof': [450, 950],        // $/square
    'asm-deck': [55, 140],         // $/sf
    'asm-basement': [45, 120],     // $/sf
  };
  for (const a of ASSEMBLIES) {
    const items = expandAssembly(a, a.defaultDriver).map((it, i) => ({ ...it, id: String(i) }));
    const p = priceEstimate({ items }, defaultSettings());
    const perUnit = p.totalCents / 100 / a.defaultDriver;
    const [lo, hi] = bounds[a.id];
    ok(perUnit >= lo && perUnit <= hi,
      `${a.id}: $${perUnit.toFixed(2)}/${a.driverUnit} is outside the plausible $${lo}–$${hi}`);
  }
});

t('assembly quantities scale with the driver', () => {
  const a = ASSEMBLIES.find((x) => x.id === 'asm-deck');
  const small = expandAssembly(a, 100);
  const big = expandAssembly(a, 400);
  const decking = (rows) => rows.find((r) => r.sku === 'DCK-COMP').qty;
  ok(decking(big) > decking(small) * 3.5, 'quantities should scale roughly linearly');
});

t('countable units never come out fractional', () => {
  for (const a of ASSEMBLIES) {
    for (const row of expandAssembly(a, a.defaultDriver)) {
      if (['ea', 'ls', 'day', 'sq'].includes(row.unit)) {
        eq(Number.isInteger(row.qty), true, `${a.id}/${row.sku}: ${row.qty} ${row.unit} is not orderable`);
      }
    }
  }
});

t('minimums are respected at tiny drivers', () => {
  const a = ASSEMBLIES.find((x) => x.id === 'asm-bath-full');
  const rows = expandAssembly(a, 1);
  eq(rows.find((r) => r.sku === 'DEM-DUMP').qty, 1, 'you still need one dumpster:');
  eq(rows.find((r) => r.sku === 'FEE-PERM').qty, 1, 'you still need one permit:');
});

t('material waste is applied, labor is not', () => {
  const a = ASSEMBLIES.find((x) => x.id === 'asm-roof');
  const rows = expandAssembly(a, 100);
  const underlay = rows.find((r) => r.sku === 'ROF-UNDR');   // waste 1.10, factor 1.0
  eq(underlay.qty, 110, 'material should carry its waste factor:');
  const lead = rows.find((r) => r.sku === 'LAB-LEAD');       // no waste
  eq(lead.qty, 40, 'labor hours should not be inflated by a waste factor:');
});

t('pass-through fees come in at zero markup', () => {
  for (const a of ASSEMBLIES) {
    for (const row of expandAssembly(a, a.defaultDriver)) {
      if (row.category === 'other') {
        eq(row.markup, 0, `${a.id}/${row.sku}: a fee should not be marked up`);
      }
    }
  }
});

t('assembly lines carry their trade for proposal grouping', () => {
  for (const row of expandAssembly(ASSEMBLIES[0], 45)) {
    ok(row.trade, `${row.sku} has no trade, so it would fall back to a staffing category`);
  }
});

/* ------------------------------------------------------------- search --- */

t('search ranks word-start matches first', () => {
  const hits = searchPriceBook('tile');
  ok(hits.length >= 2, 'expected several tile items');
  ok(/tile/i.test(hits[0].description) || /tile/i.test(hits[0].trade),
    `top hit "${hits[0].description}" does not lead with the query`);
});

t('search filters by trade', () => {
  const hits = searchPriceBook('', { trade: 'Roofing' });
  ok(hits.length >= 3);
  ok(hits.every((h) => h.trade === 'Roofing'));
});

t('an empty query returns the catalog', () => {
  ok(searchPriceBook('').length > 20);
});

t('a nonsense query returns nothing rather than everything', () => {
  eq(searchPriceBook('zzzzqqq').length, 0);
});

/* ---------------------------------------------------------- overrides --- */

t('an override replaces the shipped cost and is flagged', () => {
  const ov = { 'LAB-LEAD': { unitCost: 72 } };
  const item = effectiveItem('LAB-LEAD', ov);
  eq(item.unitCost, 72);
  eq(item.edited, true, 'an edited cost should be visibly marked:');
  eq(findSku('LAB-LEAD').unitCost, 58, 'the shipped catalog must not be mutated:');
});

t('an override equal to the shipped cost is not flagged as edited', () => {
  eq(effectiveItem('LAB-LEAD', { 'LAB-LEAD': { unitCost: 58 } }).edited, false);
});

t('a hidden item disappears from the book and from search', () => {
  const ov = { 'DEM-DUMP': { hidden: true } };
  eq(effectiveItem('DEM-DUMP', ov), null);
  eq(searchEffective('dumpster', { overrides: ov }).length, 0);
  eq(effectivePriceBook(ov).length, PRICE_BOOK.length - 1);
});

t('a hidden item is not resurrected by an assembly', () => {
  const ov = { 'DEM-DUMP': { hidden: true } };
  const rows = expandAssemblyWith(ASSEMBLIES[0], 45, ov);
  ok(!rows.some((r) => r.sku === 'DEM-DUMP'),
    'hiding an item you never rent must keep it out of assemblies too');
  ok(rows.length > 10, 'the rest of the assembly should still expand');
});

t('a custom item is searchable and carries its trade', () => {
  const ov = { 'USR-1': { custom: true, description: 'Crane day', trade: 'Rigging', category: 'equipment', unit: 'day', unitCost: 2200 } };
  const hits = searchEffective('crane', { overrides: ov });
  eq(hits.length, 1);
  eq(hits[0].unitCost, 2200);
  eq(hits[0].custom, true);
  ok(effectiveTrades(ov).includes('Rigging'), 'a custom trade should appear in the trade filter');
});

t('assemblies price with the user own costs', () => {
  const a = ASSEMBLIES.find((x) => x.id === 'asm-roof');
  const plain = expandAssemblyWith(a, 28, {});
  const mine = expandAssemblyWith(a, 28, { 'ROF-ARCH': { unitCost: 400 } });
  const cost = (rows) => rows.reduce((s, r) => s + r.qty * r.unitCost, 0);
  ok(cost(mine) > cost(plain), 'raising your shingle cost should raise the job cost');
  eq(mine.find((r) => r.sku === 'ROF-ARCH').unitCost, 400);
});

t('no overrides behaves exactly like the shipped catalog', () => {
  eq(effectivePriceBook({}).length, PRICE_BOOK.length);
  const a = ASSEMBLIES[0];
  eq(JSON.stringify(expandAssemblyWith(a, 45, {})),
     JSON.stringify(expandAssembly(a, 45)),
     'the override path must be a no-op when there are no overrides');
});

console.log(`\n  price book: ${passed} passed, ${failed} failed\n`);
if (failed) { failures.forEach((f) => console.log(`  FAIL  ${f}\n`)); process.exit(1); }
