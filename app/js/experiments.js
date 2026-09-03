/**
 * experiments.js — Single-subject (n-of-1) trials.
 *
 * WHY THIS EXISTS. Everything else in this app is observational: it can tell
 * you what moves together in your log, and no amount of statistical care makes
 * that causal. If you actually want to know whether cutting afternoon coffee
 * helps your sleep, someone has to change the coffee on purpose and watch what
 * happens. That is what this module does, and it is the only part of the app
 * that can support a sentence like "this helped".
 *
 * THE DESIGN, and why each choice is forced.
 *
 * Block-randomized, paired. The trial is split into K pairs of consecutive
 * blocks; within each pair a coin decides which block is ON. That buys three
 * things a simple before/after cannot:
 *   - Time is balanced. Anything drifting over the trial (season, a healing
 *     injury, your enthusiasm) hits ON and OFF blocks about equally.
 *   - The randomization is KNOWN, so the analysis can be an exact randomization
 *     test rather than a model with assumptions nobody checked.
 *   - Blocks, not single days, because most levers need a day to act and
 *     alternating daily would mostly measure carryover.
 *
 * SIX PAIRS IS A HARD FLOOR. The reference set for the test is exactly the 2^K
 * ways the coins could have landed, so the smallest two-sided p the trial can
 * ever produce is 2/2^K. At five pairs that floor is 0.0625 — above 0.05, so a
 * five-pair trial CANNOT return a significant result however large the effect,
 * and running one would waste five weeks of someone's life to guarantee an
 * inconclusive answer. This module refuses to create one. (The same arithmetic
 * silently discarded a correlation of -0.91 elsewhere in this codebase before
 * it was caught; see docs/INSIGHTS.md.)
 *
 * WHAT IT CANNOT DO. You know which block you are in. Nothing here is blinded,
 * so an effect measured on a self-rated outcome includes whatever your
 * expectations contribute — this is stated in the verdict rather than hidden.
 * It also only ever tests ONE thing, on ONE person, over a few weeks.
 */

import { FIELDS, dateKey, addDays, daysBetween } from './model.js';

export const MIN_PAIRS = 6;            // below this the p-value floor exceeds 0.05
export const DEFAULT_PAIRS = 7;

/**
 * Longest trial the app will let someone set up.
 *
 * The slider used to stop at 10 pairs — 40 days — which quietly made a whole
 * class of question unanswerable. A trial's power is governed by how many days
 * carrying the symptom fall inside it, so for anything that does not happen
 * most days, 40 days is not a short trial, it is a futile one: measured, with a
 * lever that removes the symptom ENTIRELY, a 48-day trial on a symptom present
 * 20% of days comes back "helped" 17% of the time. Capping the slider there
 * offered people six weeks of effort for a foregone conclusion.
 *
 * It does not go higher than 20 because analyze() enumerates the exact
 * reference set — all 2^pairs sign flips — and that is what makes the p-value
 * exact rather than sampled. The cost doubles per pair: 91 ms at 20 pairs,
 * 376 ms at 22, and around a minute and a half at 30, which is a frozen app.
 * Twenty pairs is where an exact test stops being affordable, so it is where
 * the slider stops.
 */
export const MAX_PAIRS = 20;
export const DEFAULT_BLOCK_DAYS = 2;
export const ALPHA = 0.05;
export const MIN_ADHERENCE = 0.75;     // of ON-block days
export const MIN_CONTRAST = 0.5;       // ON vs OFF separation, 0..1

/* ------------------------------------------------------------------ *
 * Levers — what you are allowed to test on yourself
 *
 * Deliberately a fixed list of everyday behaviours. Nothing here involves
 * medication, supplements, fasting or restriction: this app has no clinician
 * in it, and an app that helps you run experiments on your prescriptions is
 * not a notebook, it is a hazard.
 * ------------------------------------------------------------------ */

export const LEVERS = [
  { id: 'no-late-caffeine', label: 'No caffeine after 2pm', field: 'caffeineAfter2pm',
    on: { op: 'lte', value: 0 }, off: { op: 'gte', value: 50 },
    onText: 'no caffeine after 2pm', offText: 'caffeine as usual',
    note: 'Works fastest of the lot — a 2-day block is plenty.' },
  { id: 'no-alcohol', label: 'No alcohol', field: 'alcoholUnits',
    on: { op: 'lte', value: 0 }, off: { op: 'gte', value: 1 },
    onText: 'no alcohol', offText: 'drink as usual',
    note: 'Only worth testing if you normally drink on most days — otherwise the OFF blocks will not differ.' },
  { id: 'earlier-bed', label: 'In bed by 23:00', field: 'bedtimeMinutes',
    on: { op: 'lte', value: 1380 }, off: { op: 'gte', value: 1410 },
    onText: 'in bed by 23:00', offText: 'usual bedtime',
    note: 'Bedtime, not sleep — you control when you get in, not when you drop off.' },
  { id: 'more-steps', label: '10,000 steps', field: 'steps',
    on: { op: 'gte', value: 10000 }, off: { op: 'lte', value: 7000 },
    onText: '10,000 steps', offText: 'usual activity' },
  { id: 'strength', label: 'A strength session', field: 'strengthSession',
    on: { op: 'gte', value: 1 }, off: { op: 'lte', value: 0 },
    onText: 'strength training', offText: 'no strength training',
    blockDays: 3, note: 'Slower to act, so this one uses 3-day blocks.' },
  { id: 'cut-processed', label: 'At most one ultra-processed serving', field: 'ultraProcessed',
    on: { op: 'lte', value: 1 }, off: { op: 'gte', value: 3 },
    onText: 'barely any ultra-processed food', offText: 'usual diet',
    blockDays: 3 },
  { id: 'daylight', label: '30 minutes of daylight', field: 'sunlightMinutes',
    on: { op: 'gte', value: 30 }, off: { op: 'lte', value: 10 },
    onText: '30+ minutes outside', offText: 'usual time outside' },
  { id: 'hydration', label: 'Drink 2.5 litres of water', field: 'hydrationLitres',
    on: { op: 'gte', value: 2.5 }, off: { op: 'lte', value: 1.5 },
    onText: '2.5 L of water', offText: 'usual fluids' },
  { id: 'social', label: 'An hour of company', field: 'socialMinutes',
    on: { op: 'gte', value: 60 }, off: { op: 'lte', value: 20 },
    onText: 'an hour with other people', offText: 'usual amount of company',
    blockDays: 3 },
];

/**
 * A user-tracked factor becomes a lever: "avoid it" versus "carry on".
 *
 * This is the point of the whole feature. Observing that your dairy days are
 * worse can only ever be a hypothesis; deliberately not having it on randomly
 * chosen blocks is what turns that into an answer. Without this, the app can
 * only run experiments on the twenty habits I happened to think of.
 */
export function factorLever(factor) {
  if (!factor || !factor.id) return null;
  const name = factor.label.toLowerCase();
  return {
    id: `factor:${factor.id}`,
    label: `Avoid ${name}`,
    field: factor.id,
    on: { op: 'lte', value: 0 },
    off: { op: 'gte', value: 1 },
    onText: `no ${name}`,
    offText: `${name} as usual`,
    note: 'Only worth testing if this is normally part of most weeks — otherwise the OFF blocks will not differ from the ON ones.',
    userDefined: true,
  };
}

/**
 * The lever that would test a given driver, if one exists.
 *
 * Closes the loop between the two halves of the app: observing that your dairy
 * days are worse is a hypothesis, and the only honest next step is to vary it
 * on purpose. Without this the user has to notice the finding, go to Trials,
 * and re-pick the same two things from scratch — so most people never take the
 * step that turns a correlation into an answer.
 *
 * Returns null for drivers nothing can deliberately change (resting heart
 * rate, HRV), and for a windowed driver it offers the underlying lever, since
 * "avoid it for a week" is just avoiding it.
 */
export function leverForDriver(driver, factors = []) {
  const base = driver.startsWith('w7_') ? driver.slice(3) : driver;
  if (base.startsWith('f_')) {
    const fac = (factors || []).find((f) => f.id === base && !f.archivedAt);
    return fac ? factorLever(fac) : null;
  }
  return LEVERS.find((l) => l.field === base) || null;
}

/** All levers available to this user: the built-ins plus their own factors. */
export function leversFor(factors = []) {
  return [...LEVERS, ...(factors || []).filter((f) => f && !f.archivedAt).map(factorLever)];
}

export const getLever = (id, factors = []) => leversFor(factors).find((l) => l.id === id) || null;

/** Read a lever's field, resolving user factors out of the sparse map. */
export function readLeverField(entry, field) {
  if (!entry) return null;
  if (field.startsWith('f_')) {
    const v = entry.factors ? entry.factors[field] : undefined;
    return v === undefined ? null : v;
  }
  const v = entry[field];
  return v === undefined ? null : v;
};

const meets = (value, rule) => {
  if (value == null || !rule) return false;
  return rule.op === 'lte' ? value <= rule.value : value >= rule.value;
};

/* ------------------------------------------------------------------ *
 * Creating a trial
 * ------------------------------------------------------------------ */

/** Deterministic PRNG so a trial's schedule is reproducible from its seed. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The smallest two-sided p this design can produce. Shown BEFORE the trial
 * starts, because a design that cannot answer the question is worth knowing
 * about in week zero rather than week five.
 */
export const floorP = (pairs) => 2 / Math.pow(2, pairs);

export function createTrial({ leverId, outcome, outcomeLabel, pairs = DEFAULT_PAIRS, blockDays, startDate, seed, factors = [] }) {
  const lever = getLever(leverId, factors);
  if (!lever) return { error: 'Unknown lever.' };
  if (!outcome) return { error: 'Pick something to measure first.' };
  if (pairs > MAX_PAIRS) {
    return { error: `A trial of more than ${MAX_PAIRS} block-pairs (${MAX_PAIRS * 2 * 2} days) is longer than anyone will see through.` };
  }
  if (pairs < MIN_PAIRS) {
    return { error: `A trial needs at least ${MIN_PAIRS} block-pairs. With fewer, the smallest possible p-value is above 0.05 — it could not come back significant even if the effect were enormous.` };
  }

  const bd = blockDays || lever.blockDays || DEFAULT_BLOCK_DAYS;
  const s = seed ?? (Date.now() & 0x7fffffff);
  const rand = rng(s);

  // One coin per pair: which of the two blocks is ON. This exact set of 2^K
  // possibilities is what the analysis permutes over later.
  const assignment = [];
  for (let i = 0; i < pairs; i++) {
    const onFirst = rand() < 0.5;
    assignment.push(onFirst ? 'on' : 'off', onFirst ? 'off' : 'on');
  }

  return {
    trial: {
      id: `t_${s.toString(36)}`,
      createdAt: Date.now(),
      leverId,
      // Pre-registered at creation and never editable. Choosing the outcome
      // after seeing the data is how you find an effect in anything.
      outcome,
      outcomeLabel: outcomeLabel || outcome,
      pairs,
      blockDays: bd,
      startDate: startDate || dateKey(),
      seed: s,
      assignment,
      status: 'running',
      endedAt: null,
    },
  };
}

export const trialDays = (t) => t.pairs * 2 * t.blockDays;
export const trialEndDate = (t) => addDays(t.startDate, trialDays(t) - 1);

/** Which arm a given date belongs to, or null if outside the trial. */
export function armForDate(t, date) {
  const offset = daysBetween(t.startDate, date);
  if (offset < 0 || offset >= trialDays(t)) return null;
  return t.assignment[Math.floor(offset / t.blockDays)];
}

/** Day-by-day plan, for showing the schedule without showing results. */
export function schedule(t) {
  const out = [];
  for (let i = 0; i < trialDays(t); i++) {
    const date = addDays(t.startDate, i);
    out.push({ date, block: Math.floor(i / t.blockDays), arm: t.assignment[Math.floor(i / t.blockDays)] });
  }
  return out;
}

/**
 * Days still to go, counting today as one of them.
 *
 * The old form subtracted one, so on the final day this returned 0 and the app
 * declared the trial finished — revealing and offering to save a verdict
 * computed from a trial whose last day had not been logged yet. That verdict
 * could then change once the day was entered, which is exactly the peeking the
 * design goes to such lengths to prevent.
 */
export function daysRemaining(t, today = dateKey()) {
  return Math.max(0, trialDays(t) - daysBetween(t.startDate, today));
}

/** A trial is over only once its last day is in the past. */
export function isComplete(t, today = dateKey()) {
  return daysBetween(t.startDate, today) >= trialDays(t);
}

/* ------------------------------------------------------------------ *
 * Did you actually run the experiment?
 * ------------------------------------------------------------------ */

/**
 * Adherence and contrast.
 *
 * A trial only answers anything if the two arms actually differed. Two ways
 * that fails: you did not stick to the ON blocks, or your OFF blocks happened
 * to look like ON blocks anyway (testing "no alcohol" in a month you barely
 * drank). Both are measured from the logged data, not from self-report about
 * self-report.
 */
export function adherence(t, entries, factors = []) {
  const lever = getLever(t.leverId, factors);
  if (!lever) return { logged: 0, loggedRatio: 0, onAdherence: 0, offContrast: 0, onTotal: 0, offTotal: 0, missingLever: true };
  const byDate = new Map(entries.map((e) => [e.date, e]));
  let onTotal = 0, onMet = 0, offTotal = 0, offContrast = 0, logged = 0;

  for (const { date, arm } of schedule(t)) {
    const e = byDate.get(date);
    if (!e) continue;
    logged++;
    const v = readLeverField(e, lever.field);
    if (arm === 'on') { onTotal++; if (meets(v, lever.on)) onMet++; }
    else { offTotal++; if (meets(v, lever.off)) offContrast++; }
  }

  const total = trialDays(t);
  return {
    logged,
    loggedRatio: total ? logged / total : 0,
    onAdherence: onTotal ? onMet / onTotal : 0,
    offContrast: offTotal ? offContrast / offTotal : 0,
    onTotal, offTotal,
  };
}

/* ------------------------------------------------------------------ *
 * The analysis
 * ------------------------------------------------------------------ */

const readOutcome = (entry, field) => {
  if (!entry) return null;
  if (field.startsWith('f_')) {
    const v = entry.factors ? entry.factors[field] : undefined;
    return v === undefined ? null : v;
  }
  if (field.startsWith('s_')) {
    const v = entry.symptoms ? entry.symptoms[field] : undefined;
    return v === undefined ? null : v;
  }
  const v = entry[field];
  return v === undefined ? null : v;
};

/**
 * Exact randomization test.
 *
 * The statistic is the plain difference in mean outcome between ON and OFF
 * days — interpretable in the units the person logged in. Its p-value comes
 * from recomputing that statistic under every one of the 2^K ways the coins
 * could have fallen, which requires no distributional assumption at all: the
 * randomness being permuted is the randomness we actually used.
 *
 * Block means are used rather than raw days, so a block where you logged six
 * days does not outvote one where you logged three, and so within-block
 * autocorrelation cannot masquerade as extra evidence.
 */
export function analyze(t, entries) {
  const byDate = new Map(entries.map((e) => [e.date, e]));

  // Mean outcome per block.
  const blockMeans = [];
  for (let b = 0; b < t.pairs * 2; b++) {
    const vals = [];
    for (let d = 0; d < t.blockDays; d++) {
      const date = addDays(t.startDate, b * t.blockDays + d);
      const v = readOutcome(byDate.get(date), t.outcome);
      if (v != null) vals.push(v);
    }
    blockMeans.push(vals.length ? vals.reduce((a, x) => a + x, 0) / vals.length : null);
  }

  // A pair is usable only if BOTH its blocks have data; a half pair carries no
  // within-pair comparison and must not be silently treated as one.
  const pairs = [];
  for (let i = 0; i < t.pairs; i++) {
    const a = blockMeans[i * 2], b = blockMeans[i * 2 + 1];
    if (a == null || b == null) continue;
    const aIsOn = t.assignment[i * 2] === 'on';
    pairs.push({ on: aIsOn ? a : b, off: aIsOn ? b : a });
  }

  const usable = pairs.length;
  if (usable < MIN_PAIRS) {
    return {
      status: 'inconclusive',
      reason: 'missing-data',
      usablePairs: usable,
      neededPairs: MIN_PAIRS,
      floorP: floorP(usable || 1),
    };
  }

  const diffs = pairs.map((p) => p.on - p.off);
  const observed = diffs.reduce((a, x) => a + x, 0) / usable;

  // Enumerate the exact reference set: every way the within-pair coins could
  // have landed is a sign flip of that pair's difference.
  let asExtreme = 0;
  const total = Math.pow(2, usable);
  for (let mask = 0; mask < total; mask++) {
    let sum = 0;
    for (let i = 0; i < usable; i++) sum += (mask & (1 << i)) ? -diffs[i] : diffs[i];
    if (Math.abs(sum / usable) >= Math.abs(observed) - 1e-12) asExtreme++;
  }
  const p = asExtreme / total;

  const meanOn = pairs.reduce((a, x) => a + x.on, 0) / usable;
  const meanOff = pairs.reduce((a, x) => a + x.off, 0) / usable;

  return {
    status: 'analysed',
    usablePairs: usable,
    observedDiff: round2(observed),
    meanOn: round2(meanOn),
    meanOff: round2(meanOff),
    p: round4(p),
    floorP: round4(floorP(usable)),
    pairDiffs: diffs.map(round2),
    // How many pairs pointed the same way — a plain-language robustness note
    // that does not require understanding a p-value.
    agreeing: Math.max(diffs.filter((d) => d > 0).length, diffs.filter((d) => d < 0).length),
  };
}

const round2 = (x) => Math.round(x * 100) / 100;
const round4 = (x) => Math.round(x * 10000) / 10000;

/* ------------------------------------------------------------------ *
 * The verdict
 * ------------------------------------------------------------------ */

/** Lower is better for symptoms and for a few logged fields. */
function lowerIsBetter(outcome) {
  if (outcome.startsWith('s_')) return true;
  return ['stress', 'restingHR'].includes(outcome);
}

/**
 * Turn the analysis into something a person can act on — including, most of
 * the time, "this did nothing for you".
 *
 * The null and inconclusive verdicts are written to be as clear and as
 * unembarrassing as the positive one. Most honest n-of-1 trials end there, and
 * an app that treats that as a failure teaches people to keep testing until
 * something turns up, which is how you manufacture a false positive.
 */
export function verdict(t, entries, factors = []) {
  const lever = getLever(t.leverId, factors);
  // The thing this trial was testing has been deleted. Removing a tracked
  // factor used to leave getLever returning null and every later read of
  // lever.onText threw, which took the whole app down with no way back in.
  if (!lever) {
    return {
      kind: 'orphaned',
      adherence: adherence(t, entries, factors),
      analysis: { status: 'inconclusive', reason: 'lever-removed' },
      headline: 'This trial was measuring something you no longer track',
      body: 'You stopped tracking the thing this trial was changing, so there is nothing left to compare. The days you logged are still here — you can start a fresh trial whenever you like.',
    };
  }
  const adh = adherence(t, entries, factors);
  const res = analyze(t, entries);
  const unit = t.outcome.startsWith('s_') ? '' : (FIELDS[t.outcome]?.unit === '/5' ? ' points' : '');
  const outcomeName = (t.outcomeLabel || t.outcome).toLowerCase();

  if (res.status === 'inconclusive') {
    return {
      kind: 'inconclusive', adherence: adh, analysis: res,
      headline: 'Not enough logged days to call it',
      body: `This trial needs both blocks of at least ${MIN_PAIRS} pairs to have data in them, and ${res.usablePairs} ${res.usablePairs === 1 ? 'pair has' : 'pairs have'}. That is a gap in the logging, not a result about ${outcomeName} — nothing can be concluded either way.`,
    };
  }

  if (adh.onAdherence < MIN_ADHERENCE) {
    return {
      kind: 'not-run', adherence: adh, analysis: res,
      headline: 'This one did not really get tested',
      body: `You managed ${lever.onText} on ${Math.round(adh.onAdherence * 100)}% of the days that asked for it. Below about ${Math.round(MIN_ADHERENCE * 100)}% the two halves of the trial are not different enough to compare, so there is no honest answer here. That is worth knowing too: if the change was that hard to stick to, it may not be the right one to build a habit around.`,
    };
  }

  if (adh.offContrast < MIN_CONTRAST) {
    return {
      kind: 'no-contrast', adherence: adh, analysis: res,
      headline: 'Your normal weeks looked like your test weeks',
      body: `On the OFF blocks you only went back to ${lever.offText} ${Math.round(adh.offContrast * 100)}% of the time. With so little difference between the two halves there is nothing for the comparison to measure — this usually means the lever is not really part of your life at the moment.`,
    };
  }

  const better = lowerIsBetter(t.outcome) ? res.observedDiff < 0 : res.observedDiff > 0;
  const size = Math.abs(res.observedDiff);

  if (res.p <= ALPHA) {
    return {
      kind: better ? 'helped' : 'hurt', adherence: adh, analysis: res,
      headline: better
        ? `${lever.label} looks like it helped`
        : `${lever.label} looks like it made things worse`,
      body: `On the blocks where you did it, ${outcomeName} averaged ${size}${unit} ${better === lowerIsBetter(t.outcome) ? 'lower' : 'higher'} — and ${res.agreeing} of your ${res.usablePairs} block-pairs pointed the same way (p = ${res.p}). Because the blocks were assigned by a coin toss, a drift over the weeks or the order you did things in cannot line up with the schedule systematically — though in a single trial they can still line up by luck.`,
      caveat: `You knew which blocks were which, so some of this may be expectation rather than the change itself. It is one experiment on one person; if it matters, the honest next step is to run it again, or to mention it to a doctor.`,
    };
  }

  return {
    kind: 'no-effect', adherence: adh, analysis: res,
    headline: `No sign that ${lever.label.toLowerCase()} changed anything`,
    body: `${outcomeName[0].toUpperCase() + outcomeName.slice(1)} came out ${size}${unit} different between the two halves, which is well inside what the coin tosses alone could produce (p = ${res.p}). You stuck to it ${Math.round(adh.onAdherence * 100)}% of the time, so this was a fair test.`,
    caveat: `This does not prove it does nothing. A trial this size can only see a fairly large effect — the smallest p-value it could possibly have returned was ${res.floorP} — so read this as "not big enough for this trial to see", not as "no effect". It does mean it is reasonable to stop wondering and try something else.`,
  };
}

/**
 * Measured power of this trial design, by how often the symptom actually occurs.
 *
 * Every cell is 250 simulated trials through the real createTrial / armForDate /
 * analyze path, at 90% adherence, with a lever that works PERFECTLY — avoiding
 * the trigger removes the symptom entirely. So these are upper bounds. A real
 * lever that helps somewhat does worse.
 *
 * WHY THIS HAD TO EXIST. The insights page offers "Test this properly" on any
 * finding naming something you can change, and that offer was unconditional.
 * For a symptom you get four times a month it was an offer of eleven weeks of
 * daily effort for a foregone conclusion: at a 5% rate not one of 250 perfect
 * trials came back with a verdict, at any length the app can run.
 *
 * The consolation is real and worth telling people, because it is the exact
 * mirror of the correlation engine's own limits: a rare symptom is the case
 * where simply logging DOES work. The engine found a red-wine trigger for a
 * 5%-of-days migraine over 330 days of ordinary observation. Trials are for
 * frequent symptoms; patience is for rare ones.
 */
export const TRIAL_POWER_GRID = {
  rates: [0.60, 0.35, 0.20, 0.12, 0.08, 0.05],
  pairs: [6, 8, 12, 16, 20],
  power: [
    [0.21, 0.74, 0.96, 1.00, 1.00],
    [0.04, 0.21, 0.63, 0.86, 0.94],
    [0.00, 0.03, 0.17, 0.38, 0.60],
    [0.00, 0.00, 0.01, 0.12, 0.28],
    // 8% at 12 pairs was not run; it is bracketed by 0.00 at 5% and 0.01 at 12%.
    [0.00, 0.00, 0.00, 0.01, 0.05],
    [0.00, 0.00, 0.00, 0.00, 0.00],
  ],
};

/** Interpolated chance this trial design detects a lever that works perfectly. */
export function trialPower(rate, pairs) {
  const { rates, pairs: ps, power } = TRIAL_POWER_GRID;
  if (!Number.isFinite(rate) || !Number.isFinite(pairs)) return null;
  const axis = (arr, v, descending) => {
    // Returns [index, fraction] for linear interpolation, clamped at both ends.
    for (let i = 1; i < arr.length; i++) {
      const lo = arr[i - 1], hi = arr[i];
      const between = descending ? v <= lo && v >= hi : v >= lo && v <= hi;
      if (between) return [i - 1, (v - lo) / (hi - lo)];
    }
    return descending
      ? (v > arr[0] ? [0, 0] : [arr.length - 2, 1])
      : (v < arr[0] ? [0, 0] : [arr.length - 2, 1]);
  };
  const [ri, rf] = axis(rates, rate, true);
  const [pi, pf] = axis(ps, pairs, false);
  const top = power[ri][pi] + pf * (power[ri][pi + 1] - power[ri][pi]);
  const bot = power[ri + 1][pi] + pf * (power[ri + 1][pi + 1] - power[ri + 1][pi]);
  return Math.max(0, Math.min(1, top + rf * (bot - top)));
}

/**
 * What to tell someone before they commit weeks to a trial.
 *
 * `rate` is the share of their logged days on which the outcome was present.
 * Never scolds and never simply refuses: where a trial cannot work it says so
 * and names the thing that can.
 */
export function trialOutlook(rate, pairs, outcomeLabel = 'this') {
  if (!Number.isFinite(rate) || rate <= 0) return null;
  const power = trialPower(rate, pairs);
  const best = trialPower(rate, MAX_PAIRS);
  const pct = Math.round(rate * 100);
  const days = pairs * 2 * 2;

  if (best < 0.25) {
    return {
      kind: 'futile', power, best,
      headline: `A trial is the wrong tool for this one.`,
      detail: `${outcomeLabel} has turned up on ${pct}% of your logged days. Even at the longest `
        + `trial this app will run, and even if the change worked perfectly, too few of those days `
        + `would land inside it to tell the two halves apart — measured, `
        + `${best < 0.015 ? 'fewer than 2 times in 100' : `about ${Math.round(best * 100)} times in 100`}. `
        + `Something that happens this rarely is the case where simply carrying on logging does `
        + `work, because every month adds more of the days that count.`,
    };
  }
  if (power < 0.5) {
    const enough = TRIAL_POWER_GRID.pairs.find((p) => trialPower(rate, p) >= 0.6);
    return {
      kind: 'too-short', power, best,
      headline: `${days} days is likely to come back inconclusive.`,
      detail: `${outcomeLabel} has turned up on ${pct}% of your logged days, so a trial this length `
        + `would settle it ${power < 0.15 ? 'about 1 time in 10 at best' : `about ${Math.round(power * 10)} times in 10`} even if the change worked `
        + `perfectly.${enough ? ` At ${enough} pairs — ${enough * 2 * 2} days — that becomes about `
        + `${Math.round(trialPower(rate, enough) * 10)} in 10.` : ''}`,
    };
  }
  return {
    kind: 'ok', power, best,
    headline: `${days} days should be enough to settle this.`,
    detail: `${outcomeLabel} has turned up on ${pct}% of your logged days. If the change works, a `
      + `trial this length finds it about ${Math.round(power * 10)} times in 10.`,
  };
}
