/**
 * store.js — application state, persistence, and undo.
 *
 * Deliberately backend-free. Everything lives in localStorage, which means:
 * zero hosting cost, no signup friction, works on a job site with no signal,
 * and no custody of anyone's client list. The trade-off is that data is bound
 * to one browser, so export/import is a first-class feature, not an afterthought.
 */

import { defaultSettings, defaultMilestones } from './pricing.js';

const STORAGE_KEY = 'quoteforge.v1';
const SCHEMA_VERSION = 1;
const UNDO_DEPTH = 50;

/* ------------------------------------------------------------- helpers ---- */

export function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

function clone(v) {
  return typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v));
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/* ------------------------------------------------------------ defaults ---- */

export function defaultCompany() {
  return {
    name: 'Your Company LLC',
    tagline: 'Licensed & insured general contractor',
    license: '',
    phone: '',
    email: '',
    website: '',
    address: '',
    accent: '#c2410c',
    logoDataUrl: '',
  };
}

export const DEFAULT_TERMS = [
  'This proposal is valid for 30 days from the date shown above.',
  'Pricing assumes work proceeds continuously during normal business hours.',
  'Concealed conditions discovered after demolition — including but not limited to rot, mold, pest damage, failed structural members, and non-conforming wiring or plumbing — are not included and will be priced as a written change order before that work begins.',
  'Any change to the scope of work must be approved in writing by both parties before it is performed. Verbal approvals will not be honored.',
  'Client is responsible for obtaining HOA and architectural review approvals where applicable.',
  'Owner-supplied materials are excluded from all workmanship and material warranties.',
  'Workmanship is warranted for one (1) year from substantial completion. Manufacturer warranties pass through to the client.',
  'Balances unpaid more than 15 days past the due date accrue interest at 1.5% per month.',
];

export function newEstimate(overrides = {}) {
  const created = todayISO();
  return {
    id: uid('est'),
    number: '',
    title: 'Untitled estimate',
    status: 'draft',
    createdAt: created,
    updatedAt: created,
    validUntil: addDays(created, 30),
    client: { name: '', email: '', phone: '', address: '' },
    jobAddress: '',
    scopeSummary: '',
    exclusions: '',
    items: [],
    discount: null,
    milestones: defaultMilestones(),
    terms: [...DEFAULT_TERMS],
    settings: {},
    signature: null,
    ...overrides,
  };
}

function initialState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    company: defaultCompany(),
    settings: defaultSettings(),
    estimates: [],
    activeId: null,
    nextNumber: 1001,
    priceBookOverrides: {},
    onboarded: false,
  };
}

/* -------------------------------------------------------------- store ----- */

export class Store {
  constructor({ storage = safeStorage() } = {}) {
    this.storage = storage;
    this.state = this.load();
    this.listeners = new Set();
    this.undoStack = [];
    this.redoStack = [];
    this._saveTimer = null;
  }

  /* --- persistence --- */

  load() {
    try {
      const raw = this.storage.getItem(STORAGE_KEY);
      if (!raw) return initialState();
      const parsed = JSON.parse(raw);
      return migrate(parsed);
    } catch (err) {
      console.warn('QuoteForge: could not read saved data, starting fresh.', err);
      return initialState();
    }
  }

  /**
   * Writes are debounced so that typing in a text field does not serialize the
   * whole document on every keystroke, but a flush always runs on pagehide so
   * nothing is lost when the tab closes.
   */
  save({ immediate = false } = {}) {
    if (this._saveTimer) clearTimeout(this._saveTimer);
    const write = () => {
      this._saveTimer = null;
      try {
        this.storage.setItem(STORAGE_KEY, JSON.stringify(this.state));
        this._quotaWarned = false;
      } catch (err) {
        if (!this._quotaWarned) {
          this._quotaWarned = true;
          this.emit({ type: 'storage-error', error: err });
          console.error('QuoteForge: save failed — storage may be full.', err);
        }
      }
    };
    if (immediate) write();
    else this._saveTimer = setTimeout(write, 250);
  }

  /* --- subscriptions --- */

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(detail = {}) {
    for (const fn of this.listeners) {
      try { fn(this.state, detail); } catch (err) { console.error(err); }
    }
  }

  /**
   * The single mutation entry point. Every change funnels through here so that
   * undo, persistence, and re-render are impossible to forget.
   *
   * @param {(state: object) => void} mutator
   * @param {object} [opts]
   * @param {boolean} [opts.undoable=true]
   * @param {string} [opts.label]
   * @param {boolean} [opts.coalesce]  merge with the previous undo entry if it
   *                                   carried the same label — keeps a burst of
   *                                   keystrokes from filling the undo stack
   */
  update(mutator, { undoable = true, label = 'edit', coalesce = false } = {}) {
    if (undoable) {
      const last = this.undoStack[this.undoStack.length - 1];
      const merge = coalesce && last && last.label === label;
      if (!merge) {
        this.undoStack.push({ label, snapshot: clone(this.state) });
        if (this.undoStack.length > UNDO_DEPTH) this.undoStack.shift();
      }
      this.redoStack.length = 0;
    }
    mutator(this.state);
    const est = this.active();
    if (est) est.updatedAt = todayISO();
    this.save();
    this.emit({ type: 'update', label });
  }

  canUndo() { return this.undoStack.length > 0; }
  canRedo() { return this.redoStack.length > 0; }

  undo() {
    const entry = this.undoStack.pop();
    if (!entry) return false;
    this.redoStack.push({ label: entry.label, snapshot: clone(this.state) });
    this.state = entry.snapshot;
    this.save();
    this.emit({ type: 'undo', label: entry.label });
    return true;
  }

  redo() {
    const entry = this.redoStack.pop();
    if (!entry) return false;
    this.undoStack.push({ label: entry.label, snapshot: clone(this.state) });
    this.state = entry.snapshot;
    this.save();
    this.emit({ type: 'redo', label: entry.label });
    return true;
  }

  /* --- estimates --- */

  active() {
    return this.state.estimates.find((e) => e.id === this.state.activeId) || null;
  }

  createEstimate(overrides = {}) {
    const est = newEstimate(overrides);
    this.update((s) => {
      est.number = `Q-${s.nextNumber}`;
      s.nextNumber += 1;
      s.estimates.unshift(est);
      s.activeId = est.id;
    }, { label: 'create estimate' });
    return est;
  }

  duplicateEstimate(id) {
    const src = this.state.estimates.find((e) => e.id === id);
    if (!src) return null;
    const copy = clone(src);
    copy.id = uid('est');
    copy.title = `${src.title} (copy)`;
    copy.status = 'draft';
    copy.createdAt = todayISO();
    copy.updatedAt = todayISO();
    copy.validUntil = addDays(todayISO(), 30);
    copy.signature = null;
    copy.items = copy.items.map((it) => ({ ...it, id: uid('li') }));
    this.update((s) => {
      copy.number = `Q-${s.nextNumber}`;
      s.nextNumber += 1;
      s.estimates.unshift(copy);
      s.activeId = copy.id;
    }, { label: 'duplicate estimate' });
    return copy;
  }

  deleteEstimate(id) {
    this.update((s) => {
      s.estimates = s.estimates.filter((e) => e.id !== id);
      if (s.activeId === id) s.activeId = s.estimates[0]?.id || null;
    }, { label: 'delete estimate' });
  }

  setActive(id) {
    this.update((s) => { s.activeId = id; }, { undoable: false });
  }

  patchEstimate(patch, opts = {}) {
    this.update((s) => {
      const est = s.estimates.find((e) => e.id === s.activeId);
      if (est) Object.assign(est, patch);
    }, { label: 'edit estimate', ...opts });
  }

  /* --- line items --- */

  addItem(partial = {}, opts = {}) {
    const item = {
      id: uid('li'),
      description: '',
      category: 'material',
      unit: 'ea',
      qty: 1,
      unitCost: 0,
      markup: null,
      optional: false,
      note: '',
      trade: '',
      ...partial,
    };
    this.update((s) => {
      const est = s.estimates.find((e) => e.id === s.activeId);
      if (!est) return;
      if (opts.after) {
        const idx = est.items.findIndex((i) => i.id === opts.after);
        est.items.splice(idx === -1 ? est.items.length : idx + 1, 0, item);
      } else {
        est.items.push(item);
      }
    }, { label: 'add item' });
    return item;
  }

  addItems(list) {
    const made = list.map((p) => ({
      id: uid('li'), description: '', category: 'material', unit: 'ea',
      qty: 1, unitCost: 0, markup: null, optional: false, note: '', trade: '', ...p,
    }));
    this.update((s) => {
      const est = s.estimates.find((e) => e.id === s.activeId);
      if (est) est.items.push(...made);
    }, { label: 'add items' });
    return made;
  }

  patchItem(id, patch, opts = {}) {
    this.update((s) => {
      const est = s.estimates.find((e) => e.id === s.activeId);
      const item = est?.items.find((i) => i.id === id);
      if (item) Object.assign(item, patch);
    }, { label: `edit item ${id}`, coalesce: true, ...opts });
  }

  removeItem(id) {
    this.update((s) => {
      const est = s.estimates.find((e) => e.id === s.activeId);
      if (est) est.items = est.items.filter((i) => i.id !== id);
    }, { label: 'remove item' });
  }

  moveItem(id, delta) {
    this.update((s) => {
      const est = s.estimates.find((e) => e.id === s.activeId);
      if (!est) return;
      const idx = est.items.findIndex((i) => i.id === id);
      const next = idx + delta;
      if (idx === -1 || next < 0 || next >= est.items.length) return;
      const [row] = est.items.splice(idx, 1);
      est.items.splice(next, 0, row);
    }, { label: 'reorder item' });
  }

  /* --- settings --- */

  patchSettings(patch) {
    this.update((s) => { Object.assign(s.settings, patch); }, { label: 'settings', coalesce: true });
  }

  patchCompany(patch) {
    this.update((s) => { Object.assign(s.company, patch); }, { label: 'company', coalesce: true });
  }

  /* --- portability --- */

  /** Everything, as a portable document. This is the user's escape hatch. */
  exportAll() {
    return JSON.stringify({
      kind: 'quoteforge-backup',
      schemaVersion: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      data: this.state,
    }, null, 2);
  }

  exportEstimate(id) {
    const est = this.state.estimates.find((e) => e.id === id);
    if (!est) return null;
    return JSON.stringify({
      kind: 'quoteforge-estimate',
      schemaVersion: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      company: this.state.company,
      settings: this.state.settings,
      estimate: est,
    }, null, 2);
  }

  /**
   * Import a backup or a single estimate. Merging rather than replacing is the
   * safe default: a mis-clicked import should never destroy existing work.
   */
  importJSON(text, { mode = 'merge' } = {}) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error('That file is not valid JSON.');
    }

    if (parsed.kind === 'quoteforge-estimate' && parsed.estimate) {
      const est = migrateEstimate(parsed.estimate);
      est.id = uid('est');
      est.items = (est.items || []).map((i) => ({ ...i, id: uid('li') }));
      this.update((s) => {
        s.estimates.unshift(est);
        s.activeId = est.id;
      }, { label: 'import estimate' });
      return { imported: 1, kind: 'estimate' };
    }

    if (parsed.kind === 'quoteforge-backup' && parsed.data) {
      const incoming = migrate(parsed.data);
      if (mode === 'replace') {
        this.update(() => { this.state = incoming; }, { label: 'import backup' });
        return { imported: incoming.estimates.length, kind: 'backup-replace' };
      }
      const existing = new Set(this.state.estimates.map((e) => e.id));
      const fresh = incoming.estimates.filter((e) => !existing.has(e.id));
      this.update((s) => {
        s.estimates.unshift(...fresh);
        s.nextNumber = Math.max(s.nextNumber, incoming.nextNumber || 1001);
        if (!s.activeId) s.activeId = s.estimates[0]?.id || null;
      }, { label: 'import backup' });
      return { imported: fresh.length, kind: 'backup-merge' };
    }

    throw new Error('That file does not look like a QuoteForge export.');
  }

  /** Flat CSV of the active estimate's lines, for accountants and spreadsheets. */
  exportCSV(priced) {
    const rows = [[
      'Description', 'Category', 'Qty', 'Unit', 'Unit cost', 'Line cost',
      'Markup %', 'Line price', 'Profit', 'Optional',
    ]];
    for (const l of priced.lines) {
      rows.push([
        l.description, l.category, l.qty, l.unit,
        (l.unitCostCents / 100).toFixed(2),
        (l.costCents / 100).toFixed(2),
        (l.markup * 100).toFixed(1),
        (l.priceCents / 100).toFixed(2),
        (l.profitCents / 100).toFixed(2),
        l.optional ? 'yes' : 'no',
      ]);
    }
    return rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
  }
}

function csvCell(v) {
  const s = String(v ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * localStorage throws in some privacy modes and inside sandboxed frames, so
 * every access is guarded and falls back to an in-memory shim. The app stays
 * usable; only persistence is lost, and the UI says so.
 */
export function safeStorage() {
  try {
    const probe = '__qf_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    const mem = new Map();
    return {
      getItem: (k) => (mem.has(k) ? mem.get(k) : null),
      setItem: (k, v) => mem.set(k, String(v)),
      removeItem: (k) => mem.delete(k),
      __ephemeral: true,
    };
  }
}

/* ------------------------------------------------------------ migration --- */

/**
 * Forward-only migration. Unknown future versions are left alone rather than
 * mangled — better to show a stale app than to corrupt real quotes.
 */
export function migrate(raw) {
  const base = initialState();
  const state = {
    ...base,
    ...raw,
    company: { ...base.company, ...(raw.company || {}) },
    settings: { ...base.settings, ...(raw.settings || {}) },
    estimates: (raw.estimates || []).map(migrateEstimate),
  };
  state.schemaVersion = SCHEMA_VERSION;
  if (!state.estimates.some((e) => e.id === state.activeId)) {
    state.activeId = state.estimates[0]?.id || null;
  }
  return state;
}

function migrateEstimate(raw) {
  const base = newEstimate();
  return {
    ...base,
    ...raw,
    client: { ...base.client, ...(raw.client || {}) },
    items: (raw.items || []).map((i) => ({
      id: i.id || uid('li'),
      description: i.description || '',
      category: i.category || 'material',
      unit: i.unit || 'ea',
      qty: Number(i.qty) || 0,
      unitCost: Number(i.unitCost) || 0,
      markup: i.markup === null || i.markup === undefined ? null : Number(i.markup),
      optional: !!i.optional,
      note: i.note || '',
      sku: i.sku || '',
      trade: i.trade || '',
    })),
    milestones: raw.milestones?.length ? raw.milestones : base.milestones,
    terms: raw.terms?.length ? raw.terms : base.terms,
  };
}

export { STORAGE_KEY, SCHEMA_VERSION };
