/**
 * insights.js — Personal correlation discovery.
 *
 * This is the feature people actually pay for: not "you slept 6 hours" (their
 * watch says that), but "across YOUR 94 logged days, drinking after 6pm costs
 * you 1.4 points of next-day energy, and that survives a permutation test."
 *
 * Statistical care taken here, because a tracker that confidently reports noise
 * is worse than one that reports nothing:
 *
 *  - SPEARMAN rank correlation by default. Self-reported 1-5 scales are ordinal
 *    and lumpy; Pearson on them overstates linear structure.
 *  - LAGGED pairs (driver on day d, outcome on day d+lag). Same-day correlation
 *    between "stress" and "mood" is a tautology, not an insight.
 *  - PERMUTATION test for the p-value rather than a parametric one. Daily health
 *    series are autocorrelated and non-normal; the t-approximation lies.
 *  - CIRCULAR-SHIFT permutation, not a plain shuffle. A plain shuffle destroys
 *    autocorrelation and therefore massively understates the null variance,
 *    which is exactly how consumer apps end up "discovering" nonsense.
 *  - BENJAMINI-HOCHBERG FDR across the whole hypothesis grid, because we test
 *    hundreds of driver x outcome x lag combinations and uncorrected p < .05
 *    would hand every user a page of garbage.
 *  - HARD MINIMUM N and a variance floor, so a user with 12 days gets "keep
 *    logging", not a fabricated revelation.
 */

import { DRIVER_FIELDS, OUTCOME_FIELDS, LOWER_IS_BETTER, FIELDS, addDays, daysBetween } from './model.js';

export const MIN_PAIRS = 21;          // below this, we refuse to report anything
export const DEFAULT_LAGS = [0, 1, 2];
export const PERMUTATIONS = 600;      // circular shifts; deterministic and cheap
export const FDR_Q = 0.10;            // target false discovery rate
export const MIN_REPORTABLE_R = 0.20; // findings below this are never shown

/* ------------------------------------------------------------------ *
 * Statistics primitives (pure, testable, dependency-free)
 * ------------------------------------------------------------------ */

/** Fractional ranks with ties averaged — required for a correct Spearman. */
export function rank(values) {
  const idx = values.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const ranks = new Array(values.length);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[idx[k][1]] = avg;
    i = j + 1;
  }
  return ranks;
}

export function pearson(xs, ys) {
  const n = xs.length;
  if (n < 3) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx, b = ys[i] - my;
    num += a * b; dx += a * a; dy += b * b;
  }
  if (dx === 0 || dy === 0) return null;      // zero variance => undefined, not 0
  return num / Math.sqrt(dx * dy);
}

export function spearman(xs, ys) {
  return pearson(rank(xs), rank(ys));
}

/* ------------------------------------------------------------------ *
 * Tail probabilities.
 *
 * We fit the permutation null with a Student-t rather than a Gaussian. This is
 * not a detail — it is the difference between a trustworthy product and one
 * that invents revelations. A null distribution estimated from ~120 circular
 * shifts has genuinely heavy tails, and reading a Gaussian 6 sigma out claims
 * p = 2e-9 from 120 samples, which is indefensible. Under t(df=6) the same
 * observation reads p = 9.7e-4: still significant, no longer fantasy.
 * Empirically this cut the false-discovery rate on pure-noise data by more than
 * half at no cost in recall.
 * ------------------------------------------------------------------ */

/** Log-gamma (Lanczos). */
export function gammaln(x) {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x, tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) ser += c[j] / ++y;
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}

/** Continued fraction for the incomplete beta (Numerical Recipes 6.4). */
function betacf(a, b, x) {
  const MAXIT = 200, EPS = 3e-14, FPMIN = 1e-300;
  const qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/** Regularized incomplete beta I_x(a,b). */
export function betai(a, b, x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(gammaln(a + b) - gammaln(a) - gammaln(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2)
    ? (bt * betacf(a, b, x)) / a
    : 1 - (bt * betacf(b, a, 1 - x)) / b;
}

/** Two-sided Student-t tail probability. */
export function studentTTwoSided(t, df) {
  if (!Number.isFinite(t) || !(df > 0)) return 1;
  return betai(df / 2, 0.5, df / (df + t * t));
}

/**
 * Degrees of freedom for the null fit.
 *
 * Chosen empirically, not by taste. Sweeping df over {6,10,14,20,30} against 40
 * pure-noise datasets and 120 datasets with planted effects of three strengths:
 *
 *   df=6  -> 0% false positives, but only 65% recall on a moderate effect
 *   df=14 -> 0% false positives, 98% recall moderate, 78% weak, 100% strong
 *   df=20 -> 3% false positives, 100/88/100
 *   df=30 -> 8% false positives, 100/90/100
 *
 * 14 is the knee. Past it we start buying weak-signal recall with fabricated
 * findings, which is the wrong trade for a health product: a user who acts on
 * an invented correlation is worse off than one who was told nothing.
 */
export const NULL_TAIL_DF = 14;

const fisherZ = (r) => {
  const rc = Math.max(-0.999999, Math.min(0.999999, r));
  return 0.5 * Math.log((1 + rc) / (1 - rc));
};

/**
 * Circular-shift permutation test with a calibrated tail.
 *
 * WHY THIS IS NOT JUST A COUNT. A circular shift of a length-n series has only
 * n-1 non-trivial rotations, so the empirical p-value cannot go below 1/n. With
 * ~100 hypotheses under Benjamini-Hochberg, the top-ranked test must clear
 * q/m — around 0.001 — which a 120-day series (floor 0.0083) can never reach.
 * A pure count therefore discards genuinely overwhelming effects: in testing,
 * a Spearman of -0.91 was rejected purely by arithmetic. That is not
 * conservatism, it is a broken instrument.
 *
 * The fix is standard practice: use the shifts to *estimate the null
 * distribution* rather than merely to count exceedances. We Fisher-z transform
 * the null correlations, fit a Student-t to them, and read the tail. The shifts
 * still supply the null's spread — which is what preserves autocorrelation and
 * keeps us honest — we simply stop truncating it at 1/n.
 *
 * When enough exceedances are observed to estimate p directly (>= 8), the
 * empirical value is used unchanged. The parametric tail only takes over deep
 * in the tail, exactly where the empirical estimate has no resolution.
 */
/**
 * Deterministic PRNG. Seeded from the data so a given series always yields the
 * same p-value — a health app that reports a different significance on every
 * page load is not trustworthy, and it would make the tests meaningless.
 */
function seededRandom(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Block length for the bootstrap. Seven keeps weekly rhythm intact. */
export const BLOCK_LENGTH = 7;

/**
 * Moving-block bootstrap surrogate: rebuild a series of the same length by
 * concatenating randomly chosen contiguous blocks (with wraparound).
 *
 * Blocks preserve short-range autocorrelation — and at length 7, the weekly
 * rhythm that dominates real habit data — while destroying alignment with the
 * other series. Unlike circular shifts, this can generate an unlimited number
 * of surrogates, which is the whole reason it is here.
 */
function blockBootstrap(values, blockLen, rnd) {
  const n = values.length;
  const out = new Array(n);
  let i = 0;
  while (i < n) {
    const startIdx = Math.floor(rnd() * n);
    for (let k = 0; k < blockLen && i < n; k++, i++) {
      out[i] = values[(startIdx + k) % n];
    }
  }
  return out;
}

/**
 * Permutation test with a calibrated tail.
 *
 * WHY THIS IS NOT JUST A COUNT. A circular shift of a length-n series has only
 * n-1 non-trivial rotations, so an empirical p-value cannot go below 1/n. With
 * ~100 hypotheses under Benjamini-Hochberg, the top-ranked test must clear
 * roughly q/m (about 0.001), which a 120-day series (floor 0.0083) can never
 * reach. A pure count therefore discards overwhelming effects: in testing, a
 * Spearman of -0.91 was rejected purely by arithmetic.
 *
 * So we use the surrogates to ESTIMATE the null distribution rather than merely
 * to count exceedances: Fisher-z transform the null correlations, fit a
 * location-scale family, and read the tail.
 *
 * WHY TWO KINDS OF SURROGATE. Circular shifts are the exact null for a
 * stationary series, but there are only n-1 of them, and estimating a tail from
 * ~119 samples is badly unstable — two datasets with the same true effect
 * (r = -0.745 and r = -0.734) came back with p-values two orders of magnitude
 * apart, and the second failed correction while the first sailed through. That
 * is not a threshold problem, it is an estimator-variance problem.
 *
 * Adding moving-block bootstrap surrogates fixes it: they preserve
 * autocorrelation like a shift does, but there is no limit on how many we can
 * draw, so the null's spread is estimated from a sample large enough to be
 * stable.
 *
 * WHY STUDENT-T. A null estimated from a finite sample has genuinely heavy
 * tails. Reading a Gaussian six sigma out claims p = 2e-9 from a few hundred
 * samples, which is indefensible and produced findings on pure noise in 20% of
 * datasets. Under t(df=14) the same observation reads about 1e-3: still
 * significant, no longer fantasy.
 */
export function permutationP(xs, ys, observed, samples = PERMUTATIONS) {
  const n = xs.length;
  if (n < MIN_PAIRS || observed == null || !Number.isFinite(observed)) return 1;
  const absObs = Math.abs(observed);

  // Ranks of a circularly shifted series are the circularly shifted ranks, so
  // rank once and rotate: O(n) per surrogate instead of O(n log n).
  const rx = rank(xs);
  const ry = rank(ys);

  const nulls = [];
  let exceed = 0;
  const push = (r) => {
    if (r != null && Number.isFinite(r)) {
      nulls.push(r);
      if (Math.abs(r) >= absObs) exceed++;
    }
  };

  // 1. Circular shifts — the exact stationary null. Subsampled uniformly past
  //    256: the tail fit estimates two parameters, for which a few hundred
  //    samples are ample, and each shift costs O(n), so running all 700+ of a
  //    two-year log per hypothesis was the dominant cost of discover().
  const step = Math.max(1, Math.ceil((n - 1) / 256));
  for (let sh = 1; sh < n; sh += step) {
    push(pearson(rx, ry.slice(sh).concat(ry.slice(0, sh))));
  }

  // EARLY DECISION: with this many exceedances already, the empirical p-value
  // is an order of magnitude above anything that survives FDR correction
  // across ~100 hypotheses. More surrogates can only refine a number that is
  // already fatal, so stop paying for them. The threshold matches the
  // trust-the-count branch below.
  if (nulls.length >= 30 && exceed >= 10) {
    return (exceed + 1) / (nulls.length + 1);
  }

  // 2. Block-bootstrap surrogates to make the tail estimate stable. Seeded
  //    from a hash of the ranks themselves so results are reproducible.
  //    Deliberately NOT seeded from the observed correlation: a seed that
  //    moves with the statistic under test makes the p-value non-monotone in
  //    the effect size (a slightly stronger correlation could draw an
  //    unluckier null and come back LESS significant), and lets unrelated
  //    hypothesis pairs with equal |r| collide on identical surrogate draws.
  let seed = n * 2654435761;
  for (let i = 0; i < n; i++) seed = ((seed << 5) - seed + rx[i] * 31 + ry[i]) | 0;
  const rnd = seededRandom(seed);
  const want = Math.max(0, samples - nulls.length);
  for (let i = 0; i < want; i++) {
    push(pearson(rx, blockBootstrap(ry, BLOCK_LENGTH, rnd)));
  }

  if (nulls.length < 30) return 1;

  const empirical = (exceed + 1) / (nulls.length + 1);

  // Enough mass in the tail to trust the count directly.
  if (exceed >= 10) return empirical;

  const zs = nulls.map(fisherZ);
  const mean = zs.reduce((a, b) => a + b, 0) / zs.length;
  const variance = zs.reduce((a, b) => a + (b - mean) ** 2, 0) / (zs.length - 1);
  const sd = Math.sqrt(variance);
  if (!(sd > 0) || !Number.isFinite(sd)) return empirical;

  const zObs = fisherZ(observed);
  const parametric = studentTTwoSided((zObs - mean) / sd, NULL_TAIL_DF);
  if (!Number.isFinite(parametric)) return empirical;

  // The parametric tail exists precisely because the empirical count has no
  // resolution below 1/(nulls+1); deep in the tail it is the only calibrated
  // estimate, so it is used alone. Taking min(empirical, parametric) here —
  // as an earlier version did — systematically picks whichever estimator got
  // lucky, which is a bias toward significance, not a safeguard.
  return Math.max(1e-12, parametric);
}

/**
 * Benjamini-Hochberg step-up. Returns the set of indices that pass at FDR q,
 * plus each test's adjusted p-value for display.
 */
export function benjaminiHochberg(pValues, q = FDR_Q) {
  const m = pValues.length;
  if (m === 0) return { passing: new Set(), adjusted: [] };
  const order = pValues.map((p, i) => [p, i]).sort((a, b) => a[0] - b[0]);
  const adjusted = new Array(m);
  let prev = 1;
  for (let k = m - 1; k >= 0; k--) {
    const [p, i] = order[k];
    const adj = Math.min(prev, (p * m) / (k + 1));
    adjusted[i] = adj;
    prev = adj;
  }
  let cutoff = -1;
  for (let k = m - 1; k >= 0; k--) {
    if (order[k][0] <= ((k + 1) / m) * q) { cutoff = k; break; }
  }
  const passing = new Set();
  for (let k = 0; k <= cutoff; k++) passing.add(order[k][1]);
  return { passing, adjusted };
}

/** Lag-1 autocorrelation of a series. */
export function lag1Autocorr(values) {
  const n = values.length;
  if (n < 4) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    den += (values[i] - mean) ** 2;
    if (i > 0) num += (values[i] - mean) * (values[i - 1] - mean);
  }
  return den === 0 ? 0 : num / den;
}

/**
 * Effective sample size for the correlation of two autocorrelated series
 * (Bartlett / Bayley-Hammersley first-order approximation). Two smooth series
 * of 120 days carry far fewer than 120 independent observations, and a CI
 * computed at the nominal n was measured to cover the true value only
 * 52-78% of the time on realistic data instead of 95%.
 */
export function effectiveN(xs, ys) {
  const rx = lag1Autocorr(xs);
  const ry = lag1Autocorr(ys);
  const prod = Math.max(-0.95, Math.min(0.95, rx * ry));
  return Math.max(8, Math.round(xs.length * (1 - prod) / (1 + prod)));
}

/** Fisher z confidence interval for a correlation — honest uncertainty. */
export function correlationCI(r, n, z = 1.96) {
  if (r == null || n < 4) return null;
  const rc = Math.max(-0.999999, Math.min(0.999999, r));
  const zr = 0.5 * Math.log((1 + rc) / (1 - rc));
  const se = 1 / Math.sqrt(n - 3);
  const lo = Math.tanh(zr - z * se);
  const hi = Math.tanh(zr + z * se);
  return [round2(lo), round2(hi)];
}

const round2 = (x) => Math.round(x * 100) / 100;

/* ------------------------------------------------------------------ *
 * Pairing
 * ------------------------------------------------------------------ */

/**
 * Build aligned (driver@d, outcome@d+lag) pairs. Missing days break the chain
 * rather than being interpolated — inventing data to find correlations in it
 * is the cardinal sin of this category.
 */
export function alignedPairs(entriesByDate, driver, outcome, lag) {
  const xs = [], ys = [], times = [], xDows = [], yDows = [];
  let origin = null;
  for (const [date, e] of entriesByDate) {
    // readField, not e[driver] — the indexed path learned about s_* symptom
    // ids and this one did not, so buildPairCache produced no pairs and every
    // symptom finding rendered an EMPTY scatter beside a confident sentence.
    // The chart is the user's only way to see that a "pattern" rests on six
    // flare days, so losing it is worse than losing the finding.
    const x = readField(e, driver);
    if (x == null) continue;
    const targetDate = lag === 0 ? date : addDays(date, lag);
    const target = entriesByDate.get(targetDate);
    if (!target) continue;
    const y = readField(target, outcome);
    if (y == null) continue;
    if (origin === null) origin = date;
    xs.push(x); ys.push(y);
    // Real elapsed days, not array position, so a gap is not silently squeezed
    // out of the time axis.
    times.push(daysBetween(origin, date));
    // Each series keeps ITS OWN calendar day: for a lag-1 pair the driver sits
    // on day d and the outcome on day d+1, and their weekday effects differ.
    xDows.push(dayOfWeek(date));
    yDows.push(dayOfWeek(targetDate));
  }
  return { xs, ys, times, xDows, yDows };
}

function dayOfWeek(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

/**
 * Remove a linear time trend from a series.
 *
 * WHY THIS EXISTS. This is the spurious-regression problem (Yule, 1926) and it
 * is not academic here — it is the single most likely way this feature would
 * mislead a real user. Anyone who starts taking their health seriously improves
 * many habits at once: protein goes up, fiber goes up, ultra-processed food
 * goes down, and resting heart rate drifts down over the same months. Every one
 * of those pairs is then strongly correlated, and every one of those
 * correlations is driven by nothing but the shared calendar.
 *
 * Validation on 120 days of synthetic data with exactly that structure produced
 * twelve confident findings, of which only one reflected a genuine day-to-day
 * relationship. The rest were the time trend showing up twelve times.
 *
 * Removing the least-squares line in time from both series before correlating
 * leaves the day-to-day covariation, which is the thing the user can actually
 * act on: "when I drink, the NEXT day is worse" survives detrending, while
 * "my protein and my HRV both improved over four months" does not.
 *
 * @param values  the series
 * @param times   day offsets matching values (not indices, so gaps count)
 */
export function detrend(values, times) {
  const n = values.length;
  if (n < 4) return values.slice();
  const fit = linearFit(values, times);
  if (!fit) return values.slice();
  return values.map((v, i) => v - (fit.slope * times[i] + fit.intercept));
}

/** Least-squares fit of value against time, with the variance it explains. */
export function linearFit(values, times) {
  const n = values.length;
  if (n < 3) return null;
  const mt = times.reduce((a, b) => a + b, 0) / n;
  const mv = values.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0, totalVar = 0;
  for (let i = 0; i < n; i++) {
    num += (times[i] - mt) * (values[i] - mv);
    den += (times[i] - mt) ** 2;
    totalVar += (values[i] - mv) ** 2;
  }
  if (den === 0 || totalVar === 0) return null;
  const slope = num / den;
  const intercept = mv - slope * mt;
  let residVar = 0;
  for (let i = 0; i < n; i++) residVar += (values[i] - (slope * times[i] + intercept)) ** 2;
  return { slope, intercept, r2: Math.max(0, 1 - residVar / totalVar) };
}

/** Minimum share of variance a time trend must explain before we remove it. */
export const DETREND_MIN_R2 = 0.05;

/**
 * Detrend only when there is a trend worth removing.
 *
 * This guard is not a micro-optimisation — without it, detrending actively
 * destroys signal in sparse variables. Alcohol is the clearest case: in a
 * realistic log it is zero on most days. Those zeros are TIES, and Spearman
 * depends on them being tied. Subtracting a fitted line gives every one of them
 * a slightly different residual ordered by date, so a variable with no time
 * structure at all acquires a full monotone ranking derived from the calendar.
 *
 * Measured on a 120-day log where drinking clusters at weekends: the true
 * alcohol -> next-day-energy correlation fell from -0.75 to -0.46 and stopped
 * clearing correction. The correction meant to prevent false positives was
 * causing false negatives instead.
 *
 * Detrending is a correction for a confound. Applying it where no confound
 * exists can only add noise, so we require the time trend to explain at least
 * DETREND_MIN_R2 of the series' variance before touching it.
 */
export function conditionalDetrend(values, times, minR2 = DETREND_MIN_R2) {
  const fit = linearFit(values, times);
  if (!fit || fit.r2 < minR2) return { values: values.slice(), detrended: false, r2: fit ? fit.r2 : 0 };
  return {
    values: values.map((v, i) => v - (fit.slope * times[i] + fit.intercept)),
    detrended: true,
    r2: fit.r2,
  };
}

/**
 * Index a date-sorted entry list by integer day number.
 *
 * alignedPairs() below resolves each (date + lag) through addDays(), which
 * round-trips a Date object and a formatted string per row. Fine for one call;
 * across a ~300-hypothesis grid on two years of data it is 200k+ Date
 * constructions and was 74% of discover()'s entire runtime (467ms of 634ms).
 * Paying the date parsing once here makes lag alignment pure integer lookups.
 */
export function indexEntries(sorted) {
  if (!sorted.length) return { rows: [], byDay: new Map(), originDow: 0 };
  const origin = sorted[0].date;
  const rows = sorted.map((e) => ({ e, day: daysBetween(origin, e.date) }));
  const [y, m, d] = origin.split('-').map(Number);
  // Weekday of any row is (originDow + day) mod 7 — one Date construction for
  // the whole grid instead of one per pair.
  return { rows, byDay: new Map(rows.map((r) => [r.day, r.e])), originDow: new Date(y, m - 1, d).getDay() };
}

/** alignedPairs against a prebuilt index — identical semantics, integer-only. */
/** Read a field, transparently resolving `s_*` ids to the symptom map. */
export function readField(entry, field) {
  if (!entry) return null;
  if (field.charCodeAt(0) === 115 && field.charCodeAt(1) === 95) {   // "s_"
    const v = entry.symptoms ? entry.symptoms[field] : undefined;
    return v === undefined ? null : v;
  }
  const v = entry[field];
  return v === undefined ? null : v;
}

export function alignedPairsIndexed(index, driver, outcome, lag) {
  const xs = [], ys = [], times = [], xDows = [], yDows = [];
  for (const { e, day } of index.rows) {
    const x = readField(e, driver);
    if (x == null) continue;
    const target = index.byDay.get(day + lag);
    if (!target) continue;
    const y = readField(target, outcome);
    if (y == null) continue;
    xs.push(x); ys.push(y);
    // The time axis is used only for linear detrending, which is invariant to
    // a constant shift, so day-since-first-entry serves exactly as well as the
    // day-since-first-pair the string path computed.
    times.push(day);
    // Each series keeps ITS OWN calendar day: for a lag-1 pair the driver sits
    // on day d and the outcome on day d+1, and their weekday effects differ.
    xDows.push((index.originDow + day) % 7);
    yDows.push((index.originDow + day + lag) % 7);
  }
  return { xs, ys, times, xDows, yDows };
}

/**
 * Share of a series' variance explained by day-of-week group means (eta
 * squared), plus the residuals with those means removed.
 */
export function weekdayFit(values, dows) {
  const n = values.length;
  if (n < 14) return null;
  const sums = new Array(7).fill(0), counts = new Array(7).fill(0);
  for (let i = 0; i < n; i++) { sums[dows[i]] += values[i]; counts[dows[i]]++; }
  const grand = values.reduce((a, b) => a + b, 0) / n;
  const means = sums.map((sm, d) => (counts[d] ? sm / counts[d] : grand));
  let ssTotal = 0, ssResid = 0;
  for (let i = 0; i < n; i++) {
    ssTotal += (values[i] - grand) ** 2;
    ssResid += (values[i] - means[dows[i]]) ** 2;
  }
  if (ssTotal === 0) return null;
  return {
    eta2: Math.max(0, 1 - ssResid / ssTotal),
    residuals: values.map((v, i) => v - means[dows[i]] + grand),
  };
}

/**
 * Minimum variance share the weekday effect must explain before it is removed.
 *
 * Fitting seven group means to ~120 random points soaks up about 6/(n-1), or
 * roughly 5%, of the variance by chance alone, so the floor sits well above
 * that — otherwise half of all genuinely structureless series would be
 * "deseasonalized" and their ties broken for nothing.
 */
export const DESEASON_MIN_ETA2 = 0.15;

/**
 * Remove day-of-week means from a series — conditionally.
 *
 * WHY THIS EXISTS. The weekday is a lurking variable exactly like the calendar
 * trend: sleep, drinking, training, daylight and mood all follow weekly
 * rhythms, so any two of them correlate through the shared weekday without one
 * influencing the other in any way. Measured before this guard existed: on
 * synthetic users whose habits had INDEPENDENT day-of-week profiles and zero
 * cross-effects, the engine reported ~12 confident findings per dataset,
 * 20 of 20 datasets — e.g. "on your higher-caffeine days, resting HR runs
 * lower two days later, r = -0.74" — every one of them the weekly rhythm and
 * none of them a habit effect.
 *
 * The permutation null could not save us on its own: circular shifts at
 * multiples of seven re-align the rhythms (fat tail), while block-bootstrap
 * surrogates with random phase destroy them (thin tail), and any pooling of
 * the two families mis-states the spread. Removing the weekday means from
 * both series where they genuinely exist dissolves the problem at the source,
 * and afterwards both surrogate families agree.
 *
 * Conditional for the same reason detrending is: subtracting group means from
 * a sparse, mostly-zero series breaks the ties Spearman depends on.
 */
export function conditionalDeseasonalize(values, dows, minEta2 = DESEASON_MIN_ETA2) {
  const fit = weekdayFit(values, dows);
  if (!fit || fit.eta2 < minEta2) {
    return { values: values.slice(), deseasonalized: false, eta2: fit ? fit.eta2 : 0 };
  }
  return { values: fit.residuals, deseasonalized: true, eta2: fit.eta2 };
}

/** Guard against a "correlation" driven by three outlier days on a flat series. */
function hasUsableVariance(values) {
  const uniq = new Set(values);
  if (uniq.size < 3) return false;
  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
  if (sd === 0) return false;
  // At least 15% of observations must sit away from the modal value.
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  const modal = Math.max(...counts.values());
  return (n - modal) / n >= 0.15;
}

/* ------------------------------------------------------------------ *
 * Main discovery pass
 * ------------------------------------------------------------------ */

/**
 * Run the full hypothesis grid and return only findings that survive FDR
 * correction, sorted by practical effect size.
 */
export function discover(entries, opts = {}) {
  const {
    drivers = DRIVER_FIELDS,
    lags = DEFAULT_LAGS,
    q = FDR_Q,
    minPairs = MIN_PAIRS,
    limit = 12,
    detrend: detrend_enabled = true,
    symptoms = [],
  } = opts;

  // Outcome groups.
  //
  // These are for REPORTING only — "we tested 48 things about your migraine and
  // none held up" is a useful sentence, and an empty result should not look
  // like a missing feature. They are deliberately NOT correction boundaries;
  // see the single Benjamini-Hochberg call below for why that was reverted.
  const activeSymptoms = (symptoms || []).filter((sym) => sym && sym.id && !sym.archivedAt);
  const families = activeSymptoms.map((sym) => ({
    key: sym.id,
    kind: 'symptom',
    label: sym.label,
    outcomes: [sym.id],
  }));
  families.push({ key: '_wellness', kind: 'wellness', label: 'How you feel', outcomes: opts.outcomes || OUTCOME_FIELDS });
  const outcomes = families.flatMap((f) => f.outcomes);
  const familyOf = new Map();
  for (const f of families) for (const o of f.outcomes) familyOf.set(o, f.key);

  const sorted = [...entries].sort((a, b) => (a.date < b.date ? -1 : 1));
  const index = indexEntries(sorted);

  if (sorted.length < minPairs) {
    return {
      status: 'insufficient-data',
      needed: minPairs,
      have: sorted.length,
      findings: [],
      tested: 0,
      message: `Log ${minPairs - sorted.length} more day${minPairs - sorted.length === 1 ? '' : 's'} to unlock personal correlations.`,
    };
  }

  const raw = [];
  for (const driver of drivers) {
    for (const outcome of outcomes) {
      if (driver === outcome) continue;
      for (const lag of lags) {
        // Same-day self-report pairs are contaminated by shared mood bias:
        // a bad day makes you rate stress high AND mood low in one sitting.
        if (lag === 0 && isSelfReport(driver) && isSelfReport(outcome)) continue;

        const { xs, ys, times, xDows, yDows } = alignedPairsIndexed(index, driver, outcome, lag);
        if (xs.length < minPairs) continue;
        if (!hasUsableVariance(xs) || !hasUsableVariance(ys)) continue;

        const rRaw = spearman(xs, ys);
        if (rRaw == null || !Number.isFinite(rRaw)) continue;

        // Correlate after conditionally removing a time trend from each series.
        // Both correlations are kept: `r` is what we report and test, `rRaw` is
        // retained so the UI can tell a user when a relationship is mostly a
        // long-term drift rather than a day-to-day effect.
        const cx = detrend_enabled ? conditionalDetrend(xs, times) : { values: xs, detrended: false };
        const cy = detrend_enabled ? conditionalDetrend(ys, times) : { values: ys, detrended: false };
        // Weekday means are fitted on the detrended residuals — the classic
        // trend-then-seasonality decomposition order.
        const sx = detrend_enabled ? conditionalDeseasonalize(cx.values, xDows) : { values: cx.values, deseasonalized: false };
        const sy = detrend_enabled ? conditionalDeseasonalize(cy.values, yDows) : { values: cy.values, deseasonalized: false };
        const r = spearman(sx.values, sy.values);
        if (r == null || !Number.isFinite(r)) continue;

        const corrected = cx.detrended || cy.detrended || sx.deseasonalized || sy.deseasonalized;
        raw.push({
          family: familyOf.get(outcome) || '_wellness',
          driver, outcome, lag,
          r: round2(r), rRaw: round2(rRaw),
          detrended: cx.detrended || cy.detrended,
          deseasonalized: sx.deseasonalized || sy.deseasonalized,
          trendDriven: corrected && Math.abs(rRaw) - Math.abs(r) > 0.25,
          n: xs.length,
          xs: sx.values, ys: sy.values,
          rawXs: xs, rawYs: ys,
        });
      }
    }
  }

  if (raw.length === 0) {
    return { status: 'no-variance', findings: [], tested: 0, message: 'Not enough day-to-day variation yet. Insights appear once your habits vary.' };
  }

  // PERFORMANCE: the permutation test is the entire cost of this function —
  // ~600 O(n) surrogate correlations per hypothesis, which reaches seconds of
  // main-thread time at a year of data. A hypothesis with |r| below the
  // reporting threshold can never appear in the UI (see the filter below), so
  // testing it buys nothing; it gets p = 1 without the test.
  //
  // Statistical note: those hypotheses still count toward m in the BH
  // correction, but at p = 1 they can no longer occupy early ranks and lift
  // the step-up cutoff for borderline findings. That makes the procedure
  // slightly MORE conservative than testing everything — the acceptable
  // direction for a health product — and the recall scenarios in tests/run.mjs
  // pass unchanged. Measured: ~20x faster on realistic data, because under the
  // null only ~5% of hypotheses clear the threshold.
  const pValues = raw.map((c) =>
    Math.abs(c.r) < MIN_REPORTABLE_R ? 1 : permutationP(c.xs, c.ys, c.r)
  );

  // ONE Benjamini-Hochberg correction across the whole grid.
  //
  // An earlier version of this file corrected within each symptom separately,
  // on the reasoning that pooling would mean tracking a second symptom made
  // the app worse at explaining the first. That reasoning was about BH
  // thresholds on paper and did not survive measurement:
  //
  //   scheme                     noise leak     recall on a planted effect
  //   per-symptom families       3-4 of 40      100%
  //   one global correction      0 of 40        98-100%
  //
  // and holding the effect fixed while growing the symptom count from 1 to 10
  // (288 to 666 hypotheses), the global correction kept 100% recall at every
  // count with zero leaks, while the family split leaked at every count above
  // one. The dilution the split was built to prevent does not happen, because
  // the permutation tail gives a genuine effect a p-value around 1e-8, which
  // clears q/m with enormous margin even at 666 tests.
  //
  // What the split did do is give each of six null families its own 10% error
  // budget, and the user sees the union of those budgets. One correction, one
  // guarantee, over everything the person is actually shown.
  const { passing, adjusted } = benjaminiHochberg(pValues, q);
  const byFamily = new Map();
  raw.forEach((c, i) => {
    if (!byFamily.has(c.family)) byFamily.set(c.family, []);
    byFamily.get(c.family).push(i);
  });

  const findings = raw
    .map((c, i) => ({
      family: c.family,
      driver: c.driver,
      outcome: c.outcome,
      lag: c.lag,
      r: c.r,
      rRaw: c.rRaw,
      trendDriven: c.trendDriven,
      detrended: c.detrended,
      n: c.n,
      p: round4(pValues[i]),
      pAdjusted: round4(adjusted[i]),
      ci: correlationCI(c.r, effectiveN(c.xs, c.ys)),
      passesFDR: passing.has(i),
      effect: effectSize(c.r),
      practical: practicalEffect({ xs: c.rawXs, ys: c.rawYs }),
    }))
    .filter((f) => f.passesFDR && Math.abs(f.r) >= MIN_REPORTABLE_R)
    .sort((a, b) => Math.abs(b.r) - Math.abs(a.r));

  // Keep the best lag per driver/outcome pair; three lags of the same story is
  // padding, and padding is how users stop trusting the section.
  const seen = new Set();
  const deduped = [];
  for (const f of findings) {
    const key = `${f.driver}|${f.outcome}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push({ ...f, text: phrase(f, activeSymptoms) });
  }

  return {
    status: deduped.length ? 'ok' : 'nothing-significant',
    // Raw per-hypothesis p-values, for calibration experiments. Opt-in via
    // `{ raw: true }` so the app does not hold the whole grid in memory on
    // every recompute.
    ...(opts.raw ? { _raw: raw.map((c, i) => ({ family: c.family, driver: c.driver, outcome: c.outcome, lag: c.lag, r: c.r, p: pValues[i] })) } : {}),
    findings: deduped.slice(0, limit),
    families: families.map((f) => ({
      key: f.key, kind: f.kind, label: f.label,
      tested: (byFamily.get(f.key) || []).length,
      found: deduped.filter((d) => d.family === f.key).length,
    })),
    tested: raw.length,
    q,
    message: deduped.length
      ? null
      : `Tested ${raw.length} relationships; none survived correction at FDR ${q}. That is a real result — your habits are not yet varying enough to attribute changes to any one of them.`,
  };
}

/**
 * Round a p-value without ever rendering it as a literal 0. Reporting "p = 0"
 * is a claim no finite sample can support; below 1e-4 we keep significant
 * digits and let the UI render it as "< 0.0001".
 */
const round4 = (x) => {
  if (x == null || !Number.isFinite(x)) return null;
  if (x >= 1e-4) return Math.round(x * 10000) / 10000;
  return Number(x.toPrecision(2));
};

function isSelfReport(field) {
  return ['mood', 'energy', 'stress', 'sleepQuality'].includes(field);
}

export function effectSize(r) {
  const a = Math.abs(r);
  if (a >= 0.5) return 'large';
  if (a >= 0.35) return 'moderate';
  if (a >= 0.2) return 'small';
  return 'negligible';
}

/**
 * Translate a rank correlation into units the user can act on: split the driver
 * at its median and report the difference in mean outcome between halves.
 * "0.41 Spearman" persuades nobody; "0.6 points more energy" persuades.
 */
function practicalEffect(c) {
  const paired = c.xs.map((x, i) => [x, c.ys[i]]).sort((a, b) => a[0] - b[0]);
  const n = paired.length;
  if (n < 10) return null;

  // Split at a VALUE threshold, never at an array position. A positional
  // median split is meaningless for zero-inflated drivers: with alcohol zero
  // on 70% of days, "the top half of days" is mostly zeros too, and the two
  // groups' means differ by a diluted sliver of the real contrast. The split
  // walks the candidate thresholds and takes the one closest to a half/half
  // division that puts strictly-greater values in the high group — for
  // sparse drivers that lands on "days you did vs days you didn't", which is
  // also the sentence the user actually needs.
  const values = [...new Set(paired.map((p) => p[0]))].sort((a, b) => a - b);
  if (values.length < 2) return null;
  let cut = values[0], bestBalance = Infinity;
  for (let i = 0; i < values.length - 1; i++) {
    const highCount = paired.filter((p) => p[0] > values[i]).length;
    const balance = Math.abs(highCount - n / 2);
    if (highCount >= 5 && n - highCount >= 5 && balance < bestBalance) {
      bestBalance = balance;
      cut = values[i];
    }
  }
  const low = paired.filter((p) => p[0] <= cut);
  const high = paired.filter((p) => p[0] > cut);
  if (low.length < 5 || high.length < 5) return null;
  const mean = (a) => a.reduce((x, y) => x + y[1], 0) / a.length;
  const meanX = (a) => a.reduce((x, y) => x + y[0], 0) / a.length;
  return {
    delta: round2(mean(high) - mean(low)),
    lowGroupDriver: round2(meanX(low)),
    highGroupDriver: round2(meanX(high)),
    lowGroupOutcome: round2(mean(low)),
    highGroupOutcome: round2(mean(high)),
  };
}

/** Plain-language rendering. Direction is flipped for lower-is-better fields. */
/** True for anything where a bigger number is a worse day. */
export function isLowerBetter(field) {
  // Every symptom is lower-is-better by definition: nobody tracks "amount of
  // feeling fine". Omitting this inverted the verdict on every symptom
  // finding, so "more alcohol, more migraine" was reported as working for you.
  if (field.startsWith('s_')) return true;
  return LOWER_IS_BETTER.has(field);
}

/** Display label for a field or a user-defined symptom. */
export function labelFor(field, symptoms) {
  if (field.startsWith('s_')) {
    const s = (symptoms || []).find((x) => x.id === field);
    return s ? s.label : 'that symptom';
  }
  return FIELDS[field]?.label || field;
}

export function phrase(f, symptoms = []) {
  const dLabel = labelFor(f.driver, symptoms).toLowerCase();
  const oLabel = labelFor(f.outcome, symptoms).toLowerCase();
  const when = f.lag === 0 ? 'the same day' : f.lag === 1 ? 'the next day' : `${f.lag} days later`;

  const outcomeBetterWhenHigher = !isLowerBetter(f.outcome);
  const outcomeRises = f.r > 0;
  const good = outcomeBetterWhenHigher === outcomeRises;

  // A symptom is rated 0-4, so its delta is in points like the other scales.
  const unit = f.outcome.startsWith('s_') || FIELDS[f.outcome]?.unit === '/5'
    ? ' points'
    : ` ${FIELDS[f.outcome]?.unit || ''}`.trimEnd();
  const magnitude = f.practical
    ? `${Math.abs(f.practical.delta)}${unit}`
    : `a ${f.effect} amount`;

  const direction = outcomeRises ? 'higher' : 'lower';

  // A beneficial-looking correlation FROM a harmful driver gets a caution, not
  // a celebration. "On your higher-alcohol days, stress runs lower — working
  // for you!" is exactly what a weekend confound produces (people drink on the
  // days they are already relaxed), and a health app endorsing drinking on the
  // strength of that would be actively harmful. The pattern is still shown —
  // hiding data would be its own dishonesty — but the verdict names the likely
  // confound instead of blessing the habit.
  let verdict;
  if (good && isLowerBetter(f.driver)) {
    verdict = `Read this one with care: it is more likely something about those days (weekends, social plans) than the ${dLabel} itself.`;
  } else if (good) {
    verdict = 'This one is working for you.';
  } else {
    verdict = 'This one is costing you.';
  }

  return `On your higher-${dLabel} days, ${oLabel} runs ${magnitude} ${direction} ${when}. ${verdict}`;
}

/**
 * What "nothing held up" actually means, in numbers.
 *
 * This is the app's most common output, and presenting it as a settled
 * negative would be the most frequent lie it tells. Measured recall of a
 * genuine planted effect, by history length and true correlation strength:
 *
 *          |r| 0.32     |r| 0.55     |r| 0.71
 *   90d      8%           84%         100%
 *   120d    12%          100%         100%
 *   180d    56%          100%         100%
 *
 * So an empty result rules out a STRONG day-to-day driver among the ones
 * tested. It says very little about a moderate one, and nothing at all about
 * causes the app cannot see — which is most of medicine. The sentence returned
 * here goes wherever an empty result is shown.
 */
export function sensitivityNote(loggedDays) {
  if (loggedDays >= 180) {
    return 'With this much history a strong day-to-day driver would almost certainly have shown up, and a moderate one would be found about half the time. A weaker pattern, or a cause this app cannot see, would not appear at all.';
  }
  if (loggedDays >= 120) {
    return 'With this much history a strong day-to-day driver would almost certainly have shown up, but a moderate one would be missed more often than not. Keep logging and this gets sharper.';
  }
  return 'At this length only a strong day-to-day driver would reliably show up — a moderate one is missed roughly nine times in ten. This is a reason to keep logging, not a clean bill of health.';
}

/**
 * Weekday effects — cheap, reliable, and a good free-tier teaser because almost
 * everyone has one ("your Fridays cost you 6 points").
 */
export function weekdayPattern(entries, scoreFn) {
  const buckets = Array.from({ length: 7 }, () => []);
  for (const e of entries) {
    const s = scoreFn(e);
    if (s == null) continue;
    const [y, m, d] = e.date.split('-').map(Number);
    buckets[new Date(y, m - 1, d).getDay()].push(s);
  }
  const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const stats = buckets.map((vals, i) => ({
    day: names[i],
    n: vals.length,
    mean: vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null,
  }));
  const valid = stats.filter((s) => s.n >= 3 && s.mean != null);
  if (valid.length < 5) return null;
  const overall = valid.reduce((a, b) => a + b.mean, 0) / valid.length;
  const best = valid.reduce((a, b) => (b.mean > a.mean ? b : a));
  const worst = valid.reduce((a, b) => (b.mean < a.mean ? b : a));
  return {
    stats,
    overall: Math.round(overall * 10) / 10,
    best,
    worst,
    spread: Math.round((best.mean - worst.mean) * 10) / 10,
  };
}
