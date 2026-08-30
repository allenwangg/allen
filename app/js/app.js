/**
 * app.js — Bootstrap, state, routing, and event delegation.
 *
 * One state object, one render function, one delegated click handler. Views are
 * pure string builders (ui.js), so nothing here needs to reason about the DOM
 * beyond swapping innerHTML and restoring focus.
 */

import { FIELDS, emptyEntry, validateEntry, dateKey, addDays, series } from './model.js';
import { buildReport, scoreDay, simulate, topLeverage, ewma } from './engine.js';
import { discover, weekdayPattern, alignedPairs } from './insights.js';
import { store } from './store.js';
import { resolveEntitlement, visibleEntries, startTrial, can } from './entitlements.js';
import { beginCheckout, openBillingPortal, restoreFromReceipt } from './billing.js';
import * as views from './ui.js';

const VIEWS = {
  today:     { render: views.todayView,     label: 'Today' },
  log:       { render: views.logView,       label: 'Log' },
  insights:  { render: views.insightsView,  label: 'Insights',  feature: 'insights' },
  simulator: { render: views.simulatorView, label: 'Simulator', feature: 'simulator' },
  history:   { render: views.historyView,   label: 'History' },
  report:    { render: views.reportView,    label: 'Report',    feature: 'report' },
  upgrade:   { render: views.upgradeView,   label: 'Pro' },
  settings:  { render: views.settingsView,  label: 'Settings' },
};

const state = {
  view: 'today',
  entries: [],
  visible: [],
  profile: { age: 35, weightKg: 75 },
  entitlementRaw: null,
  entitlement: { tier: 'free', status: 'free' },
  report: null,
  insights: null,
  weekday: null,
  leverage: null,
  simulation: null,
  simChanges: { sleepHours: 0, steps: 0, exerciseMinutes: 0, proteinGrams: 0, alcoholUnits: 0, produceServings: 0 },
  pairCache: {},
  smoothed: null,
  draft: emptyEntry(),
  draftScore: null,
  theme: 'system',
  storageMode: null,
  dirty: false,
  // A viewBox has a fixed aspect ratio, so a chart authored at 720x300 renders
  // only ~140px tall on a phone and the trend line becomes unreadable. The
  // views pick chart dimensions from this instead.
  narrow: typeof window !== 'undefined' && window.innerWidth < 620,
};

/* ------------------------------------------------------------------ *
 * Derivation — recompute everything downstream of entries.
 * ------------------------------------------------------------------ */

/**
 * discover() is by far the most expensive derivation (hundreds of ms on long
 * histories) and its inputs change only when an entry is saved, deleted or
 * imported — yet recompute() also runs on every slider release and profile
 * keystroke. Fingerprint what discovery actually depends on and skip it when
 * nothing relevant moved.
 */
let insightsFingerprint = null;

function entriesFingerprint() {
  let maxUpdated = 0;
  for (const e of state.entries) if (e.updatedAt > maxUpdated) maxUpdated = e.updatedAt;
  const last = state.entries.length ? state.entries[state.entries.length - 1].date : '';
  return `${state.entries.length}:${last}:${maxUpdated}:${can(state.entitlement, 'insights')}`;
}

function recompute() {
  state.entitlement = resolveEntitlement(state.entitlementRaw);
  state.visible = visibleEntries(state.entries, state.entitlement);

  const ctx = { age: Number(state.profile.age) || 35, weightKg: Number(state.profile.weightKg) || 75 };
  state.report = buildReport(state.visible, ctx);
  state.smoothed = ewma(state.report.scored.map((s) => s.score), 7);

  // Insights and the simulator always run on the FULL dataset, not the trimmed
  // view — a Pro user who just upgraded should see results immediately rather
  // than waiting for a recompute, and the gating happens at render time.
  if (can(state.entitlement, 'insights')) {
    state.insights = discover(state.entries);
    buildPairCache();
  } else {
    state.insights = state.entries.length < 21
      ? { status: 'insufficient-data', findings: [], have: state.entries.length, needed: 21,
          message: `Log ${Math.max(0, 21 - state.entries.length)} more days to unlock personal correlations.` }
      : { status: 'locked', findings: [], tested: 0 };
  }

  state.weekday = weekdayPattern(state.visible, (e) => scoreDay(e, ctx).score);
  state.leverage = can(state.entitlement, 'leverage') ? topLeverage(state.entries, ctx) : null;
  state.simulation = can(state.entitlement, 'simulator') ? simulate(state.entries, state.simChanges, ctx) : null;
  state.draftScore = scoreDay(state.draft, ctx);
}

/** Precompute scatter data for each shown insight so ui.js stays pure. */
function buildPairCache() {
  state.pairCache = {};
  if (!state.insights?.findings?.length) return;
  const byDate = new Map([...state.entries].sort((a, b) => (a.date < b.date ? -1 : 1)).map((e) => [e.date, e]));
  for (const f of state.insights.findings) {
    const { xs, ys } = alignedPairs(byDate, f.driver, f.outcome, f.lag);
    state.pairCache[`${f.driver}|${f.outcome}|${f.lag}`] = xs.map((x, i) => [x, ys[i]]);
  }
}

/* ------------------------------------------------------------------ *
 * Render
 * ------------------------------------------------------------------ */

const $ = (sel, root = document) => root.querySelector(sel);

function render() {
  const main = $('#main');
  const activeId = document.activeElement?.id;
  const scroll = window.scrollY;

  main.innerHTML = VIEWS[state.view].render(state);
  renderTabs();
  document.documentElement.setAttribute('data-theme', state.theme === 'system' ? '' : state.theme);
  if (state.theme === 'system') document.documentElement.removeAttribute('data-theme');

  // Restore focus after an innerHTML swap so slider dragging survives re-render.
  if (activeId) {
    const el = document.getElementById(activeId);
    if (el) { el.focus({ preventScroll: true }); window.scrollTo(0, scroll); }
  }
}

function renderTabs() {
  const tabs = $('#tabs');
  tabs.innerHTML = Object.entries(VIEWS).map(([id, v]) => {
    const locked = v.feature && !can(state.entitlement, v.feature);
    return `<button class="tab" role="tab" data-action="goto" data-view="${id}" aria-selected="${state.view === id}">`
      + `${v.label}${locked ? '<span class="lock" aria-label="Pro feature">&#128274;</span>' : ''}</button>`;
  }).join('');
}

function go(view) {
  if (!VIEWS[view]) view = 'today';
  state.view = view;
  history.replaceState(null, '', '#' + view);
  render();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

let toastTimer;
function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

/* ------------------------------------------------------------------ *
 * Actions
 * ------------------------------------------------------------------ */

/**
 * Draft navigation is serialized through this chain. Two rapid taps on the
 * day arrows used to interleave their awaits: both read the same
 * state.draft.date, both computed the same "next" day, and the second tap
 * was silently swallowed. Each navigation now starts only after the previous
 * one has fully settled.
 */
let navChain = Promise.resolve();
const serializeNav = (fn) => { navChain = navChain.then(fn, fn); return navChain; };

const actions = {
  goto: (el) => go(el.dataset.view),

  'shift-day': (el) => serializeNav(async () => {
    await persistDraftIfDirty();
    const next = addDays(state.draft.date, Number(el.dataset.delta));
    if (next > dateKey()) return;
    await loadDraft(next);
    render();
  }),

  // Persist a half-edited day before switching, exactly as the sibling
  // navigation paths (shift-day, the date input) do — silently discarding it
  // only here made data loss depend on which button the user happened to tap.
  'edit-day': (el) => serializeNav(async () => {
    await persistDraftIfDirty();
    await loadDraft(el.dataset.date);
    go('log');
  }),

  'save-entry': async () => {
    await saveDraft();
    toast('Day saved');
    go('today');
  },

  'delete-entry': async () => {
    if (!confirm(`Delete your entry for ${state.draft.date}? This cannot be undone.`)) return;
    await store.deleteEntry(state.draft.date);
    state.entries = state.entries.filter((e) => e.date !== state.draft.date);
    state.draft = emptyEntry(state.draft.date);
    state.dirty = false;
    recompute();
    toast('Entry deleted');
    go('today');
  },

  'start-trial': async () => {
    const next = startTrial(state.entitlementRaw || {});
    if (next.error) { toast(next.error); return; }
    state.entitlementRaw = next;
    await store.setMeta('entitlement', next);
    recompute();
    render();
    toast('Pro trial started — enjoy');
  },

  checkout: async (el) => {
    const plan = el.dataset.plan;
    el.disabled = true;
    el.textContent = 'Opening checkout…';
    try {
      const result = await beginCheckout(plan);
      if (result.redirected) return;              // navigating away
      if (result.simulated) {
        state.entitlementRaw = result.entitlement;
        await store.setMeta('entitlement', result.entitlement);
        recompute(); render();
        toast('Pro activated (demo mode)');
        return;
      }
      toast(result.message || 'Checkout unavailable right now.');
    } catch (err) {
      toast(err.message || 'Could not start checkout.');
    } finally {
      el.disabled = false;
    }
    render();
  },

  'manage-billing': async () => {
    const r = await openBillingPortal(state.entitlementRaw?.customerId, state.entitlementRaw?.portalToken);
    if (!r.redirected) toast(r.message || 'Billing portal unavailable.');
  },

  'reset-sim': () => {
    for (const k of Object.keys(state.simChanges)) state.simChanges[k] = 0;
    recompute(); render();
  },

  export: async () => {
    const data = await store.exportAll();
    download(`vitalarc-${dateKey()}.json`, JSON.stringify(data, null, 2), 'application/json');
    toast('Exported');
  },

  'export-csv': async () => {
    const fields = Object.keys(FIELDS);
    const header = ['date', 'score', ...fields, 'notes'];
    const ctx = { age: Number(state.profile.age) || 35, weightKg: Number(state.profile.weightKg) || 75 };
    const rows = state.entries.map((e) => {
      const s = scoreDay(e, ctx).score;
      return [e.date, s, ...fields.map((f) => (e[f] ?? '')), csvEscape(e.notes || '')].join(',');
    });
    download(`vitalarc-${dateKey()}.csv`, [header.join(','), ...rows].join('\n'), 'text/csv');
    toast('Exported CSV');
  },

  import: () => $('#import-file').click(),

  'print-report': () => window.print(),

  wipe: async () => {
    if (!confirm('Delete every entry and setting on this device? This cannot be undone. Export first if you want a backup.')) return;
    if (!confirm('Really delete everything? There is no recovery.')) return;
    await store.clearAll();
    state.entries = []; state.entitlementRaw = null; state.profile = { age: 35, weightKg: 75 };
    state.draft = emptyEntry();
    // The draft this flag referred to has just been destroyed; leaving it set
    // meant the next tap on Save quietly re-populated the wiped store, and
    // beforeunload nagged about "unsaved changes" that no longer exist.
    state.dirty = false;
    recompute(); go('today');
    toast('All data deleted');
  },
};

function csvEscape(s) {
  let v = String(s).replace(/"/g, '""');
  // Spreadsheet formula injection (CWE-1236): a note like `=HYPERLINK(...)`
  // or `+cmd|...` executes when the exported CSV is opened in Excel or
  // Sheets. A leading apostrophe forces text interpretation; spreadsheets
  // hide it, so the note still reads as written.
  if (/^[=+\-@\t\r]/.test(v)) v = "'" + v;
  return /[",\n']/.test(v) ? `"${v}"` : v;
}

function download(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ------------------------------------------------------------------ *
 * Draft handling
 * ------------------------------------------------------------------ */

async function loadDraft(date) {
  const existing = await store.getEntry(date);
  state.draft = existing ? { ...emptyEntry(date), ...existing } : emptyEntry(date);
  state.dirty = false;
  recompute();
}

async function saveDraft() {
  const { entry } = validateEntry(state.draft);
  if (!entry) { toast('Could not save — invalid date.'); return; }
  await store.putEntry(entry);
  const i = state.entries.findIndex((e) => e.date === entry.date);
  if (i >= 0) state.entries[i] = entry; else state.entries.push(entry);
  state.entries.sort((a, b) => (a.date < b.date ? -1 : 1));
  state.dirty = false;
  recompute();
}

async function persistDraftIfDirty() { if (state.dirty) await saveDraft(); }

/* ------------------------------------------------------------------ *
 * Event wiring — all delegated, so re-rendering never breaks handlers.
 * ------------------------------------------------------------------ */

function wire() {
  document.addEventListener('click', async (ev) => {
    const el = ev.target.closest('[data-action]');
    if (el && actions[el.dataset.action]) {
      ev.preventDefault();
      await actions[el.dataset.action](el);
      return;
    }
    // Segmented controls in the log form.
    const seg = ev.target.closest('[data-field][data-value]');
    if (seg) {
      ev.preventDefault();
      state.draft[seg.dataset.field] = Number(seg.dataset.value);
      state.dirty = true;
      recompute(); render();
      return;
    }
    const themeBtn = ev.target.closest('[data-theme-set]');
    if (themeBtn) {
      state.theme = themeBtn.dataset.themeSet;
      store.setMeta('theme', state.theme);
      render();
    }
  });

  // Sliders and text inputs: live update without a full re-render on every
  // pixel of drag, which would make the slider feel sticky.
  document.addEventListener('input', (ev) => {
    const t = ev.target;

    if (t.dataset.field) {
      const v = t.type === 'range' || t.type === 'number' ? Number(t.value) : t.value;
      state.draft[t.dataset.field] = v;
      state.dirty = true;
      const ctx = { age: Number(state.profile.age) || 35, weightKg: Number(state.profile.weightKg) || 75 };
      state.draftScore = scoreDay(state.draft, ctx);
      updateLiveScore(t);
      return;
    }

    if (t.dataset.sim) {
      state.simChanges[t.dataset.sim] = Number(t.value);
      const ctx = { age: Number(state.profile.age) || 35, weightKg: Number(state.profile.weightKg) || 75 };
      state.simulation = simulate(state.entries, state.simChanges, ctx);
      // Surgical DOM update only: a full render() here replaced the slider
      // element mid-drag, which released the pointer capture and killed the
      // drag after one step. The full re-render (for the pillar chart)
      // happens on the change event, when the drag ends.
      updateSimReadout(t);
      return;
    }

    if (t.dataset.profile) {
      state.profile[t.dataset.profile] = Number(t.value);
      store.setMeta('profile', state.profile);
      recompute();
      return;
    }

    if (t.id === 'log-date') {
      const d = t.value;
      if (d && d <= dateKey()) persistDraftIfDirty().then(() => loadDraft(d)).then(render);
    }
  });

  // A slider drag ends -> now it's worth a full re-render for the charts.
  document.addEventListener('change', (ev) => {
    if (ev.target.dataset.field && ev.target.type === 'range') { recompute(); render(); }
    else if (ev.target.dataset.sim) render();
  });

  $('#import-file').addEventListener('change', async (ev) => {
    const file = ev.target.files[0];
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text());
      const { imported, problems } = await store.importAll(payload, validateEntry);
      state.entries = await store.allEntries();
      state.profile = (await store.getMeta('profile')) || state.profile;
      // Rebuild the draft from the store: the import may have replaced the
      // very day the draft mirrors, and saving the stale pre-import draft
      // afterwards would clobber the imported entry.
      await loadDraft(state.draft.date);
      recompute(); render();
      toast(`Imported ${imported} day${imported === 1 ? '' : 's'}${problems.length ? ` (${problems.length} with warnings)` : ''}`);
    } catch (err) {
      toast('Import failed: ' + (err.message || 'unreadable file'));
    } finally {
      ev.target.value = '';
    }
  });

  window.addEventListener('hashchange', () => go(location.hash.slice(1) || 'today'));

  // Re-render on a width change that crosses the narrow breakpoint, so chart
  // geometry follows an orientation change or a resized window.
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const narrow = window.innerWidth < 620;
      if (narrow !== state.narrow) { state.narrow = narrow; render(); }
    }, 150);
  });

  // Don't silently lose a half-filled day.
  window.addEventListener('beforeunload', (ev) => {
    if (state.dirty) { ev.preventDefault(); ev.returnValue = ''; }
  });
}

/** Patch the simulator's readout numbers in place during a slider drag. */
function updateSimReadout(input) {
  const f = FIELDS[input.dataset.sim];
  const delta = Number(input.value);
  const out = input.closest('.field')?.querySelector('.field-value');
  if (out && f) {
    const unit = f.unit && f.unit !== 'bool' && f.unit !== 'clock' ? ' ' + f.unit : '';
    out.textContent = `${delta > 0 ? '+' : ''}${Math.round(delta * 100) / 100}${unit}`;
  }
  const sim = state.simulation;
  if (!sim) return;
  const stats = document.querySelectorAll('#main .stat-value');
  // Layout order in simulatorView: Current, Projected, Score change, Age change.
  if (stats.length >= 2) {
    stats[0].textContent = sim.baseline?.score ?? '--';
    stats[1].textContent = sim.projected?.score ?? '--';
  }
}

/**
 * Surgical DOM update during a slider drag: patch only the numbers that
 * changed rather than re-rendering the view. This is the difference between a
 * slider that feels native and one that stutters.
 */
function updateLiveScore(input) {
  const wrap = input.closest('.field');
  const out = wrap?.querySelector('.field-value');
  if (out) {
    const f = FIELDS[input.dataset.field];
    const v = Number(input.value);
    if (f?.unit === 'clock') {
      out.textContent = `${String(Math.floor(v / 60) % 24).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
    } else {
      out.textContent = `${Math.round(v * 100) / 100}${f?.unit && f.unit !== 'bool' ? ' ' + f.unit : ''}`;
    }
  }
  const stats = document.querySelectorAll('.card .stat-value');
  if (stats.length >= 4 && state.draftScore) {
    stats[0].textContent = state.draftScore.score ?? '--';
    stats[1].textContent = state.draftScore.pillars.sleep.score ?? '--';
    stats[2].textContent = state.draftScore.pillars.movement.score ?? '--';
    stats[3].textContent = state.draftScore.pillars.nutrition.score ?? '--';
  }
}

/* ------------------------------------------------------------------ *
 * Boot
 * ------------------------------------------------------------------ */

async function boot() {
  state.storageMode = await store._backend();
  const [entries, profile, entitlement, theme] = await Promise.all([
    store.allEntries(),
    store.getMeta('profile'),
    store.getMeta('entitlement'),
    store.getMeta('theme'),
  ]);

  state.entries = entries || [];
  if (profile) state.profile = { ...state.profile, ...profile };
  state.entitlementRaw = entitlement;
  if (theme) state.theme = theme;

  // A checkout return carries a receipt token; exchange it for entitlement.
  const restored = await restoreFromReceipt();
  if (restored) {
    state.entitlementRaw = restored;
    await store.setMeta('entitlement', restored);
  }

  await loadDraft(dateKey());
  recompute();
  wire();
  go(location.hash.slice(1) || (state.entries.length ? 'today' : 'log'));

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* offline support is a bonus, not a requirement */ });
  }
}

// Debug/support handle: lets a user (or a test) inspect the app's resolved
// state from the console without any framework devtools.
if (typeof window !== 'undefined') window.__vitalarc = { state };

boot().catch((err) => {
  document.getElementById('main').innerHTML =
    `<div class="card empty-state"><h3>Something went wrong starting VitalArc</h3>
     <p class="muted">${String(err && err.message || err)}</p>
     <p class="subtle">Your data is stored locally and has not been touched. Reloading usually fixes this.</p>
     <button class="btn btn-primary" onclick="location.reload()">Reload</button></div>`;
});
