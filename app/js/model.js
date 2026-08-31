/**
 * model.js — Canonical data schema, validation, and normalization.
 *
 * Every entry the user logs passes through here before it touches storage or
 * the scoring engine. Keeping validation in one pure module means the engine
 * can assume clean input and the tests can generate synthetic days cheaply.
 */

/** Schema version. Bump when the shape of a DayEntry changes; add a migration. */
export const SCHEMA_VERSION = 4;

/* ------------------------------------------------------------------ *
 * Symptoms — the things you actually have.
 *
 * The 24 fields below are habits and biomarkers: what you do and what your
 * body reads. They are not what brought you here. Symptoms are user-defined
 * because a fixed list would be someone else's idea of what is wrong with you,
 * and because naming your own is the difference between a wellness app and a
 * notebook about your actual problem.
 *
 * They live in a sparse map on each entry (`entry.symptoms[id] = 0..4`) rather
 * than as columns, because the set changes over time and old entries must
 * survive a symptom being added or retired.
 * ------------------------------------------------------------------ */

/** Severity scale. 0 is a real observation ("didn't have it today"), not a gap. */
export const SEVERITY = [
  { value: 0, label: 'None',     short: '—' },
  { value: 1, label: 'Mild',     short: 'Mild' },
  { value: 2, label: 'Moderate', short: 'Mod' },
  { value: 3, label: 'Severe',   short: 'Sev' },
  { value: 4, label: 'Very bad', short: 'Bad' },
];
export const SEVERITY_MAX = 4;
export const MAX_SYMPTOMS = 12;

/**
 * A symptom id is opaque and permanent; the label is the user's and is freely
 * editable.
 *
 * Deriving the id from the label was a data-corruption bug. validateSymptoms
 * dedupes on id, so "Joint pain (knee)" and "joint-pain-knee" both slugged to
 * the same id and the second was silently dropped — and on import, a symptom
 * with no id got a label-derived one that could collide with an unrelated
 * existing symptom and merge two different histories into one series.
 *
 * An opaque id also means renaming a symptom keeps its history, which is what
 * anyone would expect.
 */
export function newSymptomId(existingIds = [], rand = Math.random) {
  const taken = new Set(existingIds);
  for (let i = 0; i < 50; i++) {
    const id = 's_' + rand().toString(36).slice(2, 10).padEnd(8, '0');
    if (!taken.has(id)) return id;
  }
  return 's_' + Date.now().toString(36);
}

/** Legacy slug form, kept only so ids already on disk still validate. */
export function symptomId(label) {
  const base = String(label).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32);
  return 's_' + (base || 'symptom');
}

/** Validate a user-supplied symptom list from settings or an import. */
export function validateSymptoms(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const label = typeof item.label === 'string' ? item.label.trim().slice(0, 60) : '';
    if (!label) continue;
    const id = typeof item.id === 'string' && /^s_[a-z0-9-]{1,32}$/.test(item.id)
      ? item.id
      : newSymptomId([...seen]);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      label,
      createdAt: Number(item.createdAt) || Date.now(),
      archivedAt: Number(item.archivedAt) || null,
      // The one the user most wants explained. Its correlations are corrected
      // as their own family so that adding a second symptom does not cost
      // statistical power on the first (see insights.js).
      primary: item.primary === true,
    });
  }
  // Exactly one primary, if any exist at all.
  const primaries = out.filter((x) => x.primary);
  if (primaries.length > 1) for (const x of primaries.slice(1)) x.primary = false;
  if (out.length && !primaries.length) out[0].primary = true;
  return out.slice(0, MAX_SYMPTOMS);
}

/** Severity map on an entry, cleaned. */
export function validateSymptomRatings(raw, symptoms) {
  const known = new Set((symptoms || []).map((s) => s.id));
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  let kept = 0;
  for (const [id, v] of Object.entries(Object(raw))) {
    // Shape check runs even when no symptom list is available. Guarding the
    // whitelist behind `known.size` meant a null list disabled it entirely,
    // and an import file could write unbounded arbitrary keys into every
    // entry. Import order is catalogue-then-entries, so a null list still has
    // to mean "shape-check only" rather than "drop everything" — otherwise
    // restoring a backup would erase its own ratings.
    if (!/^s_[a-z0-9-]{1,32}$/.test(id)) continue;
    if (known.size && !known.has(id)) continue;      // dropped symptom
    if (kept >= MAX_SYMPTOMS) break;
    const n = Number(v);
    if (!Number.isFinite(n)) continue;
    out[id] = clamp(Math.round(n), 0, SEVERITY_MAX);
    kept++;
  }
  return out;
}

/**
 * Field definitions drive validation, the log form UI, and the what-if
 * simulator. One source of truth, so a new metric is a one-line change here
 * plus a scoring curve.
 */
export const FIELDS = {
  sleepHours:        { label: 'Sleep duration',    unit: 'h',     min: 0,  max: 16,    step: 0.25, group: 'sleep',      default: 7.5 },
  sleepQuality:      { label: 'Sleep quality',     unit: '/5',    min: 1,  max: 5,     step: 1,    group: 'sleep',      default: 3 },
  bedtimeMinutes:    { label: 'Bedtime',           unit: 'clock', min: 0,  max: 1439,  step: 5,    group: 'sleep',      default: 1380, optional: true },
  steps:             { label: 'Steps',             unit: '',      min: 0,  max: 60000, step: 100,  group: 'movement',   default: 6000 },
  exerciseMinutes:   { label: 'Training',          unit: 'min',   min: 0,  max: 360,   step: 5,    group: 'movement',   default: 0 },
  exerciseIntensity: { label: 'Intensity',         unit: '/3',    min: 0,  max: 3,     step: 1,    group: 'movement',   default: 0 },
  strengthSession:   { label: 'Strength session',  unit: 'bool',  min: 0,  max: 1,     step: 1,    group: 'movement',   default: 0 },
  proteinGrams:      { label: 'Protein',           unit: 'g',     min: 0,  max: 400,   step: 5,    group: 'nutrition',  default: 90 },
  produceServings:   { label: 'Fruit + veg',       unit: 'srv',   min: 0,  max: 15,    step: 1,    group: 'nutrition',  default: 3 },
  ultraProcessed:    { label: 'Ultra-processed',   unit: 'srv',   min: 0,  max: 15,    step: 1,    group: 'nutrition',  default: 2 },
  fiberGrams:        { label: 'Fiber',             unit: 'g',     min: 0,  max: 120,   step: 1,    group: 'nutrition',  default: 22, optional: true },
  hydrationLitres:   { label: 'Water',             unit: 'L',     min: 0,  max: 8,     step: 0.25, group: 'nutrition',  default: 2 },
  alcoholUnits:      { label: 'Alcohol',           unit: 'units', min: 0,  max: 20,    step: 1,    group: 'substances', default: 0 },
  nicotine:          { label: 'Nicotine',          unit: 'bool',  min: 0,  max: 1,     step: 1,    group: 'substances', default: 0 },
  caffeineAfter2pm:  { label: 'Late caffeine',     unit: 'mg',    min: 0,  max: 600,   step: 25,   group: 'substances', default: 0 },
  stress:            { label: 'Stress',            unit: '/5',    min: 1,  max: 5,     step: 1,    group: 'recovery',   default: 3 },
  mood:              { label: 'Mood',              unit: '/5',    min: 1,  max: 5,     step: 1,    group: 'recovery',   default: 3 },
  energy:            { label: 'Energy',            unit: '/5',    min: 1,  max: 5,     step: 1,    group: 'recovery',   default: 3 },
  sunlightMinutes:   { label: 'Daylight',          unit: 'min',   min: 0,  max: 480,   step: 10,   group: 'recovery',   default: 20 },
  socialMinutes:     { label: 'Social contact',    unit: 'min',   min: 0,  max: 720,   step: 15,   group: 'recovery',   default: 60, optional: true },
  restingHR:         { label: 'Resting HR',        unit: 'bpm',   min: 30, max: 120,   step: 1,    group: 'biomarker',  default: null, optional: true },
  hrv:               { label: 'HRV (RMSSD)',       unit: 'ms',    min: 5,  max: 200,   step: 1,    group: 'biomarker',  default: null, optional: true },
  bodyweightKg:      { label: 'Bodyweight',        unit: 'kg',    min: 25, max: 300,   step: 0.1,  group: 'biomarker',  default: null, optional: true },
  waistCm:           { label: 'Waist',             unit: 'cm',    min: 40, max: 200,   step: 0.5,  group: 'biomarker',  default: null, optional: true },
};

export const GROUPS = {
  sleep:      { label: 'Sleep',      icon: 'moon'  },
  movement:   { label: 'Movement',   icon: 'run'   },
  nutrition:  { label: 'Nutrition',  icon: 'leaf'  },
  recovery:   { label: 'Recovery',   icon: 'heart' },
  substances: { label: 'Substances', icon: 'flask' },
  biomarker:  { label: 'Biomarkers', icon: 'pulse' },
};

/** Outcome fields — the things insights try to *explain*. */
export const OUTCOME_FIELDS = ['mood', 'energy', 'sleepQuality', 'restingHR', 'hrv', 'stress'];

/** Fields that are plausible *drivers* of the outcomes above. */
export const DRIVER_FIELDS = [
  'sleepHours', 'bedtimeMinutes', 'steps', 'exerciseMinutes', 'exerciseIntensity',
  'strengthSession', 'proteinGrams', 'produceServings', 'ultraProcessed',
  'fiberGrams', 'hydrationLitres', 'alcoholUnits', 'caffeineAfter2pm',
  'sunlightMinutes', 'socialMinutes', 'stress',
];

/** For fields where lower is better, insight copy must flip direction. */
export const LOWER_IS_BETTER = new Set([
  'ultraProcessed', 'alcoholUnits', 'nicotine', 'caffeineAfter2pm', 'stress',
  'restingHR', 'waistCm',
]);

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** ISO date key in *local* time — the user's "today", not UTC's. */
export function dateKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseDateKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key, n) {
  const d = parseDateKey(key);
  d.setDate(d.getDate() + n);
  return dateKey(d);
}

export function daysBetween(a, b) {
  return Math.round((parseDateKey(b) - parseDateKey(a)) / 86400000);
}

/** A blank day, pre-filled with sensible defaults so logging is fast. */
export function emptyEntry(key = dateKey(), symptoms = []) {
  const e = { date: key, v: SCHEMA_VERSION, createdAt: Date.now(), updatedAt: Date.now(), notes: '', symptoms: {} };
  for (const [name, f] of Object.entries(FIELDS)) e[name] = f.default;
  // A logged day with a symptom left untouched means "didn't have it", which
  // is real information — a symptom series made only of the bad days would be
  // all-severe and correlate with nothing.
  //
  // Guarded because `emptyEntry` is a one-argument function everywhere it is
  // passed to `.map()`, which would otherwise hand it an array index here.
  if (Array.isArray(symptoms)) {
    for (const s of symptoms) if (s && s.id && !s.archivedAt) e.symptoms[s.id] = 0;
  }
  return e;
}

/**
 * Coerce and clamp an arbitrary object into a valid entry.
 * Returns { entry, errors } — never throws, because a bad import should
 * degrade gracefully rather than nuke the user's history.
 */
export function validateEntry(raw, symptoms = null) {
  const errors = [];
  if (!raw || typeof raw !== 'object') return { entry: null, errors: ['not an object'] };
  if (typeof raw.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw.date)) {
    return { entry: null, errors: ['invalid or missing date'] };
  }
  const entry = {
    date: raw.date,
    v: SCHEMA_VERSION,
    createdAt: Number(raw.createdAt) || Date.now(),
    updatedAt: Date.now(),
    notes: typeof raw.notes === 'string' ? raw.notes.slice(0, 2000) : '',
    symptoms: validateSymptomRatings(raw.symptoms, symptoms),
  };
  for (const [name, f] of Object.entries(FIELDS)) {
    const val = raw[name];
    if (val === null || val === undefined || val === '') {
      if (f.optional) { entry[name] = null; continue; }
      entry[name] = f.default;
      continue;
    }
    const num = Number(val);
    if (!Number.isFinite(num)) {
      errors.push(`${name}: not a number (${JSON.stringify(val)})`);
      entry[name] = f.optional ? null : f.default;
      continue;
    }
    const clamped = clamp(num, f.min, f.max);
    if (clamped !== num) errors.push(`${name}: clamped ${num} -> ${clamped}`);
    entry[name] = clamped;
  }
  return { entry, errors };
}

/** Completeness drives the "log more to unlock better insights" nudge. */
export function completeness(entry) {
  const required = Object.entries(FIELDS).filter(([, f]) => !f.optional);
  let filled = 0;
  for (const [name] of required) if (entry[name] !== null && entry[name] !== undefined) filled++;
  return filled / required.length;
}

/** Extract one field across a date-sorted entry list, as a sparse series. */
export function series(entries, field) {
  return entries.map((e) => ({ date: e.date, value: e[field] === undefined ? null : e[field] }));
}
