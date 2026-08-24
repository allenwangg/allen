/**
 * store.test.js — run with: node quoteforge/js/store.test.js
 *
 * These cover the parts of the store where a bug costs the user real work:
 * persistence, undo, migration of old files, and import not eating existing
 * estimates.
 */
import { Store, migrate, newEstimate, uid, STORAGE_KEY } from './store.js';
import { priceEstimate, defaultSettings } from './pricing.js';

let passed = 0, failed = 0;
const failures = [];
function t(name, fn) {
  try { fn(); passed++; } catch (e) { failed++; failures.push(`${name}\n    ${e.message}`); }
}
function eq(a, b, m = '') {
  if (a !== b) throw new Error(`${m} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}
function ok(c, m = 'assertion failed') { if (!c) throw new Error(m); }

/** In-memory stand-in for localStorage. */
function memStorage(seed = {}) {
  const mem = new Map(Object.entries(seed));
  return {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
    _dump: () => Object.fromEntries(mem),
  };
}
const mkStore = (seed) => new Store({ storage: memStorage(seed) });

/* ------------------------------------------------------------- basics ----- */

t('a fresh store starts empty but valid', () => {
  const s = mkStore();
  eq(s.state.estimates.length, 0);
  eq(s.active(), null);
  ok(s.state.settings.defaultMarkup > 0, 'settings should be seeded');
});

t('uid values do not collide across many draws', () => {
  const seen = new Set();
  for (let i = 0; i < 20000; i++) seen.add(uid('li'));
  eq(seen.size, 20000, 'uid collision detected:');
});

t('creating an estimate assigns a sequential number and activates it', () => {
  const s = mkStore();
  const a = s.createEstimate({ title: 'Deck' });
  const b = s.createEstimate({ title: 'Bath' });
  eq(a.number, 'Q-1001');
  eq(b.number, 'Q-1002');
  eq(s.active().id, b.id, 'newest estimate should be active');
  eq(s.state.estimates.length, 2);
});

t('items are added, patched, reordered, and removed', () => {
  const s = mkStore();
  s.createEstimate();
  const a = s.addItem({ description: 'A', qty: 1, unitCost: 10 });
  const b = s.addItem({ description: 'B', qty: 2, unitCost: 20 });
  eq(s.active().items.length, 2);

  s.patchItem(a.id, { qty: 5 });
  eq(s.active().items.find((i) => i.id === a.id).qty, 5);

  s.moveItem(b.id, -1);
  eq(s.active().items[0].id, b.id, 'B should have moved to the front');

  s.removeItem(a.id);
  eq(s.active().items.length, 1);
});

t('moveItem refuses to walk off either end', () => {
  const s = mkStore();
  s.createEstimate();
  const a = s.addItem({ description: 'A' });
  const b = s.addItem({ description: 'B' });
  s.moveItem(a.id, -1);
  eq(s.active().items[0].id, a.id, 'moving the first item up must be a no-op');
  s.moveItem(b.id, +1);
  eq(s.active().items[1].id, b.id, 'moving the last item down must be a no-op');
});

t('addItem({after}) inserts in the right place', () => {
  const s = mkStore();
  s.createEstimate();
  const a = s.addItem({ description: 'A' });
  s.addItem({ description: 'C' });
  const b = s.addItem({ description: 'B' }, { after: a.id });
  eq(s.active().items.map((i) => i.description).join(''), 'ABC');
  eq(s.active().items[1].id, b.id);
});

/* --------------------------------------------------------------- undo ----- */

t('undo and redo walk the history correctly', () => {
  const s = mkStore();
  s.createEstimate({ title: 'Original' });
  s.patchEstimate({ title: 'Changed' });
  eq(s.active().title, 'Changed');

  ok(s.undo(), 'undo should report success');
  eq(s.active().title, 'Original', 'undo did not restore the title:');

  ok(s.redo(), 'redo should report success');
  eq(s.active().title, 'Changed', 'redo did not reapply the title:');
});

t('undo on an empty stack is a safe no-op', () => {
  const s = mkStore();
  eq(s.undo(), false);
  eq(s.redo(), false);
  eq(s.canUndo(), false);
});

t('a new edit clears the redo branch', () => {
  const s = mkStore();
  s.createEstimate({ title: 'A' });
  s.patchEstimate({ title: 'B' });
  s.undo();
  ok(s.canRedo(), 'redo should be available after an undo');
  s.patchEstimate({ title: 'C' });
  eq(s.canRedo(), false, 'a fresh edit must discard the redo branch');
});

t('coalescing keeps a burst of keystrokes to one undo step', () => {
  const s = mkStore();
  s.createEstimate();
  const it = s.addItem({ description: '' });
  const before = s.undoStack.length;
  for (const text of ['D', 'De', 'Dem', 'Demo']) {
    s.patchItem(it.id, { description: text });
  }
  eq(s.undoStack.length, before + 1, 'typing should collapse into a single undo entry:');
  s.undo();
  eq(s.active().items[0].description, '', 'one undo should clear the whole burst');
});

t('undo history is bounded', () => {
  const s = mkStore();
  s.createEstimate();
  for (let i = 0; i < 200; i++) s.patchEstimate({ title: `t${i}` }, { coalesce: false, label: `t${i}` });
  ok(s.undoStack.length <= 50, `undo stack grew unbounded: ${s.undoStack.length}`);
});

t('undo snapshots are deep, not shared references', () => {
  const s = mkStore();
  s.createEstimate();
  const it = s.addItem({ description: 'orig', qty: 1 });
  s.patchItem(it.id, { qty: 99 });
  s.undo();
  eq(s.active().items[0].qty, 1, 'snapshot aliased live state:');
});

/* -------------------------------------------------------- persistence ---- */

t('state survives a reload from the same storage', () => {
  const storage = memStorage();
  const a = new Store({ storage });
  a.createEstimate({ title: 'Persisted job' });
  a.addItem({ description: 'Line', qty: 3, unitCost: 100 });
  a.save({ immediate: true });

  const b = new Store({ storage });
  eq(b.state.estimates.length, 1);
  eq(b.active().title, 'Persisted job');
  eq(b.active().items.length, 1);
  eq(b.active().items[0].qty, 3);
});

t('corrupt saved data degrades to a fresh start instead of crashing', () => {
  const warn = console.warn; console.warn = () => {};
  try {
    const s = new Store({ storage: memStorage({ [STORAGE_KEY]: '{not json' }) });
    eq(s.state.estimates.length, 0);
    ok(s.state.settings, 'settings should still be present');
  } finally { console.warn = warn; }
});

t('a full-storage write surfaces an error instead of throwing', () => {
  const err = console.error; console.error = () => {};
  try {
    const storage = {
      getItem: () => null,
      setItem: () => { throw new Error('QuotaExceededError'); },
      removeItem: () => {},
    };
    const s = new Store({ storage });
    let sawError = false;
    s.subscribe((_st, d) => { if (d.type === 'storage-error') sawError = true; });
    s.createEstimate({ title: 'Big' });
    s.save({ immediate: true });
    ok(sawError, 'a quota failure should be reported to the UI, not swallowed');
  } finally { console.error = err; }
});

/* ---------------------------------------------------------- migration ---- */

t('a minimal legacy record is filled out with defaults', () => {
  const migrated = migrate({
    estimates: [{ id: 'old1', title: 'Legacy', items: [{ description: 'X', qty: '4', unitCost: '12.5' }] }],
  });
  const est = migrated.estimates[0];
  eq(est.items[0].qty, 4, 'string qty should be coerced to a number:');
  eq(est.items[0].unitCost, 12.5);
  eq(est.items[0].category, 'material', 'missing category should default');
  ok(est.items[0].id, 'a missing item id should be generated');
  ok(est.terms.length > 0, 'terms should be seeded');
  ok(est.milestones.length > 0, 'milestones should be seeded');
  eq(migrated.activeId, 'old1', 'activeId should point at the only estimate');
});

t('a dangling activeId is repaired on load', () => {
  const migrated = migrate({ activeId: 'ghost', estimates: [{ id: 'real', title: 'R' }] });
  eq(migrated.activeId, 'real');
});

t('migration of an empty document yields a usable state', () => {
  const m = migrate({});
  eq(m.estimates.length, 0);
  eq(m.activeId, null);
  ok(m.company.name, 'company should be seeded');
});

/* ------------------------------------------------------ import/export ---- */

t('a full backup round-trips', () => {
  const a = mkStore();
  a.createEstimate({ title: 'Job One' });
  a.addItem({ description: 'Framing', qty: 10, unitCost: 50, category: 'labor' });
  const json = a.exportAll();

  const b = mkStore();
  const res = b.importJSON(json);
  eq(res.imported, 1);
  eq(b.state.estimates.length, 1);
  eq(b.state.estimates[0].title, 'Job One');
  eq(b.state.estimates[0].items[0].description, 'Framing');
});

t('merging an import never destroys existing estimates', () => {
  const a = mkStore();
  a.createEstimate({ title: 'Mine' });
  const b = mkStore();
  b.createEstimate({ title: 'Theirs' });

  a.importJSON(b.exportAll(), { mode: 'merge' });
  const titles = a.state.estimates.map((e) => e.title).sort();
  eq(titles.join('|'), 'Mine|Theirs', 'merge lost an estimate:');
});

t('importing the same backup twice does not duplicate', () => {
  const a = mkStore();
  a.createEstimate({ title: 'Once' });
  const json = a.exportAll();
  const b = mkStore();
  b.importJSON(json);
  b.importJSON(json);
  eq(b.state.estimates.length, 1, 'second import should be a no-op:');
});

t('a single-estimate export imports with fresh ids', () => {
  const a = mkStore();
  const est = a.createEstimate({ title: 'Shared' });
  a.addItem({ description: 'Tile', qty: 200, unitCost: 4 });
  const json = a.exportEstimate(est.id);

  const b = mkStore();
  b.importJSON(json);
  const got = b.state.estimates[0];
  eq(got.title, 'Shared');
  ok(got.id !== est.id, 'imported estimate must get a new id to avoid collisions');
  ok(got.items[0].id, 'imported items need ids');
  eq(got.items[0].qty, 200);
});

t('garbage input is rejected with a readable message', () => {
  const s = mkStore();
  let msg = '';
  try { s.importJSON('<html>nope</html>'); } catch (e) { msg = e.message; }
  ok(/valid JSON/i.test(msg), `unhelpful error: ${msg}`);

  try { s.importJSON('{"kind":"something-else"}'); } catch (e) { msg = e.message; }
  ok(/QuoteForge export/i.test(msg), `unhelpful error: ${msg}`);
});

t('duplicating an estimate detaches it from the original', () => {
  const s = mkStore();
  const src = s.createEstimate({ title: 'Original' });
  s.addItem({ description: 'Line', qty: 1, unitCost: 10 });
  s.patchEstimate({ signature: { dataUrl: 'x', signedAt: '2026-01-01' } });

  const copy = s.duplicateEstimate(src.id);
  ok(copy.id !== src.id);
  eq(copy.signature, null, 'a duplicate must not carry the original signature');
  eq(copy.status, 'draft');
  ok(copy.items[0].id !== s.state.estimates.find((e) => e.id === src.id).items[0].id,
    'duplicated items need fresh ids');

  s.patchItem(copy.items[0].id, { qty: 99 });
  const original = s.state.estimates.find((e) => e.id === src.id);
  eq(original.items[0].qty, 1, 'editing the copy mutated the original:');
});

t('deleting the active estimate promotes another', () => {
  const s = mkStore();
  const a = s.createEstimate({ title: 'A' });
  const b = s.createEstimate({ title: 'B' });
  eq(s.active().id, b.id);
  s.deleteEstimate(b.id);
  eq(s.active().id, a.id, 'a surviving estimate should become active');
  s.deleteEstimate(a.id);
  eq(s.active(), null);
});

t('CSV export escapes commas and quotes', () => {
  const s = mkStore();
  s.createEstimate();
  s.addItem({ description: 'Trim, painted "white"', qty: 1, unitCost: 10, category: 'material' });
  const priced = priceEstimate(s.active(), defaultSettings());
  const csv = s.exportCSV(priced);
  ok(csv.includes('"Trim, painted ""white"""'), `bad CSV escaping:\n${csv}`);
  eq(csv.split('\r\n').length, 2, 'header + one row expected');
});

/* -------------------------------------------------------- integration ---- */

t('store output feeds the pricing engine cleanly', () => {
  const s = mkStore();
  s.createEstimate({ title: 'Integration' });
  s.addItem({ description: 'Labor', qty: 20, unitCost: 60, category: 'labor', markup: null });
  s.addItem({ description: 'Permit', qty: 1, unitCost: 400, category: 'other', markup: 0 });
  s.addItem({ description: 'Upgrade', qty: 1, unitCost: 900, category: 'material', optional: true });

  const priced = priceEstimate(s.active(), s.state.settings);
  eq(priced.lines.length, 3);
  eq(priced.optionalLines.length, 1);
  eq(priced.totalCents, priced.afterDiscountCents + priced.taxCents);
  ok(priced.grossProfitCents > 0, 'this job should be profitable');
  // The zero-markup permit must contribute cost but no profit.
  const permit = priced.lines.find((l) => l.description === 'Permit');
  eq(permit.profitCents, 0);
});

t('subscribers are notified on every mutation', () => {
  const s = mkStore();
  let calls = 0;
  const off = s.subscribe(() => { calls++; });
  s.createEstimate();
  s.addItem({ description: 'X' });
  s.undo();
  ok(calls >= 3, `expected at least 3 notifications, got ${calls}`);
  off();
  const before = calls;
  s.createEstimate();
  eq(calls, before, 'unsubscribe did not take effect');
});

t('a throwing subscriber cannot break other subscribers', () => {
  const err = console.error; console.error = () => {};
  try {
    const s = mkStore();
    let reached = false;
    s.subscribe(() => { throw new Error('bad listener'); });
    s.subscribe(() => { reached = true; });
    s.createEstimate();
    ok(reached, 'a throwing listener blocked the next one');
  } finally { console.error = err; }
});

console.log(`\n  store: ${passed} passed, ${failed} failed\n`);
if (failed) { failures.forEach((f) => console.log(`  FAIL  ${f}\n`)); process.exit(1); }
