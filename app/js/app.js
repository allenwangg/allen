/**
 * app.js — Bootstrap, state, routing, and event delegation.
 *
 * One state object, one render function, one delegated click handler. Views are
 * pure string builders (ui.js), so nothing here needs to reason about the DOM
 * beyond swapping innerHTML and restoring focus.
 */

import { FIELDS, emptyEntry, validateEntry, dateKey, addDays, series, validateSymptoms, validateFactors } from './model.js';
import { buildReport, scoreDay, simulate, topLeverage, ewma } from './engine.js';
import { discover, weekdayPattern, alignedPairs } from './insights.js';
import { createTrial, verdict, daysRemaining, DEFAULT_PAIRS } from './experiments.js';
import { checkFlags, checkNotesForCrisis, SUPPORT } from './safety.js';
import { store } from './store.js';
import { generateSampleData, SAMPLE_PROFILE, SAMPLE_SYMPTOMS, SAMPLE_FACTORS } from './sample.js';
import * as views from './ui.js';

const VIEWS = {
  today:     { render: views.todayView,     label: 'Today' },
  log:       { render: views.logView,       label: 'Log' },
  insights:  { render: views.insightsView,  label: 'Insights' },
  simulator: { render: views.simulatorView, label: 'Simulator' },
  trials:    { render: views.trialsView,    label: 'Trials' },
  history:   { render: views.historyView,   label: 'History' },
  report:    { render: views.reportView,    label: 'Report' },
  settings:  { render: views.settingsView,  label: 'Settings' },
};

const state = {
  view: 'today',
  entries: [],
  visible: [],
  profile: { age: 35, weightKg: 75, heightCm: null },
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
  sampleMode: false,
  symptoms: [],
  factors: [],
  trials: [],
  trialDraft: { leverId: null, outcome: null, pairs: DEFAULT_PAIRS },
  trialVerdict: null,
  flags: [],
  dismissedFlags: {},
  crisis: false,
  // Bumped on every entry mutation. discover() runs the full hypothesis grid
  // (measured 636ms on two years of data) and recompute() fires on every save
  // and slider release, so insights are recomputed only when the underlying
  // entries actually changed — not when a draft slider or a theme toggle did.
  entriesRev: 0,
  _insightsRev: -1,
  _insightsSymptoms: null,
  _insightsFactors: null,
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
  return `${state.entries.length}:${last}:${maxUpdated}`;
}

/** Scoring context derived from the user's profile. */
function profileCtx() {
  return {
    age: Number(state.profile.age) || 35,
    weightKg: Number(state.profile.weightKg) || 75,
    heightCm: Number(state.profile.heightCm) || null,
  };
}

function recompute() {
  // Everything the app can compute, it computes. There is no tier to check.
  state.visible = state.entries;

  const ctx = profileCtx();
  state.report = buildReport(state.visible, ctx);
  state.smoothed = ewma(state.report.scored.map((s) => s.score), 7);

  // The symptom list is part of the question being asked, so it belongs in
  // both the call and the memo key. Dropping it from the call left the whole
  // symptom-explanation feature dead in the running app while the unit tests —
  // which call discover() directly — kept passing. Leaving it out of the key
  // meant adding or removing a symptom would not recompute.
  const symptomsKey = state.symptoms.map((x) => x.id).join(',');
  const factorsKey = state.factors.map((x) => x.id).join(',');
  if (state.entriesRev !== state._insightsRev
      || symptomsKey !== state._insightsSymptoms
      || factorsKey !== state._insightsFactors) {
    state.insights = discover(state.entries, { symptoms: state.symptoms, factors: state.factors });
    buildPairCache();
    state._insightsRev = state.entriesRev;
    state._insightsSymptoms = symptomsKey;
    state._insightsFactors = factorsKey;
  }

  state.weekday = weekdayPattern(state.visible, (e) => scoreDay(e, ctx).score);
  state.leverage = topLeverage(state.entries, ctx);
  state.simulation = simulate(state.entries, state.simChanges, ctx);
  state.draftScore = scoreDay(state.draft, ctx);

  // A running trial only yields a verdict once its last day has passed. Not
  // computing it earlier is the point: a half-run experiment you can peek at
  // is an experiment you will stop when it looks good.
  state.flags = checkFlags(state.entries, {
    symptoms: state.symptoms,
    dismissedFlags: state.dismissedFlags,
  }, dateKey());

  const running = state.trials.find((t) => t.status === 'running');
  state.trialVerdict = running && daysRemaining(running, dateKey()) === 0
    ? verdict(running, state.entries, state.factors)
    : null;
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

  const sampleBanner = state.sampleMode
    ? `<div class="banner banner-info" data-sample-banner>
        <strong>Example data</strong>
        <span>None of this is yours — it is here so you can see what the app does before logging anything.</span>
        <div class="spacer"></div>
        <button class="btn btn-sm" data-action="clear-sample">Clear &amp; start my own log</button>
      </div>`
    : '';
  main.innerHTML = sampleBanner + safetyBanner(state) + VIEWS[state.view].render(state);
  renderTabs();
  document.documentElement.setAttribute('data-theme', state.theme === 'system' ? '' : state.theme);
  if (state.theme === 'system') document.documentElement.removeAttribute('data-theme');

  // Restore focus after an innerHTML swap so slider dragging survives re-render.
  if (activeId) {
    const el = document.getElementById(activeId);
    if (el) { el.focus({ preventScroll: true }); window.scrollTo(0, scroll); }
  }
}

/**
 * Flags sit above whatever view you are on, because the whole point is that
 * they are more important than the dashboard underneath them. At most two,
 * each dismissible, each then quiet for a month.
 */
function safetyBanner(state) {
  let html = '';
  if (state.crisis) {
    html += `<div class="card" style="border-color:var(--border-strong)">
      <h3 style="margin-bottom:.3em">${esc(SUPPORT.title)}</h3>
      <p class="muted">${esc(SUPPORT.body)}</p>
      <ul style="margin:0 0 10px;padding-left:18px">
        ${SUPPORT.routes.map((r) => `<li class="muted">${r.href
          ? `<a href="${esc(r.href)}" target="_blank" rel="noopener">${esc(r.label)}</a>`
          : `<strong>${esc(r.label)}</strong>`} — ${esc(r.note)}</li>`).join('')}
      </ul>
      <p class="subtle">${esc(SUPPORT.footer)}</p>
      <button class="btn btn-sm" data-action="dismiss-crisis">Close</button>
    </div>`;
  }
  for (const f of state.flags || []) {
    html += `<div class="card" data-flag="${esc(f.id)}">
      <div class="card-head"><h3 style="margin:0">${esc(f.title)}</h3></div>
      <p class="muted">${esc(f.detail)}</p>
      ${f.reopened ? '<p class="subtle">You marked this as seen recently, but it has got noticeably worse since.</p>' : ''}
      <p>${esc(f.ask)}</p>
      ${f.support ? `<ul style="margin:0 0 10px;padding-left:18px">
        ${SUPPORT.routes.map((r) => `<li class="muted">${r.href
          ? `<a href="${esc(r.href)}" target="_blank" rel="noopener">${esc(r.label)}</a>`
          : `<strong>${esc(r.label)}</strong>`} — ${esc(r.note)}</li>`).join('')}
      </ul>` : ''}
      <div style="display:flex;gap:9px;flex-wrap:wrap">
        <button class="btn btn-sm" data-action="goto" data-view="report">Put it in the report</button>
        <button class="btn btn-ghost btn-sm" data-action="dismiss-flag" data-id="${esc(f.id)}">I've seen this</button>
      </div>
    </div>`;
  }
  return html;
}

const esc = (v) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function renderTabs() {
  const tabs = $('#tabs');
  // Plain navigation semantics, not role="tab".
  //
  // These buttons switch the whole view; they are not a tab widget. Claiming
  // role=tab promises the ARIA tab pattern — roving tabindex, arrow-key
  // movement, aria-controls onto a tabpanel — none of which existed, so
  // screen-reader users were told to press arrow keys that did nothing.
  // aria-current="page" describes what is actually happening.
  tabs.innerHTML = Object.entries(VIEWS).map(([id, v]) => {
    const current = state.view === id;
    return `<button class="tab" id="tab-${id}" data-action="goto" data-view="${id}"`
      + `${current ? ' aria-current="page"' : ''}>`
      + `${v.label}</button>`;
  }).join('');
}

function go(view) {
  if (!VIEWS[view]) view = 'today';
  const cameFromNav = document.activeElement?.dataset?.action === 'goto';
  state.view = view;
  history.replaceState(null, '', '#' + view);
  document.title = `${VIEWS[view].label} — VitalArc`;
  render();
  window.scrollTo({ top: 0, behavior: 'instant' });
  // renderTabs() replaces every nav button, so a keyboard user who activated
  // one used to be dumped on <body> and had to tab from the top of the
  // document again. Put them back on the button they pressed.
  if (cameFromNav) document.getElementById(`tab-${view}`)?.focus({ preventScroll: true });
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
    const ok = await saveDraft();
    if (!ok) return;                 // saveDraft already told the user why
    toast('Day saved');
    go('today');
  },

  'delete-entry': async () => {
    if (!confirm(`Delete your entry for ${state.draft.date}? This cannot be undone.`)) return;
    await store.deleteEntry(state.draft.date);
    state.entries = state.entries.filter((e) => e.date !== state.draft.date);
    state.entriesRev++;
    state.draft = emptyEntry(state.draft.date);
    state.dirty = false;
    recompute();
    toast('Entry deleted');
    go('today');
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
    const ctx = profileCtx();
    const rows = state.entries.map((e) => {
      const s = scoreDay(e, ctx).score;
      return [e.date, s, ...fields.map((f) => (e[f] ?? '')), csvEscape(e.notes || '')].join(',');
    });
    download(`vitalarc-${dateKey()}.csv`, [header.join(','), ...rows].join('\n'), 'text/csv');
    toast('Exported CSV');
  },

  import: () => $('#import-file').click(),

  'print-report': () => window.print(),

  'start-trial': async () => {
    const d = state.trialDraft;
    const outcome = d.outcome || (state.symptoms.find((s) => !s.archivedAt)?.id) || 'energy';
    const sym = state.symptoms.find((s) => s.id === outcome);
    const { trial, error } = createTrial({
      factors: state.factors,
      leverId: d.leverId || 'no-late-caffeine',
      outcome,
      outcomeLabel: sym ? sym.label : (FIELDS[outcome]?.label || outcome),
      pairs: d.pairs || DEFAULT_PAIRS,
      startDate: dateKey(),
    });
    if (error) { toast(error); return; }
    state.trials = [...state.trials, trial];
    await store.setMeta('trials', state.trials);
    recompute(); render();
    toast('Trial started — log every day and do not peek');
  },

  'finish-trial': async (el) => {
    const t = state.trials.find((x) => x.id === el.dataset.id);
    if (!t) return;
    t.result = state.trialVerdict || verdict(t, state.entries, state.factors);
    t.status = 'complete';
    t.endedAt = Date.now();
    await store.setMeta('trials', state.trials);
    recompute(); render();
    toast('Saved');
  },

  'abandon-trial': async (el) => {
    const t = state.trials.find((x) => x.id === el.dataset.id);
    if (!t) return;
    if (!confirm('Stop this trial? A part-finished trial cannot give you an answer.')) return;
    t.status = 'abandoned';
    t.endedAt = Date.now();
    await store.setMeta('trials', state.trials);
    recompute(); render();
    toast('Trial stopped');
  },

  'dismiss-flag': async (el) => {
    // Record WHAT was acknowledged, not just when. A snooze must not go quiet
    // over a situation that has since got materially worse.
    const flag = (state.flags || []).find((f) => f.id === el.dataset.id);
    state.dismissedFlags = {
      ...state.dismissedFlags,
      [el.dataset.id]: { at: dateKey(), severity: Number.isFinite(flag?.severity) ? flag.severity : null },
    };
    await store.setMeta('dismissedFlags', state.dismissedFlags);
    recompute(); render();
  },

  'dismiss-crisis': () => { state.crisis = false; render(); },

  'add-factor': async () => {
    const input = document.getElementById('new-factor');
    const label = (input?.value || '').trim();
    if (!label) { toast('Give it a name first.'); return; }
    const norm = (x) => x.trim().toLowerCase();
    if (state.factors.some((f) => norm(f.label) === norm(label))) { toast('You already track that.'); return; }
    const next = validateFactors([...state.factors, { label }]);
    if (next.length === state.factors.length) { toast('You can track up to 12 of these.'); return; }
    state.factors = next;
    await store.setMeta('factors', state.factors);
    if (!state.draft.factors) state.draft.factors = {};
    for (const f of state.factors) if (state.draft.factors[f.id] === undefined) state.draft.factors[f.id] = 0;
    recompute(); render();
    toast(`Now tracking ${label}`);
  },

  'remove-factor': async (el) => {
    const fac = state.factors.find((f) => f.id === el.dataset.id);
    if (!fac) return;
    if (!confirm(`Stop tracking ${fac.label}? Days you already logged keep their entries.`)) return;
    state.factors = validateFactors(state.factors.filter((f) => f.id !== el.dataset.id));
    await store.setMeta('factors', state.factors);
    recompute(); render();
    toast(`Stopped tracking ${fac.label}`);
  },

  'add-symptom': async () => {
    const input = document.getElementById('new-symptom');
    const label = (input?.value || '').trim();
    if (!label) { toast('Give it a name first.'); return; }
    // Compare labels, not ids. Ids are opaque now, so an id derived from the
    // label matches nothing and this check silently stopped working.
    const norm = (x) => x.trim().toLowerCase();
    if (state.symptoms.some((s) => norm(s.label) === norm(label))) { toast('You already track that.'); return; }
    const next = validateSymptoms([...state.symptoms, { label }]);
    if (next.length === state.symptoms.length) { toast('You can track up to 12 symptoms.'); return; }
    state.symptoms = next;
    await store.setMeta('symptoms', state.symptoms);
    // Today's draft gains the new symptom at "none"; past days stay untouched,
    // so the series starts today rather than pretending you were fine before.
    if (!state.draft.symptoms) state.draft.symptoms = {};
    for (const s of state.symptoms) if (state.draft.symptoms[s.id] === undefined) state.draft.symptoms[s.id] = 0;
    recompute(); render();
    toast(`Now tracking ${label}`);
  },

  'remove-symptom': async (el) => {
    const id = el.dataset.id;
    const sym = state.symptoms.find((s) => s.id === id);
    if (!sym) return;
    if (!confirm(`Stop tracking ${sym.label}? Days you already logged keep their ratings.`)) return;
    state.symptoms = validateSymptoms(state.symptoms.filter((s) => s.id !== id));
    await store.setMeta('symptoms', state.symptoms);
    recompute(); render();
    toast(`Stopped tracking ${sym.label}`);
  },

  'set-primary-symptom': async (el) => {
    state.symptoms = validateSymptoms(state.symptoms.map((s) => ({ ...s, primary: s.id === el.dataset.id })));
    await store.setMeta('symptoms', state.symptoms);
    recompute(); render();
  },

  'load-sample': async () => {
    if (state.entries.length > 0) { toast('Clear your own data first — example and real days never mix.'); return; }
    await store.putMany(generateSampleData(dateKey()));
    await store.setMeta('sampleMode', true);
    await store.setMeta('profile', SAMPLE_PROFILE);
    // Without the catalogue the generated ratings are orphaned ids, and the
    // tour would demonstrate the app without its main feature.
    await store.setMeta('symptoms', SAMPLE_SYMPTOMS);
    await store.setMeta('factors', SAMPLE_FACTORS);
    state.symptoms = SAMPLE_SYMPTOMS;
    state.factors = SAMPLE_FACTORS;
    state.sampleMode = true;
    state.entries = await store.allEntries();
    state.entriesRev++;
    state.profile = { ...SAMPLE_PROFILE };
    await loadDraft(dateKey());
    recompute();
    go('today');
    toast('Example data loaded');
  },

  'clear-sample': async () => {
    await store.clearAll();
    state.entries = [];
    state.entriesRev++;
    state.sampleMode = false;
    state.symptoms = [];
    state.factors = [];
    state.profile = { age: 35, weightKg: 75, heightCm: null };
    state.draft = emptyEntry(dateKey(), state.symptoms, state.factors);
    state.dirty = false;
    recompute();
    go('log');
    toast('Cleared — this log is yours now');
  },

  wipe: async () => {
    if (!confirm('Delete every entry and setting on this device? This cannot be undone. Export first if you want a backup.')) return;
    if (!confirm('Really delete everything? There is no recovery.')) return;
    await store.clearAll();
    state.entries = []; state.entriesRev++; state.profile = { age: 35, weightKg: 75, heightCm: null };
    state.draft = emptyEntry(dateKey(), state.symptoms, state.factors);
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
  const blank = emptyEntry(date, state.symptoms, state.factors);
  state.draft = existing
    ? { ...blank, ...existing,
        symptoms: { ...blank.symptoms, ...(existing.symptoms || {}) },
        factors: { ...blank.factors, ...(existing.factors || {}) } }
    : blank;
  state.dirty = false;
  recompute();
}

async function saveDraft() {
  if (state.sampleMode) {
    toast('This is example data — clear it from the banner to start your own log.');
    return false;
  }
  const { entry } = validateEntry(state.draft, state.symptoms, state.factors);
  if (!entry) { toast('Could not save — invalid date.'); return false; }
  try {
    await store.putEntry(entry);
  } catch (err) {
    // Never claim a save that did not happen. The quota path used to be
    // swallowed inside the storage layer and the app toasted "Day saved"
    // over data that was already gone.
    toast(err.message || 'Could not save — storage unavailable.');
    return false;
  }
  const i = state.entries.findIndex((e) => e.date === entry.date);
  if (i >= 0) state.entries[i] = entry; else state.entries.push(entry);
  state.entries.sort((a, b) => (a.date < b.date ? -1 : 1));
  state.entriesRev++;
  state.dirty = false;
  recompute();
  return true;
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
    // Factor amount taps.
    const fac = ev.target.closest('[data-factor][data-value]');
    if (fac) {
      ev.preventDefault();
      if (!state.draft.factors) state.draft.factors = {};
      state.draft.factors[fac.dataset.factor] = Number(fac.dataset.value);
      state.dirty = true;
      recompute(); render();
      return;
    }

    // Symptom severity taps.
    const sym = ev.target.closest('[data-symptom][data-value]');
    if (sym) {
      ev.preventDefault();
      if (!state.draft.symptoms) state.draft.symptoms = {};
      state.draft.symptoms[sym.dataset.symptom] = Number(sym.dataset.value);
      state.dirty = true;
      recompute(); render();
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
      // Notes are checked in memory only — nothing about this is stored,
      // counted, or sent anywhere. See safety.js for why the check is narrow.
      if (t.dataset.field === 'notes' && !state.crisis && checkNotesForCrisis(v)) {
        state.crisis = true;
        render();
        return;
      }
      const ctx = profileCtx();
      state.draftScore = scoreDay(state.draft, ctx);

  // A running trial only yields a verdict once its last day has passed. Not
  // computing it earlier is the point: a half-run experiment you can peek at
  // is an experiment you will stop when it looks good.
  state.flags = checkFlags(state.entries, {
    symptoms: state.symptoms,
    dismissedFlags: state.dismissedFlags,
  }, dateKey());

  const running = state.trials.find((t) => t.status === 'running');
  state.trialVerdict = running && daysRemaining(running, dateKey()) === 0
    ? verdict(running, state.entries, state.factors)
    : null;
      updateLiveScore(t);
      return;
    }

    if (t.dataset.sim) {
      state.simChanges[t.dataset.sim] = Number(t.value);
      const ctx = profileCtx();
      state.simulation = simulate(state.entries, state.simChanges, ctx);
      // Surgical DOM update only: a full render() here replaced the slider
      // element mid-drag, which released the pointer capture and killed the
      // drag after one step. The full re-render (for the pillar chart)
      // happens on the change event, when the drag ends.
      updateSimReadout(t);
      return;
    }

    if (t.dataset.trial) {
      state.trialDraft[t.dataset.trial] = t.type === 'range' ? Number(t.value) : t.value;
      render();
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
    if (ev.target.dataset.trial) {
      state.trialDraft[ev.target.dataset.trial] = ev.target.value;
      render();
      return;
    }
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
      state.entriesRev++;
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
  // Three tiles since the healthspan-age figure was removed; an earlier
  // guard of >= 4 silently stopped updating any of them.
  if (stats.length >= 3) {
    stats[0].textContent = sim.baseline?.score ?? '--';
    stats[1].textContent = sim.projected?.score ?? '--';
    const d = sim.scoreDelta;
    const cls = d > 0.05 ? 'delta-good' : d < -0.05 ? 'delta-bad' : 'delta-flat';
    stats[2].innerHTML = `<span class="${cls}">${d > 0 ? '+' : ''}${d ?? '--'}</span> points`;
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
  const [entries, profile, theme, sampleMode, symptoms, factors, trials, dismissedFlags] = await Promise.all([
    store.allEntries(),
    store.getMeta('profile'),
    store.getMeta('theme'),
    store.getMeta('sampleMode'),
    store.getMeta('symptoms'),
    store.getMeta('factors'),
    store.getMeta('trials'),
    store.getMeta('dismissedFlags'),
  ]);

  state.sampleMode = !!sampleMode;
  state.symptoms = validateSymptoms(symptoms || []);
  state.factors = validateFactors(factors || []);
  state.trials = Array.isArray(trials) ? trials : [];
  state.dismissedFlags = (dismissedFlags && typeof dismissedFlags === 'object') ? dismissedFlags : {};
  state.entries = entries || [];
  if (profile) state.profile = { ...state.profile, ...profile };
  if (theme) state.theme = theme;

  await loadDraft(dateKey());
  recompute();
  wire();
  go(location.hash.slice(1) || (state.entries.length ? 'today' : 'log'));

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then(watchForUpdate)
      .catch(() => { /* offline support is a bonus, not a requirement */ });
  }
}

// Debug/support handle: lets a user (or a test) inspect the app's resolved
// state from the console without any framework devtools.
if (typeof window !== 'undefined') window.__vitalarc = { state };

/**
 * Surface a new version instead of stranding it.
 *
 * The service worker deliberately does not skipWaiting: activating a new
 * module set under a page that already imported the old one is how you get
 * half-updated code. So the new worker waits, and without this the user would
 * sit on the old build until every tab closed. Offering the reload is the
 * other half of that design.
 */
function watchForUpdate(reg) {
  if (!reg) return;
  const offer = (worker) => {
    if (!worker || !navigator.serviceWorker.controller) return;  // first install, nothing to replace
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return;
      reloading = true;
      location.reload();
    });
    const el = document.getElementById('update-banner');
    if (!el) return;
    el.hidden = false;
    el.querySelector('[data-action="apply-update"]').onclick = () => worker.postMessage('skip-waiting');
  };

  if (reg.waiting) offer(reg.waiting);
  reg.addEventListener('updatefound', () => {
    const installing = reg.installing;
    if (!installing) return;
    installing.addEventListener('statechange', () => {
      if (installing.state === 'installed') offer(reg.waiting || installing);
    });
  });
}

boot().catch((err) => {
  document.getElementById('main').innerHTML =
    `<div class="card empty-state"><h3>Something went wrong starting VitalArc</h3>
     <p class="muted">${String(err && err.message || err)}</p>
     <p class="subtle">Your data is stored locally and has not been touched. Reloading usually fixes this.</p>
     <button class="btn btn-primary" onclick="location.reload()">Reload</button></div>`;
});
