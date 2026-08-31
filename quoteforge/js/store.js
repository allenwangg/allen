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

/**
 * Today in the LOCAL timezone. toISOString() is UTC, so an estimate created at
 * 6pm Pacific was stamped tomorrow — and change-order approval dates are
 * evidence of when a client authorized work.
 */
function todayISO() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
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
    changeOrders: [],
    actuals: [],
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
      // Starting fresh is right, but boot() immediately saves over the same
      // key — so without this the unreadable data (which may be recoverable by
      // hand, or by a later fix) is destroyed within a second of the failure.
      // Set it aside first; it is the user's only copy.
      try {
        const corrupt = this.storage.getItem(STORAGE_KEY);
        if (corrupt) this.storage.setItem(`${STORAGE_KEY}.corrupt`, corrupt);
      } catch { /* nothing further to try */ }
      console.warn('QuoteForge: could not read saved data. The unreadable copy was kept '
        + `under "${STORAGE_KEY}.corrupt" — export it before clearing site data.`, err);
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
    // A duplicate is a NEW job that has not been worked yet. Carrying the
    // source job's receipts over would show the copy as already over budget
    // and quietly corrupt the margin-fade figures on both jobs.
    copy.actuals = [];
    // Change orders come along, but a duplicate is a NEW job: it must not
    // inherit the client's signature or the date they authorized different
    // work, and every id has to be fresh so edits cannot reach the original.
    copy.changeOrders = (copy.changeOrders || []).map((co) => ({
      ...co,
      id: uid('co'),
      status: 'draft',
      decidedAt: '',
      signature: null,
      items: co.items.map((it) => ({ ...it, id: uid('li') })),
    }));
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

  /**
   * True when this browser still holds the shipped defaults — no company
   * details entered, no pricing rules changed, no price-book costs corrected.
   * A restore may safely adopt a backup's profile in that case; once the user
   * has set anything up here, theirs wins.
   */
  isPristineProfile() {
    const base = defaultCompany();
    const co = this.state.company || {};
    const companyUntouched = Object.keys(base).every((k) => (co[k] || '') === (base[k] || ''));
    const ds = defaultSettings();
    const settingsUntouched = Object.keys(ds).every((k) => (
      typeof ds[k] === 'object'
        ? JSON.stringify(ds[k]) === JSON.stringify(this.state.settings?.[k])
        : ds[k] === this.state.settings?.[k]));
    const noOverrides = Object.keys(this.state.priceBookOverrides || {}).length === 0;
    return companyUntouched && settingsUntouched && noOverrides;
  }

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
      // Every id has to be regenerated, not just the top-level items: change
      // orders, their items, and the actuals log all carry ids that would
      // collide with the sender's copy if this estimate is later merged back.
      const est = withFreshIds(migrateEstimate(parsed.estimate));
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

      // Merge mode is how the UI restores a backup, so it must restore more
      // than estimates. Dropping company details, pricing rules, and corrected
      // price-book costs turns "restore my data" into "lose everything except
      // the job list". Adopt them when this browser is still untouched;
      // otherwise keep what the user has here and only ADD price-book costs
      // they have not already set themselves.
      const pristine = this.isPristineProfile();
      let adopted = [];
      this.update((s) => {
        s.estimates.unshift(...fresh);
        s.nextNumber = Math.max(s.nextNumber, incoming.nextNumber || 1001);
        if (!s.activeId) s.activeId = s.estimates[0]?.id || null;

        if (pristine) {
          s.company = incoming.company;
          s.settings = incoming.settings;
          adopted = ['company', 'settings'];
        }
        const mine = s.priceBookOverrides || {};
        let added = 0;
        for (const [sku, ov] of Object.entries(incoming.priceBookOverrides || {})) {
          if (mine[sku] === undefined) { mine[sku] = ov; added++; }
        }
        s.priceBookOverrides = mine;
        if (added) adopted.push(`${added} price book cost${added === 1 ? '' : 's'}`);
      }, { label: 'import backup' });
      return { imported: fresh.length, kind: 'backup-merge', adopted };
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

/** Regenerate every id in an imported estimate so nothing collides. */
function withFreshIds(est) {
  return {
    ...est,
    id: uid('est'),
    items: (est.items || []).map((i) => ({ ...i, id: uid('li') })),
    changeOrders: (est.changeOrders || []).map((co) => ({
      ...co,
      id: uid('co'),
      items: (co.items || []).map((i) => ({ ...i, id: uid('li') })),
    })),
    actuals: (est.actuals || []).map((a) => ({ ...a, id: uid('ac') })),
  };
}

/**
 * A CSV cell, safe to open in a spreadsheet.
 *
 * Quoting alone is not enough. Excel, Sheets and LibreOffice treat a leading
 * =, +, -, @, tab or CR as the start of a FORMULA, so a line description of
 * `=cmd|'/c calc'!A1` executes when the operator opens their own export. These
 * descriptions are not all self-authored: they arrive from imported estimate
 * files and from intake links other people send. Prefixing with an apostrophe
 * is the standard neutralisation — spreadsheets treat the rest as literal text
 * and hide the quote.
 */
function csvCell(v) {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
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
    items: (raw.items || []).map(normalizeItem),
    isAudit: !!raw.isAudit,
    changeOrders: (raw.changeOrders || []).map(migrateChangeOrder),
    actuals: (raw.actuals || []).map(migrateActual),
    // Present-but-empty means the user deleted every entry on purpose. Only a
    // MISSING key falls back to defaults — otherwise deleted contract terms and
    // a discarded payment schedule silently reappear on the next reload.
    milestones: Array.isArray(raw.milestones) ? raw.milestones : base.milestones,
    terms: Array.isArray(raw.terms) ? raw.terms : base.terms,
  };
}

/** One shape for a line item, wherever it came from. */
function normalizeItem(i) {
  return {
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
  };
}

/** One logged cost: a receipt, an invoice from a sub, a week of payroll. */
function migrateActual(raw) {
  return {
    id: raw.id || uid('ac'),
    date: raw.date || todayISO(),
    category: raw.category || 'other',
    description: raw.description || '',
    amount: Number(raw.amount) || 0,
  };
}

function migrateChangeOrder(raw) {
  return {
    id: raw.id || uid('co'),
    number: raw.number || '',
    title: raw.title || '',
    reason: raw.reason || '',
    status: ['draft', 'sent', 'approved', 'rejected'].includes(raw.status) ? raw.status : 'draft',
    createdAt: raw.createdAt || todayISO(),
    decidedAt: raw.decidedAt || '',
    daysAdded: Number(raw.daysAdded) || 0,
    discount: raw.discount || null,
    signature: raw.signature || null,
    items: (raw.items || []).map(normalizeItem),
  };
}

export { STORAGE_KEY, SCHEMA_VERSION };

/* ------------------------------------------------- price book overrides --- */

/**
 * The user's own costs, layered over the shipped catalog. Kept on the Store
 * rather than in pricebook.js so that persistence, undo, and export all apply
 * to them exactly like any other edit.
 */
Object.assign(Store.prototype, {
  /** Set the user's cost for a shipped or custom sku. */
  setPriceBookCost(sku, unitCost) {
    this.update((s) => {
      const cur = s.priceBookOverrides[sku] || {};
      s.priceBookOverrides[sku] = { ...cur, unitCost: Number(unitCost) || 0 };
    }, { label: `pb-${sku}`, coalesce: true });
  },

  /** Drop an override so the shipped cost applies again. */
  resetPriceBookItem(sku) {
    this.update((s) => {
      const ov = s.priceBookOverrides[sku];
      if (!ov) return;
      if (ov.custom) delete s.priceBookOverrides[sku];
      else {
        const { unitCost, ...rest } = ov;
        if (Object.keys(rest).length) s.priceBookOverrides[sku] = rest;
        else delete s.priceBookOverrides[sku];
      }
    }, { label: 'pb-reset' });
  },

  /** Hide a shipped item the user never sells. */
  hidePriceBookItem(sku) {
    this.update((s) => {
      s.priceBookOverrides[sku] = { ...(s.priceBookOverrides[sku] || {}), hidden: true };
    }, { label: 'pb-hide' });
  },

  /** Add an item of the user's own. */
  addCustomPriceBookItem(item) {
    const sku = `USR-${uid('x').slice(2, 10).toUpperCase()}`;
    this.update((s) => {
      s.priceBookOverrides[sku] = {
        custom: true,
        description: item.description || 'Custom item',
        trade: item.trade || 'Custom',
        category: item.category || 'material',
        unit: item.unit || 'ea',
        unitCost: Number(item.unitCost) || 0,
      };
    }, { label: 'pb-add' });
    return sku;
  },

  /** How many shipped costs the user has corrected — drives a nudge in the UI. */
  priceBookEditCount() {
    return Object.values(this.state.priceBookOverrides || {})
      .filter((o) => o && !o.custom && o.unitCost !== undefined).length;
  },
});

/* ---------------------------------------------------------- change orders --- */

/**
 * Change orders live on the estimate they amend rather than as their own
 * top-level records. A change order without its contract is meaningless, and
 * keeping them together means export, import, undo, and duplication all work
 * on the whole job with no extra code.
 */
Object.assign(Store.prototype, {
  /** The change order currently being edited, if any. */
  activeChangeOrder() {
    const est = this.active();
    if (!est || !this.state.activeChangeOrderId) return null;
    return est.changeOrders.find((c) => c.id === this.state.activeChangeOrderId) || null;
  },

  setActiveChangeOrder(id) {
    this.update((s) => { s.activeChangeOrderId = id; }, { undoable: false });
  },

  addChangeOrder(partial = {}) {
    const est = this.active();
    if (!est) return null;
    // Numbering off the array length repeats a number as soon as an earlier
    // change order is deleted — and CO-02 appearing twice across two signed
    // authorizations is exactly the ambiguity these documents exist to remove.
    // Derive from the highest number ever used on this job instead.
    const seq = est.changeOrders.reduce((max, c) => {
      const n = parseInt(String(c.number || '').replace(/\D+/g, ''), 10);
      return Number.isFinite(n) ? Math.max(max, n) : max;
    }, 0) + 1;
    const order = {
      id: uid('co'),
      number: `CO-${String(seq).padStart(2, '0')}`,
      title: '',
      reason: '',
      status: 'draft',
      createdAt: todayISO(),
      decidedAt: '',
      daysAdded: 0,
      items: [],
      discount: null,
      signature: null,
      ...partial,
    };
    this.update((s) => {
      const e = s.estimates.find((x) => x.id === s.activeId);
      e.changeOrders.push(order);
      s.activeChangeOrderId = order.id;
    }, { label: 'add change order' });
    return order;
  },

  patchChangeOrder(id, patch, opts = {}) {
    this.update((s) => {
      const e = s.estimates.find((x) => x.id === s.activeId);
      const co = e?.changeOrders.find((c) => c.id === id);
      if (co) Object.assign(co, patch);
    }, { label: `co-${id}`, coalesce: true, ...opts });
  },

  removeChangeOrder(id) {
    this.update((s) => {
      const e = s.estimates.find((x) => x.id === s.activeId);
      if (!e) return;
      e.changeOrders = e.changeOrders.filter((c) => c.id !== id);
      if (s.activeChangeOrderId === id) s.activeChangeOrderId = e.changeOrders[0]?.id || null;
    }, { label: 'remove change order' });
  },

  /**
   * Approving or rejecting stamps the date. That date is the whole point of a
   * change order: it is the evidence that the client authorized the work
   * before it was performed, which is what makes the final invoice defensible.
   */
  setChangeOrderStatus(id, status) {
    this.update((s) => {
      const e = s.estimates.find((x) => x.id === s.activeId);
      const co = e?.changeOrders.find((c) => c.id === id);
      if (!co) return;
      co.status = status;
      co.decidedAt = (status === 'approved' || status === 'rejected') ? todayISO() : '';
    }, { label: 'change order status' });
  },

  addChangeOrderItem(coId, partial = {}) {
    const item = normalizeItem({ qty: 1, unitCost: 0, category: 'material', unit: 'ea', ...partial });
    item.markup = partial.markup === undefined ? null : partial.markup;
    this.update((s) => {
      const e = s.estimates.find((x) => x.id === s.activeId);
      const co = e?.changeOrders.find((c) => c.id === coId);
      if (co) co.items.push(item);
    }, { label: 'add co item' });
    return item;
  },

  patchChangeOrderItem(coId, itemId, patch, opts = {}) {
    this.update((s) => {
      const e = s.estimates.find((x) => x.id === s.activeId);
      const co = e?.changeOrders.find((c) => c.id === coId);
      const item = co?.items.find((i) => i.id === itemId);
      if (item) Object.assign(item, patch);
    }, { label: `co-item-${itemId}`, coalesce: true, ...opts });
  },

  removeChangeOrderItem(coId, itemId) {
    this.update((s) => {
      const e = s.estimates.find((x) => x.id === s.activeId);
      const co = e?.changeOrders.find((c) => c.id === coId);
      if (co) co.items = co.items.filter((i) => i.id !== itemId);
    }, { label: 'remove co item' });
  },
});

/* -------------------------------------------------------------- actuals --- */

/**
 * The actuals log is a checkbook, not an accounting system: date, category,
 * what it was, what it cost. The whole value of the feature is that logging a
 * receipt takes less time than losing it, so these stay as flat and dumb as
 * possible.
 */
Object.assign(Store.prototype, {
  addActual(partial = {}) {
    const entry = {
      id: uid('ac'),
      date: todayISO(),
      category: 'material',
      description: '',
      amount: 0,
      ...partial,
    };
    this.update((s) => {
      const est = s.estimates.find((e) => e.id === s.activeId);
      if (est) est.actuals.push(entry);
    }, { label: 'add actual' });
    return entry;
  },

  patchActual(id, patch, opts = {}) {
    this.update((s) => {
      const est = s.estimates.find((e) => e.id === s.activeId);
      const entry = est?.actuals.find((a) => a.id === id);
      if (entry) Object.assign(entry, patch);
    }, { label: `actual-${id}`, coalesce: true, ...opts });
  },

  removeActual(id) {
    this.update((s) => {
      const est = s.estimates.find((e) => e.id === s.activeId);
      if (est) est.actuals = est.actuals.filter((a) => a.id !== id);
    }, { label: 'remove actual' });
  },
});

/* ----------------------------------------------------------- actuals CSV --- */

/**
 * Flat CSV of the actuals log with the budget comparison appended — the
 * handoff to a bookkeeper or spreadsheet at the end of the job. Same escaping
 * rules as the line-item export.
 */
Object.assign(Store.prototype, {
  exportActualsCSV(costed) {
    const rows = [['Date', 'Category', 'Description', 'Amount']];
    for (const e of costed.entries) {
      rows.push([e.date, e.category, e.description, ((e.amountCents || 0) / 100).toFixed(2)]);
    }
    rows.push([]);
    rows.push(['Category', 'Budget', 'Spent', 'Over budget', '']);
    for (const [cat, v] of Object.entries(costed.byCategory)) {
      rows.push([
        cat,
        (v.budgetCents / 100).toFixed(2),
        (v.spentCents / 100).toFixed(2),
        (v.overrunCents / 100).toFixed(2),
        '',
      ]);
    }
    return rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
  },
});

/* --------------------------------------------------- audit intake --------- */

/**
 * Build a complete, audit-ready job from a contractor's summary numbers.
 *
 * The margin audit is the one offer worth selling, and its cost is the hour
 * spent rebuilding someone else's job line by line. A contractor cannot
 * reconstruct that detail from memory anyway — but they can tell you what they
 * quoted, roughly what they spent by trade, and what changed. That is enough
 * to measure all three leaks, so this takes exactly those figures.
 *
 * The synthetic lines are honest fiction: one line per category carrying the
 * whole budget for that trade. Quantities are meaningless and the report never
 * shows them, but every total the audit depends on is exact.
 *
 * @param {object} input
 * @param {string} input.title
 * @param {string} [input.client]
 * @param {number} input.quotedTotal      what the client was charged, pre-tax
 * @param {object} input.budget           estimated cost by category, dollars
 * @param {object} input.spent            actual cost by category, dollars
 * @param {Array}  [input.changes]        {title, amount, signed}
 */
Object.assign(Store.prototype, {
  createAuditJob(input) {
    const cats = ['labor', 'material', 'subcontractor', 'equipment', 'other'];
    const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

    const budget = input.budget || {};
    const spent = input.spent || {};
    // Only positive budgets become line items, so only positive budgets may
    // count toward the total the markup is derived from — otherwise a negative
    // figure skews the markup and the reconstruction stops matching what the
    // contractor said they charged.
    const budgetTotal = cats.reduce((a, c) => a + Math.max(0, num(budget[c])), 0);
    const quoted = num(input.quotedTotal);

    // Recover the markup the contractor actually used: the one that turns
    // their real costs into the price they really charged. Everything the
    // audit says about pricing follows from this, so it is derived from their
    // two numbers rather than assumed.
    const overhead = num(this.state.settings.overhead);
    const burdened = budgetTotal * (1 + overhead);
    const impliedMarkup = burdened > 0 ? (quoted - burdened) / burdened : 0;

    const created = todayISO();
    const estimate = newEstimate({
      title: input.title || 'Audited job',
      status: 'accepted',
      createdAt: created,
      updatedAt: created,
      client: { name: input.client || '', email: '', phone: '', address: '' },
      scopeSummary: 'Reconstructed from the contractor\'s own figures for a margin audit.',
      // Marks this as an audited job rather than one of the operator's own
      // quotes, so the portfolio report includes exactly the right set.
      isAudit: true,
      // Overhead is pinned alongside contingency and tax. Without it, changing
      // the global overhead rate silently reprices every audit already
      // delivered — and the implied markup above was derived against THIS
      // rate, so the reconstruction would stop matching what they charged.
      settings: { contingency: 0, taxMode: 'none', taxRate: 0, overhead },
    });

    estimate.items = cats
      .filter((c) => num(budget[c]) > 0)
      .map((c) => normalizeItem({
        description: `${CATEGORY_TITLES[c]} — as estimated`,
        category: c,
        unit: 'ls',
        qty: 1,
        unitCost: num(budget[c]),
        markup: impliedMarkup,
      }));

    estimate.actuals = cats
      .filter((c) => num(spent[c]) !== 0)
      .map((c) => ({
        id: uid('ac'),
        date: created,
        category: c,
        description: `${CATEGORY_TITLES[c]} — actually paid`,
        amount: num(spent[c]),
      }));

    estimate.changeOrders = (input.changes || [])
      .filter((ch) => num(ch.amount))
      .map((ch, i) => ({
        id: uid('co'),
        number: `CO-${String(i + 1).padStart(2, '0')}`,
        title: ch.title || 'Change',
        reason: ch.reason || '',
        status: ch.signed ? 'approved' : 'draft',
        createdAt: created,
        decidedAt: ch.signed ? created : '',
        daysAdded: 0,
        discount: null,
        signature: null,
        items: [normalizeItem({
          description: ch.title || 'Additional work',
          category: 'labor',
          unit: 'ls',
          qty: 1,
          // The figure the contractor gives is the PRICE of the change, not a
          // cost to build up from. Overhead is divided back out so the
          // pipeline's own overhead pass lands exactly on the amount they
          // named — otherwise a $2,400 change reconstructs as $2,640 and the
          // audit misquotes them back to themselves.
          unitCost: num(ch.amount) / (1 + overhead),
          markup: 0,
        })],
      }));

    // ONE undo step for the whole build. Assembling this through the granular
    // add* methods pushed a snapshot per sub-step, so a single Ctrl+Z after
    // "Build the audit" silently demoted the last signed change order to draft
    // instead of undoing the build — leaving a job that looked correct and was
    // not.
    this.update((st) => {
      estimate.number = `Q-${st.nextNumber}`;
      st.nextNumber += 1;
      st.estimates.unshift(estimate);
      st.activeId = estimate.id;
      st.activeChangeOrderId = estimate.changeOrders[0]?.id || null;
    }, { label: 'build audit' });

    return { estimate: this.active(), impliedMarkup };
  },
});

const CATEGORY_TITLES = {
  labor: 'Labor', material: 'Materials', subcontractor: 'Subcontractors',
  equipment: 'Equipment', other: 'Permits & fees',
};
