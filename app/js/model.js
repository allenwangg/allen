/**
 * model.js — Canonical data schema, validation, and normalization.
 *
 * Every entry the user logs passes through here before it touches storage or
 * the scoring engine. Keeping validation in one pure module means the engine
 * can assume clean input and the tests can generate synthetic days cheaply.
 */

/** Schema version. Bump when the shape of a DayEntry changes; add a migration. */
export const SCHEMA_VERSION = 3;

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
export function emptyEntry(key = dateKey()) {
  const e = { date: key, v: SCHEMA_VERSION, createdAt: Date.now(), updatedAt: Date.now(), notes: '' };
  for (const [name, f] of Object.entries(FIELDS)) e[name] = f.default;
  return e;
}

/**
 * Coerce and clamp an arbitrary object into a valid entry.
 * Returns { entry, errors } — never throws, because a bad import should
 * degrade gracefully rather than nuke the user's history.
 */
export function validateEntry(raw) {
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
