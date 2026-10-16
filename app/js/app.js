/**
 * app.js — Bootstrap, state, routing, and event delegation.
 *
 * One state object, one render function, one delegated click handler. Views are
 * pure string builders (ui.js), so nothing here needs to reason about the DOM
 * beyond swapping innerHTML and restoring focus.
 */

import { FIELDS, emptyEntry, validateEntry, dateKey, addDays, series, validateSymptoms, validateFactors } from './model.js';
import { buildReport, scoreDay, simulate, topLeverage, ewma } from './engine.js';
import { discover, weekdayEffects, loggingBiasChecks, symptomTrend, alignedPairs } from './insights.js';
import { createTrial, verdict, isComplete, getLever, floorP, DEFAULT_PAIRS } from './experiments.js';
import { commit as commitPrereg, verify as verifyPrereg } from './prereg.js';
import { issue as issueCertificate } from './certificate.js';
import { fieldAttention } from './attention.js';
import { buildReminder, reminderFilename } from './reminder.js';
import { validateClinical, addMedication, addHistory, removeFrom } from './clinical.js';
import { checkFlags, checkNotesForCrisis, SUPPORT } from './safety.js';
import { toCSV } from './csv.js';
import { store } from './store.js';
import { generateSampleData, SAMPLE_PROFILE, SAMPLE_SYMPTOMS, SAMPLE_FACTORS, SAMPLE_CLINICAL } from './sample.js';
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
  clinical: null,
  persistence: null,
  trials: [],
  trialDraft: { leverId: null, outcome: null, pairs: DEFAULT_PAIRS },
  trialVerdict: null,
  flags: [],
  reportFlags: [],
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
    // Per-symptom, not per-score: after the pivot the composite score is not
    // what anyone is here for, and "your Fridays cost you 6 points" was never
    // significance-tested at all — it named a worst day for everybody.
    //
    // Inside the memo, not after it: 3000 shuffles per symptom is 160ms on a
    // seven-symptom, six-month log, and recompute() runs on every slider drag.
    // Its inputs are exactly the memo key's, so there is nothing to recompute
    // between edits anyway.
    state.weekday = weekdayEffects(state.entries, state.symptoms);
    // Whether the log itself is trustworthy is upstream of every finding drawn
    // from it, so it is computed with them and shown above them.
    state.logBias = loggingBiasChecks(state.entries, state.symptoms);
    // Which habit questions are still worth a person's time. Same memo as the
    // rest: it reads the whole log and recompute() fires on every slider drag.
    state.attention = fieldAttention(state.entries);
    // The direction badge on the Today screen. Memoised with the rest because
    // it runs a permutation test per symptom, and recompute() fires on every
    // slider drag.
    state.symptomTrends = Object.fromEntries((state.symptoms || [])
      .filter((sym) => !sym.archivedAt)
      .map((sym) => [sym.id, symptomTrend(state.entries, sym.id)]));
    buildPairCache();
    state._insightsRev = state.entriesRev;
    state._insightsSymptoms = symptomsKey;
    state._insightsFactors = factorsKey;
  }

  state.leverage = topLeverage(state.entries, ctx);
  state.simulation = simulate(state.entries, state.simChanges, ctx);
  state.draftScore = scoreDay(knownDraft(), ctx);

  // A running trial only yields a verdict once its last day has passed. Not
  // computing it earlier is the point: a half-run experiment you can peek at
  // is an experiment you will stop when it looks good.
  const flagCtx = { symptoms: state.symptoms, dismissedFlags: state.dismissedFlags };
  // Two lists, deliberately. The banner is throttled so it stays readable; the
  // report is not, because leaving something out of what you hand a doctor is
  // a decision the user has not made by tapping "I've seen this".
  state.flags = checkFlags(state.entries, flagCtx, dateKey());
  state.reportFlags = checkFlags(state.entries, flagCtx, dateKey(), { all: true });

  const running = state.trials.find((t) => t.status === 'running');
  state.trialVerdict = running && isComplete(running, dateKey())
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
  renderDock();
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
    html += `<div class="card" data-crisis-card style="border-color:var(--border-strong)">
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

/**
 * What a phone shows without asking.
 *
 * Measured at 360, 390 and 430px: the top strip is 239px wide holding 616px of
 * tabs, so FIVE OF EIGHT destinations sat off-screen — Simulator, Trials,
 * History, Report and Settings — inside a horizontal scroller with a hidden
 * scrollbar and nothing to say there was more. The report, which is the whole
 * point of the app and the thing a clinician is handed, was unreachable on a
 * phone unless you happened to swipe a strip that gave no sign of being
 * swipeable.
 *
 * Four, chosen by what the app is for rather than by what exists: the daily
 * action, where you land, the findings, and the handoff. The rest are real
 * destinations and keep a real home — one tap, in a sheet, not buried.
 */
const DOCK_PRIMARY = ['today', 'log', 'insights', 'report'];

/** Where the layout stops being a desktop one. Matches the CSS breakpoint. */
const NARROW_PX = 620;

/** Render the phone dock, or take it away when the top strip fits. */
function renderDock() {
  const dock = $('#dock');
  const sheet = $('#dock-sheet');
  if (!dock) return;
  if (!state.narrow) {
    dock.hidden = true;
    sheet.hidden = true;
    document.body.classList.remove('has-dock', 'sheet-open');
    return;
  }
  dock.hidden = false;
  document.body.classList.add('has-dock');

  const rest = Object.keys(VIEWS).filter((id) => !DOCK_PRIMARY.includes(id));
  const inRest = rest.includes(state.view);
  dock.innerHTML = DOCK_PRIMARY.map((id) => {
    const current = state.view === id;
    return `<button class="dock-btn" id="dock-${id}" data-action="goto" data-view="${id}"`
      + `${current ? ' aria-current="page"' : ''}>${esc(VIEWS[id].label)}</button>`;
  }).join('')
    // "More" shows which section you are in when you are in one of its own, so
    // the dock never looks like nothing is selected.
    + `<button class="dock-btn dock-more" id="dock-more" data-action="toggle-dock-sheet"`
    + ` aria-expanded="${!sheet.hidden}" aria-controls="dock-sheet"`
    + `${inRest ? ' aria-current="page"' : ''}>${inRest ? esc(VIEWS[state.view].label) : 'More'}</button>`;

  sheet.innerHTML = `<div class="dock-sheet-inner">
    <div class="dock-sheet-head"><h2>Everything else</h2><div class="spacer"></div>
      <button class="btn btn-ghost btn-sm" data-action="toggle-dock-sheet">Close</button></div>
    ${rest.map((id) => `<button class="dock-sheet-btn" data-action="goto" data-view="${id}"`
      + `${state.view === id ? ' aria-current="page"' : ''}>${esc(VIEWS[id].label)}</button>`).join('')}
  </div>`;
}

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
  closeDockSheet();
  render();
  window.scrollTo({ top: 0, behavior: 'instant' });
  // renderTabs() replaces every nav button, so a keyboard user who activated
  // one used to be dumped on <body> and had to tab from the top of the
  // document again. Put them back on the button they pressed.
  if (cameFromNav) document.getElementById(`tab-${view}`)?.focus({ preventScroll: true });
}

function closeDockSheet() {
  const sheet = $('#dock-sheet');
  if (!sheet || sheet.hidden) return;
  sheet.hidden = true;
  document.body.classList.remove('sheet-open');
  $('#dock-more')?.setAttribute('aria-expanded', 'false');
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
    state.draft = emptyEntry(state.draft.date, state.symptoms, state.factors);
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
    // Symptom and factor ids live outside FIELDS, so a header built from
    // Object.keys(FIELDS) silently omitted every column the person actually
    // came here to track — the export looked complete and was not.
    const fields = Object.keys(FIELDS);
    // Archived ones too. A symptom tracked for three months and then retired
    // was dropped from the export entirely: its column vanished and the months
    // of ratings behind it went with it. The entries still hold those ratings,
    // so leaving them out is losing data on the way out of the app, which is
    // the one direction where losing it is unrecoverable.
    const label = (x) => (x.archivedAt ? `${x.label} (no longer tracked)` : x.label);
    const syms = [...(state.symptoms || [])].sort((a, b) => (a.archivedAt ? 1 : 0) - (b.archivedAt ? 1 : 0));
    const facs = [...(state.factors || [])].sort((a, b) => (a.archivedAt ? 1 : 0) - (b.archivedAt ? 1 : 0));
    const header = ['date', 'score', ...fields,
      ...syms.map((x) => `symptom: ${label(x)}`),
      ...facs.map((x) => `suspected: ${label(x)}`),
      'notes'];
    const ctx = profileCtx();
    const rows = state.entries.map((e) => {
      const s = scoreDay(e, ctx).score;
      return [e.date, s, ...fields.map((f) => (e[f] ?? '')),
        ...syms.map((x) => e.symptoms?.[x.id] ?? ''),
        ...facs.map((x) => e.factors?.[x.id] ?? ''),
        e.notes || ''];
    });
    // EVERY cell through the escaper, header included. Only the notes column
    // was escaped before, so a symptom the user had called "Joint pain (knee,
    // left)" shifted the header one column right of its data and every reading
    // in the file lined up under the wrong name. The labels are free text the
    // person typed; treating one column as dangerous and the rest as safe was
    // the bug.
    download(`vitalarc-${dateKey()}.csv`, toCSV(header, rows), 'text/csv');
    toast('Exported CSV');
  },

  import: () => $('#import-file').click(),

  'print-report': () => window.print(),

  // Carry a finding straight into a pre-filled trial.
  'test-finding': (el) => {
    state.trialDraft = {
      ...state.trialDraft,
      leverId: el.dataset.lever,
      outcome: el.dataset.outcome,
    };
    go('trials');
    toast('Pre-filled — check the length and start when you are ready');
  },

  'download-reminder': async () => {
    const at = document.getElementById('remind-at')?.value || '20:00';
    const [h, m] = at.split(':').map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) { toast('Pick a time first'); return; }
    state.remindAt = at;
    await store.setMeta('remindAt', at);
    download(reminderFilename(h, m), buildReminder({ hour: h, minute: m, startDate: dateKey() }), 'text/calendar');
    toast('Calendar file saved — open it to add the reminder');
  },

  /* -------- the clinical record -------- */

  'add-medication': async () => {
    const name = ($('#med-name')?.value || '').trim();
    const { clinical, error } = addMedication(state.clinical, {
      name,
      kind: $('#med-kind')?.value || 'prescription',
      dose: ($('#med-dose')?.value || '').trim(),
      forWhat: ($('#med-for')?.value || '').trim(),
      started: ($('#med-started')?.value || '').trim(),
    });
    if (error) { toast(error); return; }
    state.clinical = clinical;
    await store.setMeta('clinical', clinical);
    for (const id of ['med-name', 'med-dose', 'med-for', 'med-started']) {
      const el = $('#' + id); if (el) el.value = '';
    }
    render();
    $('#med-name')?.focus();
  },

  'remove-medication': async (el) => {
    state.clinical = removeFrom(state.clinical, 'medications', el.dataset.id);
    await store.setMeta('clinical', state.clinical);
    render();
  },

  'stop-medication': async (el) => {
    // "Stopped" is a date, and the person rarely knows it to the day. Today is
    // the honest default for a change made today, and the field stays editable.
    const c = validateClinical(state.clinical);
    state.clinical = validateClinical({
      ...c,
      medications: c.medications.map((m) => (m.id === el.dataset.id ? { ...m, stopped: dateKey() } : m)),
    });
    await store.setMeta('clinical', state.clinical);
    render();
  },

  'add-history': async () => {
    const { clinical, error } = addHistory(state.clinical, {
      what: ($('#hist-what')?.value || '').trim(),
      kind: $('#hist-kind')?.value || 'test',
      when: ($('#hist-when')?.value || '').trim(),
      outcome: ($('#hist-outcome')?.value || '').trim(),
    });
    if (error) { toast(error); return; }
    state.clinical = clinical;
    await store.setMeta('clinical', clinical);
    for (const id of ['hist-what', 'hist-when', 'hist-outcome']) {
      const el = $('#' + id); if (el) el.value = '';
    }
    render();
    $('#hist-what')?.focus();
  },

  'remove-history': async (el) => {
    state.clinical = removeFrom(state.clinical, 'history', el.dataset.id);
    await store.setMeta('clinical', state.clinical);
    render();
  },

  /**
   * Put a field back to "not measured".
   *
   * Before this there was no way back. A stray touch on the bodyweight slider
   * — parked at its 25kg minimum, because the field has no default — recorded
   * an adult as weighing 25kg, fed that into the protein target, and nothing in
   * the interface could retract it. An absence has to stay absent, which means
   * there has to be a way to return to one.
   *
   * Cleared into `touched`, not out of it: "I deliberately have no figure for
   * this" and "I never opened this field" both store null, and the distinction
   * only matters to the save path, which treats them the same. Adding it to
   * touched keeps the clear from being undone by a later save.
   */
  'clear-field': async (el) => {
    const name = el.dataset.field;
    if (!name || !(name in FIELDS)) return;
    state.draft[name] = null;
    (state.touched ||= new Set()).add(name);
    state.dirty = true;
    recompute(); render();
  },

  'toggle-dock-sheet': () => {
    const sheet = $('#dock-sheet');
    if (sheet.hidden) {
      sheet.hidden = false;
      document.body.classList.add('sheet-open');
      renderDock();
      sheet.querySelector('.dock-sheet-btn')?.focus();
    } else {
      closeDockSheet();
      $('#dock-more')?.focus();
    }
  },

  'show-all-fields': async () => { state.showAllFields = true; render(); },
  'hide-inert-fields': async () => { state.showAllFields = false; render(); },

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
    // Commit the design before the first day can possibly be logged. After
    // this the question, the length and the coin tosses are all fixed, and
    // any later change to them is detectable by anyone holding the digest.
    trial.prereg = await commitPrereg(trial);
    state.trials = [...state.trials, trial];
    await store.setMeta('trials', state.trials);
    recompute(); render();
    toast('Trial registered — log every day and do not peek');
  },

  'finish-trial': async (el) => {
    const t = state.trials.find((x) => x.id === el.dataset.id);
    if (!t) return;
    t.result = state.trialVerdict || verdict(t, state.entries, state.factors);
    // Check the finished trial against its own registration. A result that
    // cannot show the question came first is still arithmetic, but it is not
    // pre-registered evidence and must not be presented as though it were.
    t.preregCheck = await verifyPrereg(t);
    // The portable form of the result: design, registration digest, and the
    // per-pair differences that reproduce the p-value. Everything a third
    // party needs to check the claim, and nothing about the rest of the log.
    const lever = getLever(t.leverId, state.factors);
    t.certificate = await issueCertificate(t, t.result?.analysis, {
      verdictKind: t.result?.kind ?? null,
      leverLabel: lever?.label ?? t.leverId,
      adherence: t.result?.adherence ?? null,
    });
    t.status = 'complete';
    t.endedAt = Date.now();
    await store.setMeta('trials', state.trials);
    recompute(); render();
    toast('Saved');
  },

  'abandon-trial': async (el) => {
    const t = state.trials.find((x) => x.id === el.dataset.id);
    if (!t) return;
    const done = el.dataset.done === 'true';
    const msg = done
      ? 'Discard this result? The trial finished and has a valid answer; discarding it cannot be undone.'
      : 'Stop this trial? A part-finished trial cannot give you an answer.';
    if (!confirm(msg)) return;
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
    // The tour exists to show what the finished thing looks like. Without a
    // clinical record the sample report shows its medication section reading
    // "I have not listed these", which demonstrates the honesty rule and
    // nothing else.
    await store.setMeta('clinical', SAMPLE_CLINICAL);
    state.clinical = validateClinical(SAMPLE_CLINICAL);
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
    state.clinical = validateClinical(null);
    // A trial started during the tour measures a symptom that no longer
    // exists; carrying it into the real log leaves an un-completable trial
    // pointing at nothing.
    state.trials = [];
    state.dismissedFlags = {};
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
    state.clinical = validateClinical(null);
    state.draft = emptyEntry(dateKey(), state.symptoms, state.factors);
    // The draft this flag referred to has just been destroyed; leaving it set
    // meant the next tap on Save quietly re-populated the wiped store, and
    // beforeunload nagged about "unsaved changes" that no longer exist.
    state.dirty = false;
    recompute(); go('today');
    toast('All data deleted');
  },
};

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
  // The stored day's own ratings win, INCLUDING ids no longer tracked. The
  // settings copy promises "days you already logged keep their ratings", and
  // saving a re-opened day used to drop every rating for a removed symptom —
  // making that promise false the moment you edited an old day.
  state.draft = existing
    ? { ...blank, ...existing,
        symptoms: { ...blank.symptoms, ...(existing.symptoms || {}) },
        factors: { ...blank.factors, ...(existing.factors || {}) } }
    : blank;
  // Which habit fields this day genuinely holds a recorded value for. A blank
  // draft carries FIELDS defaults so the sliders have somewhere to sit — that
  // is a starting position, not something the person told us, and saving it as
  // though it were put twenty numbers a day into the record they hand a
  // doctor. See `known` in saveDraft.
  state.draftKnown = new Set(
    existing ? Object.keys(FIELDS).filter((k) => existing[k] != null) : []
  );
  state.touched = new Set();
  state.dirty = false;
  recompute();
}

async function saveDraft() {
  if (state.sampleMode) {
    toast('This is example data — clear it from the banner to start your own log.');
    return false;
  }
  const candidate = knownDraft();
  const { entry } = validateEntry(candidate, state.symptoms, state.factors, { keepUnknown: true });
  if (!entry) { toast('Could not save — invalid date.'); return false; }
  if ((state.draft.notes || '').length > 2000 && entry.notes.length === 2000) {
    // validateEntry caps notes at 2000 characters. Saying "Day saved" over a
    // silent truncation is the same class of lie as claiming a save that did
    // not happen.
    toast(`Saved, but your note was cut to 2000 characters (you wrote ${state.draft.notes.length}).`);
  }
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
  state.recovered = false;
  // The stash exists only to cover the window between an edit and its save.
  // Leaving it behind means the next boot offers to restore a day that is
  // already safely stored.
  store.clearStash();
  recompute();
  return true;
}

/**
 * The draft with everything nobody said stripped back out.
 *
 * `emptyEntry` pre-fills every field with a population default so the form is
 * fast to use, and the save path has always had to undo that — a habit field
 * nobody touched on a day nobody had touched before is unknown, and unknown is
 * not a number. A user who logged only their migraine for sixty days was
 * handing their doctor "Sleep 7.5 h, 60 days — self-measured at home", which
 * they had never said.
 *
 * It lives here rather than inside saveDraft because the LIVE SCORE needed it
 * too and did not have it. A brand-new user opening the app for the first time
 * was met with "LIVE SCORE 67.9 — SLEEP 83.2, MOVEMENT 31.6, NUTRITION 78.1"
 * computed entirely from those defaults, on the first screen of the app,
 * before they had entered a single thing. Scoring the same candidate the save
 * path would write makes the number mean what it says, and turns it into an
 * honest signal of how much you have actually told it.
 *
 * Symptoms and factors are deliberately left alone: an untouched symptom on a
 * logged day means "I did not have it", which is real information and is
 * documented as such in emptyEntry.
 */
function knownDraft() {
  const known = new Set([...(state.draftKnown || []), ...(state.touched || [])]);
  const candidate = { ...state.draft };
  for (const k of Object.keys(FIELDS)) if (!known.has(k)) candidate[k] = null;
  return candidate;
}

async function persistDraftIfDirty() { if (state.dirty) await saveDraft(); }

/**
 * Put back a day that a discarded tab took with it.
 *
 * Only for the day the stash is actually about, and only when the stash is
 * newer than what is stored — otherwise re-opening the app a week later would
 * resurrect a stale half-day over a complete saved one. The restored draft is
 * marked dirty rather than written straight to the database: the person gets to
 * see it and press Save, because silently committing numbers somebody did not
 * knowingly submit is the same error the fillDefaults fix removed.
 */
async function recoverStash() {
  const stash = store.readStash();
  if (!stash) return;
  if (stash.draft.date !== state.draft.date) { store.clearStash(); return; }
  const stored = state.entries.find((e) => e.date === stash.draft.date);
  if (stored && Number(stored.updatedAt || 0) >= stash.at) { store.clearStash(); return; }

  const { entry } = validateEntry(stash.draft, state.symptoms, state.factors, { keepUnknown: true });
  if (!entry) { store.clearStash(); return; }
  state.draft = { ...state.draft, ...stash.draft };
  state.touched = new Set(stash.touched);
  state.dirty = true;
  state.recovered = true;
  go('log');
  toast('Picked up where you left off — press Save to keep it');
}

/**
 * Save on the events that actually fire when a mobile session ends.
 *
 * `beforeunload` was the only safety net, and on iOS and Android a
 * backgrounded tab is reaped without firing it at all. `pagehide` and the
 * hidden transition of `visibilitychange` are the pair the platform actually
 * guarantees, so both do the work and `beforeunload` is left only as the
 * desktop "are you sure" prompt.
 *
 * The synchronous stash goes first and the asynchronous real save second. That
 * order is the point: once the page is frozen the IndexedDB callback may never
 * arrive, but a localStorage write issued here has already happened by the
 * time this function returns.
 */
function handoff() {
  if (!state.dirty) return;
  store.stashDraft(state.draft, state.touched);
  saveDraft().then((saved) => { if (saved) store.clearStash(); }, () => { /* the stash holds it */ });
}

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
      (state.touched ||= new Set()).add(seg.dataset.field);
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

    // A clock, entered as a clock. 288 slider positions to say "half eleven"
    // was absurd when the platform has a control for it.
    if (t.dataset.fieldTime) {
      const m = /^(\d{1,2}):(\d{2})/.exec(t.value || '');
      state.draft[t.dataset.fieldTime] = m ? Number(m[1]) * 60 + Number(m[2]) : null;
      (state.touched ||= new Set()).add(t.dataset.fieldTime);
      state.dirty = true;
      t.classList.toggle('is-unset', !m);
      state.draftScore = scoreDay(knownDraft(), profileCtx());
      updateLiveScore(t);
      return;
    }

    if (t.dataset.field) {
      let v;
      if (t.type === 'number') {
        // An emptied number field means "I did not measure this", NOT zero.
        // Number('') is 0, so without this branch clearing the bodyweight box
        // would record the person as weighing nothing — the exact failure the
        // save path was fixed to prevent, re-entering through the keyboard.
        v = t.value.trim() === '' ? null : Number(t.value);
        if (v != null && !Number.isFinite(v)) return;
      } else if (t.type === 'range') {
        v = Number(t.value);
      } else {
        v = t.value;
      }
      state.draft[t.dataset.field] = v;
      (state.touched ||= new Set()).add(t.dataset.field);
      state.dirty = true;
      // Notes are checked in memory only — nothing about this is stored,
      // counted, or sent anywhere. See safety.js for why the check is narrow.
      if (t.dataset.field === 'notes' && !state.crisis && checkNotesForCrisis(v)) {
        state.crisis = true;
        render();
        return;
      }
      // Only the live score. Recomputing flags and trial verdicts on every
      // keystroke belongs in recompute(), not in a drag handler — an earlier
      // edit anchored on a line that appears twice and pasted that whole block
      // in here, so every slider movement was re-running the safety rules.
      state.draftScore = scoreDay(knownDraft(), profileCtx());
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
      // Same lesson as the log form and the simulator: a full render during a
      // drag replaces the slider and releases the pointer capture, so the
      // "How long" control moved exactly one step and then stopped. Patch the
      // readout in place; the change event re-renders when the drag ends.
      if (t.type === 'range') updateTrialReadout(t);
      else render();
      return;
    }

    if (t.dataset.profile) {
      state.profile[t.dataset.profile] = Number(t.value);
      store.setMeta('profile', state.profile);
      recompute();
      return;
    }

    // Clinical free text. Written through on every keystroke and NOT
    // re-rendered: a render would replace the input mid-sentence and throw the
    // caret to the end, which is how the symptom name field used to behave.
    if (t.dataset.clinical) {
      state.clinical = validateClinical({ ...state.clinical, [t.dataset.clinical]: t.value });
      store.setMeta('clinical', state.clinical);
      return;
    }

    if (t.id === 'log-date') {
      const d = t.value;
      if (!d) return;
      if (d > dateKey()) {
        // The input has a max, but typing past it still fires input events.
        // Silently ignoring them left the field showing a date the app was not
        // editing, and the heading disagreeing with it.
        toast('You can only log days that have happened.');
        t.value = state.draft.date;
        return;
      }
      persistDraftIfDirty().then(() => loadDraft(d)).then(render);
    }
  });

  // A slider drag ends -> now it's worth a full re-render for the charts.
  document.addEventListener('change', (ev) => {
    if (ev.target.dataset.trial) {
      state.trialDraft[ev.target.dataset.trial] =
        ev.target.type === 'range' ? Number(ev.target.value) : ev.target.value;
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
      // Re-read EVERYTHING the import may have written. Reading only entries
      // left state.symptoms and state.factors empty, so the whole
      // symptom-explanation feature was dead until a reload — and the next
      // Settings write persisted that empty list over the imported catalogue,
      // permanently destroying it.
      state.entries = await store.allEntries();
      state.entriesRev++;
      state.profile = (await store.getMeta('profile')) || state.profile;
      state.symptoms = validateSymptoms((await store.getMeta('symptoms')) || []);
      state.factors = validateFactors((await store.getMeta('factors')) || []);
      const importedTrials = await store.getMeta('trials');
      state.trials = Array.isArray(importedTrials) ? importedTrials : state.trials;
      state.clinical = validateClinical(await store.getMeta('clinical'));
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

  // A sheet that cannot be dismissed without choosing something is a trap.
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && !$('#dock-sheet').hidden) {
      closeDockSheet();
      $('#dock-more')?.focus();
    }
  });
  $('#dock-sheet').addEventListener('click', (ev) => {
    // The backdrop is the element itself; the panel inside it is not.
    if (ev.target === ev.currentTarget) closeDockSheet();
  });

  window.addEventListener('hashchange', () => go(location.hash.slice(1) || 'today'));

  // Re-render on a width change that crosses the narrow breakpoint, so chart
  // geometry follows an orientation change or a resized window.
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const narrow = window.innerWidth < NARROW_PX;
      if (narrow !== state.narrow) { state.narrow = narrow; render(); }
    }, 150);
  });

  // Don't silently lose a half-filled day. See handoff(): visibilitychange and
  // pagehide are the events a phone actually fires; beforeunload is the
  // desktop confirmation dialog and nothing more.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') handoff();
  });
  window.addEventListener('pagehide', handoff);
  window.addEventListener('beforeunload', (ev) => {
    if (state.dirty) { handoff(); ev.preventDefault(); ev.returnValue = ''; }
  });
}

/**
 * Patch the trial-length readout in place during a drag: the day count, and
 * the smallest p-value the chosen length could ever produce.
 */
function updateTrialReadout(input) {
  const pairs = Number(input.value);
  const out = input.closest('.field')?.querySelector('.field-value');
  const lever = getLever(state.trialDraft.leverId || 'no-late-caffeine', state.factors);
  const blockDays = lever?.blockDays || 2;
  if (out) out.textContent = `${pairs * 2 * blockDays} days`;
  const note = input.closest('.field')?.querySelector('.subtle strong');
  if (note) note.textContent = `p = ${floorP(pairs).toFixed(3)}`;
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
  const name = input.dataset.field || input.dataset.fieldTime;
  const f = FIELDS[name];
  const v = state.draft[name];

  // The slider and the typed box are two views of one number, and neither may
  // re-render during use: a full render replaces a slider mid-drag (which
  // releases the pointer capture and kills the drag after one step) and throws
  // the caret to the end of a number field mid-word. So they are synced in
  // place, each updating the other.
  if (wrap) {
    const range = wrap.querySelector('input[type=range]');
    const num = wrap.querySelector('input.field-num');
    if (range && range !== input && v != null) range.value = String(v);
    if (num && num !== input) num.value = v == null ? '' : String(Math.round(v * 100) / 100);
    if (range) range.classList.toggle('is-unset', v == null);
    const clear = wrap.querySelector('.field-clear');
    if (clear) clear.hidden = v == null;
  }

  const out = wrap?.querySelector('.field-value');
  if (out) {
    if (v == null) {
      out.textContent = 'not said';
    } else if (f?.unit === 'clock') {
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
  // Set before the first paint. This was only ever assigned by the resize
  // handler, so until the window changed size `state.narrow` was undefined and
  // every chart on a phone rendered at its desktop geometry on first load.
  state.narrow = typeof window !== 'undefined' && window.innerWidth < NARROW_PX;
  state.storageMode = await store._backend();
  const [entries, profile, theme, sampleMode, symptoms, factors, trials, dismissedFlags, remindAt, clinical] = await Promise.all([
    store.allEntries(),
    store.getMeta('profile'),
    store.getMeta('theme'),
    store.getMeta('sampleMode'),
    store.getMeta('symptoms'),
    store.getMeta('factors'),
    store.getMeta('trials'),
    store.getMeta('dismissedFlags'),
    store.getMeta('remindAt'),
    store.getMeta('clinical'),
  ]);

  state.sampleMode = !!sampleMode;
  state.symptoms = validateSymptoms(symptoms || []);
  state.factors = validateFactors(factors || []);
  state.trials = Array.isArray(trials) ? trials : [];
  state.dismissedFlags = (dismissedFlags && typeof dismissedFlags === 'object') ? dismissedFlags : {};
  state.entries = entries || [];
  if (profile) state.profile = { ...state.profile, ...profile };
  if (theme) state.theme = theme;
  if (typeof remindAt === 'string') state.remindAt = remindAt;
  state.clinical = validateClinical(clinical);

  // Ask the browser not to evict the only copy of the diary. Not awaited
  // before first paint — on Firefox this can show a permission prompt, and
  // holding the whole app behind a dialog on launch is worse than learning the
  // answer a moment later.
  store.requestPersistence().then(async (p) => {
    state.persistence = { ...p, estimate: await store.storageEstimate() };
    if (state.view === 'settings') render();
  });

  await loadDraft(dateKey());
  await recoverStash();
  recompute();
  wire();
  // A first-time user goes to Today, not to Log.
  //
  // Routing a zero-day user straight at the log screen put 86 controls in
  // front of somebody who had not been told what the app was for, and skipped
  // the welcome entirely — including the only entry point to the example-data
  // tour, which is the one thing that lets them judge the app before spending
  // three weeks on it. The Today view's empty state IS the first-run screen;
  // it was simply unreachable on a first launch.
  go(location.hash.slice(1) || 'today');

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
  // Whether a worker was ALREADY controlling this page when it loaded.
  //
  // Checking navigator.serviceWorker.controller inside the handler is too
  // late: the first install activates and calls clients.claim(), so by the
  // time the statechange fires there IS a controller and the very first visit
  // was told "a new version of VitalArc is ready" — a banner about an update
  // that had just been installed for the first time, floating over the UI on
  // every launch with nothing to apply.
  const hadController = !!navigator.serviceWorker.controller;
  const offer = (worker) => {
    if (!worker || !hadController) return;   // nothing was there to replace
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
