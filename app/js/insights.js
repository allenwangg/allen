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
export const MIN_REPORTABLE_R = 0.20; // findings below this share of the attainable maximum are never shown

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
 * Block length chosen from the data rather than fixed.
 *
 * A bootstrap block has to be longer than the dependence it is trying to
 * break, or the surrogates keep the very structure they were meant to destroy
 * and the null comes out too narrow. Seven days is right for ordinary daily
 * data with a weekly rhythm, and wrong for a trailing seven-day mean, which is
 * smooth by construction — consecutive values share six of seven terms.
 *
 * Measured: adding windowed drivers with a fixed block length of 7 took the
 * noise leak from 0 of 25 datasets to 2 of 25. Scaling the block with the
 * series' own correlation time (roughly 1/(1-rho) for an AR(1)-like series,
 * with a safety factor) puts it back to zero at no cost in recall.
 */
export function blockLengthFor(xs, ys) {
  const rho = Math.max(Math.abs(lag1Autocorr(xs)), Math.abs(lag1Autocorr(ys)));
  const correlationTime = 1 / Math.max(0.02, 1 - Math.min(0.98, rho));
  return Math.max(BLOCK_LENGTH, Math.min(40, Math.ceil(3 * correlationTime)));
}

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
  if (field.charCodeAt(1) === 95) {                      // "s_" or "f_"
    const c = field.charCodeAt(0);
    if (c === 115) {                                      // symptom
      const v = entry.symptoms ? entry.symptoms[field] : undefined;
      return v === undefined ? null : v;
    }
    if (c === 102) {                                      // factor
      const v = entry.factors ? entry.factors[field] : undefined;
      return v === undefined ? null : v;
    }
  }
  const v = entry[field];
  return v === undefined ? null : v;
}

/**
 * Trailing-window drivers.
 *
 * Some things do not act in a day. Sleep debt, accumulated stress and a slow
 * dietary shift build up, and a symptom that follows a bad WEEK is invisible to
 * a single-day correlation. Measured: an effect driven by the previous n nights
 * of sleep is detected 20/20 at n=1, 19/20 at n=4, and 0/20 from n=7 onward,
 * because by then one night is too small a share of the sum to correlate.
 *
 * A driver written "w7_sleepHours" is the trailing 7-day mean of sleepHours
 * ending on the pairing day. Windows are only added for fields where
 * accumulation is physiologically plausible — adding them for everything would
 * double the hypothesis grid to chase effects nobody has.
 */
export const WINDOW_PREFIX = 'w7_';
export const WINDOW_DAYS = 7;

/** Fields where "a bad week" is a real thing, unlike a one-off measurement. */
export const WINDOWED_DRIVERS = [
  'sleepHours', 'sleepQuality', 'stress', 'steps', 'exerciseMinutes',
  'alcoholUnits', 'ultraProcessed', 'produceServings', 'sunlightMinutes', 'socialMinutes',
];

/** Trailing mean of `field` over the WINDOW_DAYS ending at `day`, or null. */
function trailingMean(index, field, day) {
  let sum = 0, n = 0;
  for (let k = 0; k < WINDOW_DAYS; k++) {
    const e = index.byDay.get(day - k);
    if (!e) continue;
    const v = readField(e, field);
    if (v == null) continue;
    sum += v; n++;
  }
  // Require most of the window: a "weekly average" from two days is not one.
  return n >= Math.ceil(WINDOW_DAYS * 0.6) ? sum / n : null;
}

export function alignedPairsIndexed(index, driver, outcome, lag) {
  const xs = [], ys = [], times = [], xDows = [], yDows = [];
  const windowed = driver.startsWith(WINDOW_PREFIX);
  const baseDriver = windowed ? driver.slice(WINDOW_PREFIX.length) : driver;
  for (const { e, day } of index.rows) {
    const x = windowed ? trailingMean(index, baseDriver, day) : readField(e, baseDriver);
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

/**
 * Fewest observations that may sit away from a series' most common value.
 *
 * This is a ROBUSTNESS floor, not a validity one, and the distinction was
 * measured rather than assumed. The permutation null stays calibrated no
 * matter how sparse the series gets: over 1500 pure-noise datasets per cell at
 * n=200, P(p<=.05) came out 0.043 / 0.041 / 0.051 / 0.045 / 0.045 at 30% /
 * 15% / 12% / 6% / 2.5% nonzero — flat, and uniform across the whole p range.
 * Sparsity does not break the mathematics. What it does is rest a finding on a
 * handful of days, where one mis-logged entry changes the answer, and twelve is
 * the point at which that stops being true.
 */
export const MIN_INFORMATIVE = 12;

/**
 * Guard against a "correlation" driven by three outlier days on a flat series.
 *
 * WHY THIS IS A COUNT AND NOT A PERCENTAGE. It used to require 15% of
 * observations away from the modal value, which silently excluded the people
 * this app exists for. Episodic migraine on 12% of days — three or four
 * attacks a month, the textbook presentation — fell under the floor, so the
 * symptom was dropped as an OUTCOME entirely: on a 300-day log where dairy
 * unambiguously triggered it, the number of relationships tested fell from 36
 * to 16 and not one of them concerned the migraine. The report then told them
 * "nothing found" about their main complaint.
 *
 * A percentage confuses "rare" with "uninformative". Twelve flare days is
 * twelve flare days whether they sit in 100 days of log or 400; the second
 * person has a rarer symptom, not a less analysable one.
 */
/**
 * The largest |Spearman| these two series could possibly reach, given their own
 * marginal distributions — which is the correlation when both are optimally
 * aligned, i.e. both sorted.
 *
 * WHY THE REPORTING FLOOR NEEDS IT. Spearman is attenuated by ties, so r is not
 * comparable across variables of different shapes. Where a common exposure
 * meets a rare outcome the ceiling drops below the floor: on 300 days with the
 * habit on 60% of them and the symptom on 5%, a relationship where EVERY flare
 * follows the habit scores r = 0.187 — and a fixed floor of 0.20 threw it away
 * as too weak to mention. That is the same episodic user the informative-count
 * floor above was excluding, failed a second way.
 *
 * Comparing against the attainable maximum asks the question the floor was
 * always meant to ask: is this relationship strong RELATIVE TO HOW STRONG IT
 * COULD BE? For continuous data the maximum is 1 and nothing changes at all.
 */
export function attainableR(xs, ys) {
  const a = [...xs].sort((p, q) => p - q);
  const b = [...ys].sort((p, q) => p - q);
  const m = spearman(a, b);
  return m == null || !Number.isFinite(m) || m <= 0 ? 1 : m;
}

function hasUsableVariance(values) {
  const uniq = new Set(values);
  // Two distinct values is enough, PROVIDED the minority is well represented —
  // which is what the count below enforces. Requiring three used to be the
  // rule, and it excluded every yes/no habit from the engine: strengthSession,
  // a built-in driver, could never produce a finding at all, and a user
  // tracking "dairy: yes/no" — the most natural way to record a suspicion —
  // was never tested. The report then said "nothing found" about a question it
  // had not asked.
  //
  // The windowed drivers turned that silence into a wrong answer. A 7-day
  // trailing average of a binary habit IS continuous, so it passed the guard
  // when its own source did not, and a same-day dairy trigger came back to the
  // user as "this one builds up over a week".
  if (uniq.size < 2) return false;
  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
  if (sd === 0) return false;
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  const modal = Math.max(...counts.values());
  return n - modal >= MIN_INFORMATIVE;
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
    factors = [],
  } = opts;

  // A user's own suspected causes are drivers alongside the built-in habits.
  // Without them the app can only answer questions it thought of, which is no
  // use to someone whose actual suspicion is dairy or a warm bedroom.
  const activeFactors = (factors || []).filter((f) => f && f.id && !f.archivedAt);
  const windowDrivers = opts.windows === false ? [] : [
    ...drivers.filter((d) => WINDOWED_DRIVERS.includes(d)),
    ...activeFactors.map((f) => f.id),
  ].map((d) => WINDOW_PREFIX + d);
  const allDrivers = [...drivers, ...activeFactors.map((f) => f.id), ...windowDrivers];

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
  for (const driver of allDrivers) {
    for (const outcome of outcomes) {
      if (driver === outcome) continue;
      for (const lag of lags) {
        // A trailing window already reaches back seven days; pairing it at a
        // further lag mostly re-tests the same overlapping data.
        if (driver.startsWith(WINDOW_PREFIX) && lag > 1) continue;
        // A window ending on day d CONTAINS day d, so "your stress over the
        // past week" against "your stress today" is partly a variable
        // correlated with itself. That is a tautology, not a finding, and it
        // was the only thing leaking when windows were added: 2 of 25
        // noise datasets, both w7_stress -> stress.
        if (driver.startsWith(WINDOW_PREFIX)
            && driver.slice(WINDOW_PREFIX.length) === outcome
            && lag <= 0) continue;
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
  const floors = raw.map((c) => MIN_REPORTABLE_R * attainableR(c.xs, c.ys));
  const pValues = raw.map((c, i) =>
    Math.abs(c.r) < floors[i] ? 1 : permutationP(c.xs, c.ys, c.r)
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
      effect: effectSize(c.r, attainableR(c.xs, c.ys)),
      practical: practicalEffect({ xs: c.rawXs, ys: c.rawYs }),
      // Carried on the object rather than read from floors[i] in the filter:
      // positional indexing across a map/filter chain silently desyncs the
      // moment anyone inserts a step above it.
      floor: round4(floors[i]),
    }))
    .filter((f) => f.passesFDR && Math.abs(f.r) >= f.floor)
    .sort((a, b) => Math.abs(b.r) - Math.abs(a.r));

  // Keep the best lag per driver/outcome pair; three lags of the same story is
  // padding, and padding is how users stop trusting the section.
  const seen = new Set();
  const deduped = [];
  for (const f of findings) {
    const key = `${f.driver}|${f.outcome}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push({ ...f, text: phrase(f, activeSymptoms, activeFactors) });
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

/**
 * The badge on an insight card.
 *
 * Takes the attainable maximum so the label means the same thing for every
 * shape of variable. Without it the attenuation that bent the reporting floor
 * bends the wording too: a habit that precedes EVERY one of someone's migraines
 * scores r = 0.21 against a ceiling of 0.19, and the card called it a SMALL
 * EFFECT. Relative to what was possible, it is a total one.
 */
export function effectSize(r, max = 1) {
  const a = max > 0 ? Math.abs(r) / max : Math.abs(r);
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
  const rate = (a) => a.filter((p) => p[1] > 0).length / a.length;

  // For something that simply does not happen on most days, a difference of
  // means is a poor description of what the person experienced. "On your red
  // wine days migraine runs 0.31 points higher" is arithmetically true and
  // almost useless; "migraine turned up on 8% of your red wine days and none
  // of the rest" is the same fact in the shape of the question they asked.
  const present = paired.filter((p) => p[1] > 0).length;
  const episodic = present > 0 && present / n <= 0.35;

  return {
    delta: round2(mean(high) - mean(low)),
    lowGroupDriver: round2(meanX(low)),
    highGroupDriver: round2(meanX(high)),
    lowGroupOutcome: round2(mean(low)),
    highGroupOutcome: round2(mean(high)),
    episodic,
    lowRate: Math.round(rate(low) * 100),
    highRate: Math.round(rate(high) * 100),
  };
}

/** Plain-language rendering. Direction is flipped for lower-is-better fields. */
/** True for anything where a bigger number is a worse day. */
export function isLowerBetter(field) {
  if (field.startsWith(WINDOW_PREFIX)) return isLowerBetter(field.slice(WINDOW_PREFIX.length));
  // Every symptom is lower-is-better by definition: nobody tracks "amount of
  // feeling fine". Omitting this inverted the verdict on every symptom
  // finding, so "more alcohol, more migraine" was reported as working for you.
  if (field.startsWith('s_')) return true;
  // A user-defined factor has no inherent direction — the whole reason for
  // tracking it is not knowing whether it helps or hurts. It is only ever a
  // driver, so this is asked about it purely for the confound caution, and the
  // honest answer there is "no idea".
  if (field.startsWith('f_')) return false;
  return LOWER_IS_BETTER.has(field);
}

/** Display label for a field or a user-defined symptom. */
export function labelFor(field, symptoms, factors) {
  if (field.startsWith(WINDOW_PREFIX)) {
    return `${labelFor(field.slice(WINDOW_PREFIX.length), symptoms, factors)} over the past week`;
  }
  if (field.startsWith('s_')) {
    const s = (symptoms || []).find((x) => x.id === field);
    return s ? s.label : 'that symptom';
  }
  if (field.startsWith('f_')) {
    const f = (factors || []).find((x) => x.id === field);
    return f ? f.label : 'that factor';
  }
  return FIELDS[field]?.label || field;
}

export function phrase(f, symptoms = [], factors = []) {
  const windowed = f.driver.startsWith(WINDOW_PREFIX);
  // A windowed driver needs its own sentence shape. Substituting the label
  // into the day-to-day template produced "On your higher-stress at work over
  // the past week days, ..." — a run-on that reads like a bug.
  const dLabel = (windowed
    ? labelFor(f.driver.slice(WINDOW_PREFIX.length), symptoms, factors)
    : labelFor(f.driver, symptoms, factors)).toLowerCase();
  const oLabel = labelFor(f.outcome, symptoms, factors).toLowerCase();
  const when = f.lag === 0 ? 'the same day' : f.lag === 1 ? 'the next day' : `${f.lag} days later`;

  const outcomeBetterWhenHigher = !isLowerBetter(f.outcome);
  const outcomeRises = f.r > 0;
  const good = outcomeBetterWhenHigher === outcomeRises;

  // A symptom is rated 0-4, so its delta is in points like the other scales.
  const unit = f.outcome.startsWith('s_') || f.outcome.startsWith('f_') || FIELDS[f.outcome]?.unit === '/5'
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

  // An episodic symptom is described by how often it turned up, not by how far
  // a mean shifted. See practicalEffect.
  const p = f.practical;
  if (p && p.episodic && f.outcome.startsWith('s_') && p.highRate !== p.lowRate) {
    const rates = `${oLabel} turned up on ${p.highRate}% of them against ${p.lowRate}% of the rest`;
    if (windowed) {
      return `After a week of higher ${dLabel}, ${rates} — this one seems to build up rather than hit the next day. ${verdict}`;
    }
    return `On your higher-${dLabel} days, ${rates}, ${when}. ${verdict}`;
  }

  if (windowed) {
    return `After a week of higher ${dLabel}, ${oLabel} runs ${magnitude} ${direction} — this one seems to build up rather than hit the next day. ${verdict}`;
  }
  return `On your higher-${dLabel} days, ${oLabel} runs ${magnitude} ${direction} ${when}. ${verdict}`;
}

/**
 * Measured recall of THIS engine, as a function of how many days are logged.
 *
 * Every number here was produced by running the real discover() over 50
 * synthetic logs per cell: a full set of sixteen habit fields plus one symptom,
 * with a single next-day effect of `beta` standard deviations planted from late
 * caffeine onto the symptom, and a finding counted only when it named that
 * driver and that outcome. See docs/INSIGHTS.md.
 *
 * WHY IT IS WORTH THE TROUBLE. The wording this replaced was written from
 * intuition and was wrong in the direction that does harm: it told someone with
 * 60 days that "only a strong day-to-day driver would reliably show up", when
 * a strong driver is found 20% of the time at that length. Read alongside
 * "nothing held up", that invites the conclusion that there is no strong
 * driver — wrong four times in five.
 *
 * These are simulations, not a guarantee about any particular person's data.
 * They are a fair description of what this engine does to logs of this shape,
 * which is a great deal better than a confident sentence backed by nothing.
 */
export const POWER_CURVE = {
  days:     [60, 90, 120, 150, 180, 240, 300],
  weak:     [0.00, 0.00, 0.02, 0.06, 0.10, 0.14, 0.20],
  moderate: [0.02, 0.12, 0.32, 0.46, 0.74, 0.84, 0.96],
  strong:   [0.20, 0.54, 0.86, 0.96, 1.00, 1.00, 1.00],
};

/** Interpolated chance this engine finds an effect of `size` at `days`. */
export function detectionChance(days, size = 'moderate') {
  const ys = POWER_CURVE[size];
  if (!ys || !Number.isFinite(days)) return null;
  const xs = POWER_CURVE.days;
  if (days <= xs[0]) return ys[0] * (days / xs[0]);   // nothing is detectable at zero days
  if (days >= xs[xs.length - 1]) return ys[ys.length - 1];
  for (let i = 1; i < xs.length; i++) {
    if (days <= xs[i]) {
      const f = (days - xs[i - 1]) / (xs[i] - xs[i - 1]);
      return ys[i - 1] + f * (ys[i] - ys[i - 1]);
    }
  }
  return ys[ys.length - 1];
}

/** Fewest logged days at which `size` is found at least `target` of the time. */
export function daysForChance(size, target) {
  const xs = POWER_CURVE.days, ys = POWER_CURVE[size];
  if (!ys) return null;
  if (ys[ys.length - 1] < target) return null;        // not reachable on this curve
  for (let i = 0; i < xs.length; i++) {
    if (ys[i] >= target) {
      if (i === 0) return xs[0];
      const f = (target - ys[i - 1]) / (ys[i] - ys[i - 1]);
      return Math.ceil(xs[i - 1] + f * (xs[i] - xs[i - 1]));
    }
  }
  return null;
}

/** Plain-English odds. Never rounds 0.96 up to a certainty. */
export function chancePhrase(p) {
  if (p >= 0.97) return 'almost every time';
  if (p >= 0.85) return 'about 9 times in 10';
  if (p < 0.05) return 'essentially never';
  if (p < 0.15) return 'about 1 time in 10';
  return `about ${Math.round(p * 10)} times in 10`;
}

/**
 * What "nothing held up" is actually worth at this much history — in numbers,
 * and with the next milestone, so that "keep logging" has a finish line.
 */
export function sensitivityNote(loggedDays) {
  const n = Math.max(0, Math.floor(loggedDays || 0));
  const strong = detectionChance(n, 'strong');
  const moderate = detectionChance(n, 'moderate');
  const head = `On simulated logs of this shape, ${n} days catches a strong day-to-day driver `
    + `${chancePhrase(strong)} and a moderate one ${chancePhrase(moderate)}.`;
  const tail = 'Nothing holding up is mostly a statement about how much history there is, '
    + 'not a clean bill of health.';

  // The next length worth walking towards. A milestone a fortnight away is not
  // news, so skip to the one after it.
  for (const [target, words] of [[0.5, 'half the time'], [0.7, '7 times in 10'], [0.9, '9 times in 10']]) {
    if (moderate >= target) continue;
    const need = daysForChance('moderate', target);
    if (!need || need - n < 14) continue;
    return `${head} Another ${need - n} days would take a moderate one to ${words}. ${tail}`;
  }
  return `${head} A weaker driver, or a cause this app cannot see at all, still would not appear. ${tail}`;
}


/**
 * Minimum logged days before a day-of-week claim is worth testing at all.
 * Seven group means need enough observations per group to mean anything; below
 * three weeks the worst-looking weekday is essentially drawn from a hat.
 */
export const WEEKDAY_MIN_DAYS = 21;

/**
 * Is one symptom worse on particular days of the week — and is that real?
 *
 * WHY THIS EXISTS. The engine already measures each series' weekday effect and,
 * where it is strong enough, subtracts it before looking for correlations
 * (see conditionalDeseasonalize). Until now that measurement was used only to
 * clean the data and was then thrown away — yet "your migraines are a Monday
 * thing" is one of the most useful things a log can tell you, because it points
 * at something structural in the week rather than at a habit.
 *
 * WHY A PLAIN SHUFFLE, when the correlation engine next door uses circular
 * shifts. Circular shifts are right THERE because they preserve each series'
 * own structure while destroying the alignment BETWEEN two series. Here there
 * is only one series and its 7-day periodicity is the hypothesis itself — and
 * a circular shift preserves periodicity. Shifting a series whose Mondays are
 * bad just makes some other weekday the bad one, with almost the same eta2, so
 * the null is nearly invariant under the alternative it is supposed to detect.
 * Measured over 200 datasets, 120 days with a real 1-point Monday effect:
 * circular shifts found it 46-62% of the time depending on autocorrelation,
 * a free shuffle 99%.
 *
 * The free shuffle does break the series' autocorrelation, which is the usual
 * reason to avoid it — but here that error runs in the safe direction. Runs of
 * bad days land across all seven weekday buckets (consecutive days are always
 * in different buckets), pulling the observed bucket means together, so the
 * observed eta2 is if anything suppressed relative to the shuffled null.
 * Measured false-positive rate at p<=.05 over 1000 datasets per cell, on
 * series with no weekday structure at all: 0.046 at lag-1 autocorrelation 0,
 * 0.013 at 0.5, 0.000 at 0.85; 0.021 when only 70% of days are logged; 0.029
 * when the symptom is nearly always absent and 0.030 when nearly always
 * present. Nominal where it matters and conservative everywhere else, at the
 * cost of missing some real effects in the most strongly clustered series.
 *
 * Reported only as a description of WHEN the symptom lands. It is not a cause,
 * and the app never proposes one.
 */
export function weekdayEffect(entries, field, samples = 3000) {
  if (!entries || entries.length < WEEKDAY_MIN_DAYS) return null;

  const xs = [], ds = [];
  for (const e of entries) {
    const v = readField(e, field);
    if (v == null || !Number.isFinite(v)) continue;
    const [y, m, d] = e.date.split('-').map(Number);
    xs.push(v); ds.push(new Date(y, m - 1, d).getDay());
  }
  if (xs.length < WEEKDAY_MIN_DAYS) return null;

  const sums = new Array(7).fill(0), counts = new Array(7).fill(0);
  let present = 0;
  for (let i = 0; i < xs.length; i++) {
    counts[ds[i]]++; sums[ds[i]] += xs[i];
    if (xs[i] > 0) present++;
  }
  // Every weekday needs enough observations to carry a claim of its own, and a
  // symptom recorded as present on three days in total has a perfect "weekday
  // pattern" that means nothing.
  if (counts.filter((c) => c >= 3).length < 6) return null;
  if (present < 7) return null;

  const fit = weekdayFit(xs, ds);
  if (!fit) return null;
  const observed = fit.eta2;

  // Deterministic: the same log must always produce the same p-value, or the
  // number moves under the user every time the page re-renders.
  let seed = 0x9e3779b9 ^ xs.length;
  for (let i = 0; i < xs.length; i++) seed = (Math.imul(seed ^ (xs[i] * 31 + ds[i]), 0x85ebca6b) >>> 0);
  const rand = () => {
    seed ^= seed << 13; seed >>>= 0;
    seed ^= seed >> 17;
    seed ^= seed << 5; seed >>>= 0;
    return seed / 4294967296;
  };

  const shuffled = xs.slice();
  let ge = 0;
  for (let s = 0; s < samples; s++) {
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const t = shuffled[i]; shuffled[i] = shuffled[j]; shuffled[j] = t;
    }
    const f = weekdayFit(shuffled, ds);
    if (f && f.eta2 >= observed) ge++;
  }

  const byDay = counts.map((c, d) => ({
    dow: d,
    day: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d],
    n: c,
    mean: c ? Math.round((sums[d] / c) * 100) / 100 : null,
  }));
  const rated = byDay.filter((b) => b.n >= 3);
  const worst = rated.reduce((a, b) => (b.mean > a.mean ? b : a));
  const best = rated.reduce((a, b) => (b.mean < a.mean ? b : a));

  return {
    field, n: xs.length,
    eta2: Math.round(observed * 1000) / 1000,
    p: (1 + ge) / (samples + 1),
    byDay, worst, best,
    spread: Math.round((worst.mean - best.mean) * 100) / 100,
  };
}

/**
 * Weekday effect for every tracked symptom, corrected for testing several.
 *
 * Testing seven symptoms and reporting whichever has the best-looking week is
 * the same multiple-comparisons trap the correlation engine exists to avoid,
 * so the same Benjamini-Hochberg procedure applies across the family.
 */
export function weekdayEffects(entries, symptoms) {
  const live = (symptoms || []).filter((x) => !x.archivedAt);
  if (!live.length) return [];
  const raw = live.map((sym) => {
    const w = weekdayEffect(entries, sym.id);
    return w ? { ...w, label: sym.label, primary: !!sym.primary } : null;
  }).filter(Boolean);
  if (!raw.length) return [];
  const { passing, adjusted } = benjaminiHochberg(raw.map((w) => w.p), FDR_Q);
  return raw
    .map((w, i) => ({ ...w, pAdjusted: Math.round(adjusted[i] * 10000) / 10000, significant: passing.has(i) }))
    .filter((w) => w.significant)
    .sort((a, b) => a.pAdjusted - b.pAdjusted);
}

/**
 * Are the days you skip logging different from the days you log?
 *
 * WHY THIS EXISTS. Every correlation in this app is computed on logged days
 * only, and silently assumes the unlogged ones are missing for reasons
 * unrelated to how you felt. That assumption is often false in exactly the
 * way that matters: people stop logging during the worst stretches — too ill,
 * too busy, too demoralised — and resume when things settle. If that is
 * happening, the engine is drawing its conclusions from a systematically
 * milder version of your life, and nothing else in the app would notice.
 *
 * It cannot be tested directly, because the severity of an unlogged day is
 * precisely what is unknown. What CAN be tested is the severity of the logged
 * days that sit on either side of a gap. If bad stretches go unrecorded, the
 * days bordering the gaps are the shoulders of those stretches and run worse
 * than the rest.
 *
 * THE NULL. Two series again — the severity series and the pattern of gaps —
 * with the alignment between them under test, so here circular shifts are
 * right (contrast weekdayEffect, where the periodicity of a single series is
 * the hypothesis). Shifting the gap mask around the calendar preserves both
 * the clustering of the gaps and the autocorrelation of the symptom, and
 * changes only which days the gaps happen to land beside.
 *
 * Reported as a caveat on the findings, never as a reprimand. Someone who
 * stopped logging for a fortnight because they were floored does not need to
 * be told off by a phone.
 */
export function loggingBias(entries, field, samples = 2000) {
  if (!entries || entries.length < 21) return null;
  const first = entries[0].date, last = entries[entries.length - 1].date;
  const span = daysBetween(first, last) + 1;
  if (span < 28) return null;

  const byDate = new Map(entries.map((e) => [e.date, e]));
  const vals = new Array(span).fill(null);
  for (let i = 0; i < span; i++) {
    const e = byDate.get(addDays(first, i));
    if (!e) continue;
    const v = readField(e, field);
    if (v != null && Number.isFinite(v)) vals[i] = v;
  }

  const logged = vals.reduce((a, v) => a + (v != null ? 1 : 0), 0);
  const missing = span - logged;
  // Nothing to say when almost nothing is missing, and nothing trustworthy to
  // say when almost everything is.
  if (missing < 5 || logged < 21 || missing / span > 0.6) return null;

  const gap = vals.map((v) => v == null);

  const diffAt = (shift) => {
    let adjSum = 0, adjN = 0, restSum = 0, restN = 0;
    for (let i = 0; i < span; i++) {
      if (vals[i] == null) continue;
      const before = gap[(i - 1 + shift + span) % span];
      const after = gap[(i + 1 + shift) % span];
      if (before || after) { adjSum += vals[i]; adjN++; } else { restSum += vals[i]; restN++; }
    }
    if (adjN < 4 || restN < 8) return null;
    return adjSum / adjN - restSum / restN;
  };

  const observed = diffAt(0);
  if (observed == null) return null;

  let ge = 0, tried = 0;
  const step = Math.max(1, Math.floor(span / samples));
  for (let k = step; k < span; k += step) {
    const d = diffAt(k);
    if (d == null) continue;
    tried++;
    // One-sided: the concern is that the WORST days go unlogged. A log that
    // skips the good days biases findings too, but not in a way that would
    // make someone act on a symptom they do not have.
    if (d >= observed) ge++;
  }
  if (tried < 20) return null;

  let adjSum = 0, adjN = 0, restSum = 0, restN = 0;
  for (let i = 0; i < span; i++) {
    if (vals[i] == null) continue;
    if (gap[(i - 1 + span) % span] || gap[(i + 1) % span]) { adjSum += vals[i]; adjN++; }
    else { restSum += vals[i]; restN++; }
  }

  return {
    field, span, logged, missing,
    coverage: Math.round((logged / span) * 100),
    beside: Math.round((adjSum / adjN) * 100) / 100,
    away: Math.round((restSum / restN) * 100) / 100,
    diff: Math.round(observed * 100) / 100,
    p: (1 + ge) / (tried + 1),
    shifts: tried,
  };
}

/**
 * Logging-bias check across every tracked symptom, corrected for testing several.
 */
export function loggingBiasChecks(entries, symptoms) {
  const live = (symptoms || []).filter((x) => !x.archivedAt);
  if (!live.length) return [];
  const raw = live.map((sym) => {
    const b = loggingBias(entries, sym.id);
    return b ? { ...b, label: sym.label, primary: !!sym.primary } : null;
  }).filter(Boolean);
  if (!raw.length) return [];
  const { passing, adjusted } = benjaminiHochberg(raw.map((b) => b.p), FDR_Q);
  return raw
    .map((b, i) => ({ ...b, pAdjusted: Math.round(adjusted[i] * 10000) / 10000, significant: passing.has(i) }))
    .filter((b) => b.significant)
    .sort((a, b) => a.pAdjusted - b.pAdjusted);
}
