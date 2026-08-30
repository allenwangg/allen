/**
 * engine.js — The Healthspan scoring engine.
 *
 * Design constraints that matter commercially:
 *  1. TRANSPARENT. Every point is attributable to a pillar and a curve. Users
 *     churn from black-box scores; they renew for scores they can argue with.
 *  2. PURE. No storage, no DOM, no clock. Same input -> same output, so the
 *     what-if simulator and the test suite can both call it directly.
 *  3. NON-DIAGNOSTIC. This is a habit-quality index, not a medical assessment.
 *     Copy and disclaimers must stay consistent with that.
 */

import { FIELDS, clamp, addDays, daysBetween } from './model.js';

/* ------------------------------------------------------------------ *
 * Scoring primitives
 * ------------------------------------------------------------------ */

/**
 * Piecewise-linear response curve. Points are [x, score] pairs, ascending in x.
 * Linear interpolation between them, flat outside. This shape is deliberate:
 * most health dose-responses are non-monotonic (more sleep isn't linearly
 * better; 11h is worse than 8h) and a curve expresses that honestly where a
 * single coefficient cannot.
 */
export function curve(points, x) {
  if (x === null || x === undefined || !Number.isFinite(x)) return null;
  if (x <= points[0][0]) return points[0][1];
  const last = points[points.length - 1];
  if (x >= last[0]) return last[1];
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    if (x >= x0 && x <= x1) {
      const t = x1 === x0 ? 0 : (x - x0) / (x1 - x0);
      return y0 + t * (y1 - y0);
    }
  }
  return last[1];
}

/** Weighted mean that transparently ignores null (unlogged) components. */
export function weightedMean(parts) {
  let num = 0, den = 0;
  for (const p of parts) {
    if (p.score === null || p.score === undefined) continue;
    num += p.score * p.weight;
    den += p.weight;
  }
  return den === 0 ? null : num / den;
}

/* ------------------------------------------------------------------ *
 * Response curves — the tuned heart of the product.
 * Sourced from mainstream public-health dose-response literature and
 * deliberately conservative. Documented in docs/SCORING.md.
 * ------------------------------------------------------------------ */

export const CURVES = {
  // U-shaped: both short and long sleep score down.
  sleepHours: [[0, 0], [4, 20], [5.5, 45], [6.5, 75], [7, 92], [7.5, 100], [8.5, 100], [9, 88], [10, 62], [12, 30], [16, 15]],
  sleepQuality: [[1, 10], [2, 35], [3, 60], [4, 85], [5, 100]],
  // Bedtime regularity is scored separately (variance-based); this is lateness.
  bedtimeLate: [[0, 100], [30, 92], [60, 78], [90, 60], [120, 42], [180, 22], [300, 8]],
  steps: [[0, 0], [2000, 18], [4000, 42], [6000, 62], [8000, 80], [10000, 92], [12000, 100], [16000, 100], [25000, 94]],
  // Minutes of purposeful training, saturating (overtraining is real).
  exerciseMinutes: [[0, 0], [10, 22], [20, 45], [30, 65], [45, 85], [60, 96], [90, 100], [150, 96], [240, 82], [360, 65]],
  proteinPerKg: [[0, 0], [0.4, 20], [0.6, 40], [0.8, 62], [1.0, 80], [1.2, 92], [1.6, 100], [2.2, 100], [3.0, 88]],
  produceServings: [[0, 0], [1, 22], [2, 42], [3, 60], [4, 74], [5, 88], [6, 96], [8, 100], [15, 100]],
  ultraProcessed: [[0, 100], [1, 92], [2, 80], [3, 66], [4, 52], [6, 30], [8, 15], [15, 0]],
  fiberGrams: [[0, 0], [5, 15], [10, 32], [15, 50], [20, 68], [25, 84], [30, 95], [40, 100], [120, 100]],
  hydrationLitres: [[0, 0], [0.5, 20], [1, 42], [1.5, 65], [2, 85], [2.5, 96], [3, 100], [5, 96], [8, 80]],
  // Non-linear penalty: the first drink costs less than the fourth.
  alcoholUnits: [[0, 100], [1, 88], [2, 72], [3, 54], [4, 38], [6, 18], [8, 8], [20, 0]],
  caffeineAfter2pm: [[0, 100], [50, 84], [100, 68], [150, 52], [250, 30], [400, 14], [600, 5]],
  stressInv: [[1, 100], [2, 82], [3, 60], [4, 34], [5, 12]],
  moodEnergy: [[1, 10], [2, 35], [3, 60], [4, 85], [5, 100]],
  sunlightMinutes: [[0, 0], [5, 20], [10, 38], [20, 62], [30, 78], [45, 92], [60, 100], [480, 100]],
  socialMinutes: [[0, 10], [15, 32], [30, 52], [60, 74], [120, 92], [180, 100], [720, 100]],
};

/* ------------------------------------------------------------------ *
 * Pillars
 * ------------------------------------------------------------------ */

export const PILLAR_WEIGHTS = {
  sleep: 0.24,
  movement: 0.22,
  nutrition: 0.20,
  recovery: 0.16,
  substances: 0.10,
  metabolic: 0.08,
};

export const PILLAR_LABELS = {
  sleep: 'Sleep',
  movement: 'Movement',
  nutrition: 'Nutrition',
  recovery: 'Recovery',
  substances: 'Substances',
  metabolic: 'Metabolic',
};

/**
 * Age- and sex-referenced norms for resting HR and HRV. Used only for the
 * metabolic pillar and the bio-age adjustment, and only when the user has
 * actually logged them.
 */
export function rhrNorm(age) {
  // Population median RHR drifts up modestly with age.
  return clamp(62 + (age - 30) * 0.09, 58, 72);
}

export function hrvNorm(age) {
  // RMSSD declines roughly exponentially with age.
  return clamp(62 * Math.exp(-0.018 * Math.max(0, age - 20)), 15, 70);
}

/**
 * Score one day. `ctx` carries user profile (age, sex, weightKg) and the
 * trailing window used for regularity/consistency terms.
 */
export function scoreDay(entry, ctx = {}) {
  const age = Number(ctx.age) || 35;
  const weightKg = Number(entry.bodyweightKg) || Number(ctx.weightKg) || 75;

  /* --- Sleep --------------------------------------------------- */
  const sleepParts = [
    { key: 'duration', weight: 0.50, score: curve(CURVES.sleepHours, entry.sleepHours) },
    { key: 'quality',  weight: 0.32, score: curve(CURVES.sleepQuality, entry.sleepQuality) },
    { key: 'timing',   weight: 0.18, score: bedtimeScore(entry.bedtimeMinutes) },
  ];

  /* --- Movement ------------------------------------------------ */
  const trainingLoad = (entry.exerciseMinutes || 0) * (1 + 0.28 * (entry.exerciseIntensity || 0));
  const movementParts = [
    { key: 'steps',    weight: 0.42, score: curve(CURVES.steps, entry.steps) },
    { key: 'training', weight: 0.42, score: curve(CURVES.exerciseMinutes, trainingLoad) },
    // Linear in the value, not a truthiness test. Logged days carry 0 or 1,
    // where this is identical — but the simulator's average day carries the
    // 28-day FREQUENCY (one session in 28 days = 0.036), and a truthiness test
    // scored that user as if they trained daily, which both mis-stated their
    // baseline and hid 'add a strength session' from the leverage ranking.
    { key: 'strength', weight: 0.16, score: 35 + 65 * clamp(entry.strengthSession ?? 0, 0, 1) },
  ];

  /* --- Nutrition ----------------------------------------------- */
  const proteinPerKg = weightKg > 0 ? (entry.proteinGrams || 0) / weightKg : 0;
  const nutritionParts = [
    { key: 'protein',   weight: 0.30, score: curve(CURVES.proteinPerKg, proteinPerKg) },
    { key: 'produce',   weight: 0.26, score: curve(CURVES.produceServings, entry.produceServings) },
    { key: 'processed', weight: 0.24, score: curve(CURVES.ultraProcessed, entry.ultraProcessed) },
    { key: 'fiber',     weight: 0.12, score: curve(CURVES.fiberGrams, entry.fiberGrams) },
    { key: 'hydration', weight: 0.08, score: curve(CURVES.hydrationLitres, entry.hydrationLitres) },
  ];

  /* --- Recovery ------------------------------------------------ */
  const recoveryParts = [
    { key: 'stress',   weight: 0.34, score: curve(CURVES.stressInv, entry.stress) },
    { key: 'mood',     weight: 0.22, score: curve(CURVES.moodEnergy, entry.mood) },
    { key: 'energy',   weight: 0.18, score: curve(CURVES.moodEnergy, entry.energy) },
    { key: 'daylight', weight: 0.16, score: curve(CURVES.sunlightMinutes, entry.sunlightMinutes) },
    { key: 'social',   weight: 0.10, score: curve(CURVES.socialMinutes, entry.socialMinutes) },
  ];

  /* --- Substances ---------------------------------------------- */
  const substanceParts = [
    { key: 'alcohol',  weight: 0.52, score: curve(CURVES.alcoholUnits, entry.alcoholUnits) },
    // Same frequency-linear treatment as strengthSession above: one smoking
    // day in 28 used to zero this part, baselining an occasional smoker as a
    // daily one.
    { key: 'nicotine', weight: 0.30, score: 100 * (1 - clamp(entry.nicotine ?? 0, 0, 1)) },
    { key: 'caffeine', weight: 0.18, score: curve(CURVES.caffeineAfter2pm, entry.caffeineAfter2pm) },
  ];

  /* --- Metabolic (biomarker-gated) ----------------------------- */
  const metabolicParts = [];
  if (entry.restingHR != null) {
    const norm = rhrNorm(age);
    // 1 point per 0.4 bpm below norm, capped. Lower is better.
    metabolicParts.push({ key: 'restingHR', weight: 0.55, score: clamp(70 + (norm - entry.restingHR) * 2.5, 0, 100) });
  }
  if (entry.hrv != null) {
    const norm = hrvNorm(age);
    const ratio = entry.hrv / norm;
    metabolicParts.push({ key: 'hrv', weight: 0.45, score: clamp(50 + (ratio - 1) * 90, 0, 100) });
  }
  if (entry.waistCm != null && (ctx.heightCm || entry.heightCm)) {
    // Waist-to-height ratio, which predicts cardiometabolic risk better than
    // BMI and needs no sex-specific table: under 0.5 is the widely used
    // "keep your waist to less than half your height" threshold.
    //
    // This part exists because the Pro copy sells "waist folded into your
    // score". It previously was not: logging waist changed nothing, which
    // made the sales sentence false. Either the code backs the claim or the
    // claim goes; this is the former.
    const whtr = entry.waistCm / Number(ctx.heightCm || entry.heightCm);
    metabolicParts.push({
      key: 'waist',
      weight: 0.30,
      score: curve([[0.35, 100], [0.45, 92], [0.50, 78], [0.55, 58], [0.60, 36], [0.70, 14], [0.85, 0]], whtr),
    });
  }

  const pillars = {
    sleep:      { score: weightedMean(sleepParts),      parts: sleepParts },
    movement:   { score: weightedMean(movementParts),   parts: movementParts },
    nutrition:  { score: weightedMean(nutritionParts),  parts: nutritionParts },
    recovery:   { score: weightedMean(recoveryParts),   parts: recoveryParts },
    substances: { score: weightedMean(substanceParts),  parts: substanceParts },
    metabolic:  { score: weightedMean(metabolicParts),  parts: metabolicParts },
  };

  const composite = weightedMean(
    Object.entries(pillars).map(([k, p]) => ({ score: p.score, weight: PILLAR_WEIGHTS[k] }))
  );

  return {
    date: entry.date,
    score: composite === null ? null : round1(composite),
    pillars: Object.fromEntries(
      Object.entries(pillars).map(([k, p]) => [k, {
        score: p.score === null ? null : round1(p.score),
        weight: PILLAR_WEIGHTS[k],
        parts: p.parts.map((x) => ({ ...x, score: x.score === null ? null : round1(x.score) })),
      }])
    ),
  };
}

function bedtimeScore(bedtimeMinutes) {
  if (bedtimeMinutes == null) return null;
  // Treat 22:00 (1320) as the reference. Wrap post-midnight values.
  const m = bedtimeMinutes < 720 ? bedtimeMinutes + 1440 : bedtimeMinutes;
  const lateness = Math.max(0, m - 1320);
  return curve(CURVES.bedtimeLate, lateness);
}

const round1 = (x) => Math.round(x * 10) / 10;

/* ------------------------------------------------------------------ *
 * Trailing aggregates: consistency, regularity, trend
 * ------------------------------------------------------------------ */

/**
 * Sleep-timing regularity — the standard deviation of bedtime over the window.
 * Irregularity is independently associated with worse outcomes even when
 * duration is fine, so it earns its own term rather than folding into duration.
 */
export function sleepRegularity(entries) {
  const times = entries
    .map((e) => e.bedtimeMinutes)
    .filter((t) => t != null)
    .map((t) => (t < 720 ? t + 1440 : t));
  if (times.length < 4) return null;
  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  const sd = Math.sqrt(times.reduce((a, b) => a + (b - mean) ** 2, 0) / times.length);
  return { sdMinutes: Math.round(sd), score: round1(curve([[0, 100], [15, 92], [30, 78], [45, 62], [60, 46], [90, 26], [150, 8]], sd)) };
}

/**
 * Adherence: what fraction of the window has a logged entry. Drives the
 * consistency multiplier and, commercially, the streak mechanic.
 */
export function adherence(entries, windowDays, endDate) {
  const start = addDays(endDate, -(windowDays - 1));
  const inWindow = entries.filter((e) => e.date >= start && e.date <= endDate);
  return { logged: inWindow.length, windowDays, ratio: inWindow.length / windowDays };
}

/**
 * Ordinary least squares slope of score over time, in points per week.
 * Used for the "you're trending up/down" headline and for the trend chart.
 */
export function trendSlope(scored) {
  const pts = scored.filter((s) => s.score != null);
  if (pts.length < 4) return null;
  const t0 = pts[0].date;
  const xs = pts.map((s) => daysBetween(t0, s.date));
  const ys = pts.map((s) => s.score);
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
  if (den === 0) return null;
  return round1((num / den) * 7); // points per week
}

/** Exponentially weighted moving average — smoother headline than a raw mean. */
export function ewma(values, halfLifeDays = 7) {
  const alpha = 1 - Math.pow(0.5, 1 / halfLifeDays);
  let acc = null;
  const out = [];
  for (const v of values) {
    if (v == null) { out.push(acc); continue; }
    acc = acc === null ? v : acc + alpha * (v - acc);
    out.push(acc);
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Biological age delta
 * ------------------------------------------------------------------ */

/**
 * Convert a sustained habit score into an estimated years-of-healthspan delta.
 *
 * This is an ILLUSTRATIVE heuristic, not a biomarker clock. It exists because
 * "you're 3.2 years younger than your calendar age" is the single most
 * shareable, most retention-driving number a habit tracker can produce — and
 * because expressing it in years makes the marginal value of a habit change
 * legible in a way a 0-100 score never does.
 *
 * The mapping is anchored so that:
 *   score 50  -> 0.0 years (population-average habits)
 *   score 85  -> about -4.5 years
 *   score 20  -> about +4 years
 * and it saturates at +/- 9 years, because claiming more than that from
 * self-reported habit data would be dishonest.
 */
export function bioAgeDelta(sustainedScore, ctx = {}) {
  if (sustainedScore == null) return null;
  const age = Number(ctx.age) || 35;
  // Logistic-ish transform centred at 50, saturating at +/- 9. The steepness
  // is solved from the documented anchor rather than chosen by eye: at the
  // reference age of 35 (age multiplier 0.83), a sustained score of 85 must
  // map to about -4.5 years, which requires tanh((35/22) * k) = 4.5/(9*0.83),
  // i.e. k = 0.44. An earlier value of 0.78 overshot the documented anchors by
  // 40-100% (85 -> -6.3 years at age 35, -9 at age 70), which contradicted
  // both the doc comment and docs/SCORING.md and made the headline number
  // less conservative than the product claims to be.
  const z = (sustainedScore - 50) / 22;
  let delta = -9 * Math.tanh(z * 0.44);

  // Older users have more absolute room to move; scale modestly with age.
  delta *= clamp(0.72 + (age - 25) * 0.011, 0.72, 1.25);

  // Biomarker corroboration nudges the estimate and is disclosed in the UI.
  if (ctx.avgRestingHR != null) {
    delta += clamp((ctx.avgRestingHR - rhrNorm(age)) * 0.075, -1.6, 1.6);
  }
  if (ctx.avgHrv != null) {
    delta -= clamp((ctx.avgHrv / hrvNorm(age) - 1) * 2.2, -1.6, 1.6);
  }

  delta = clamp(delta, -9, 9);
  return {
    years: Math.round(delta * 10) / 10,
    effectiveAge: Math.round((age + delta) * 10) / 10,
    chronologicalAge: age,
    confidence: ctx.confidence ?? 'low',
  };
}

/**
 * Confidence tiering. Shown next to the bio-age number so the claim is always
 * qualified by how much data actually backs it.
 */
export function confidenceFor(loggedDays, hasBiomarkers) {
  if (loggedDays < 7) return 'very low';
  if (loggedDays < 21) return 'low';
  if (loggedDays < 60) return hasBiomarkers ? 'moderate' : 'low-moderate';
  return hasBiomarkers ? 'good' : 'moderate';
}

/* ------------------------------------------------------------------ *
 * Full report — one call, everything the dashboard needs.
 * ------------------------------------------------------------------ */

export function buildReport(entries, ctx = {}) {
  const sorted = [...entries].sort((a, b) => (a.date < b.date ? -1 : 1));
  const scored = sorted.map((e) => scoreDay(e, ctx));
  const endDate = sorted.length ? sorted[sorted.length - 1].date : null;

  const window = (n) => {
    if (!endDate) return [];
    const start = addDays(endDate, -(n - 1));
    return scored.filter((s) => s.date >= start);
  };

  const meanScore = (arr) => {
    const vals = arr.map((s) => s.score).filter((v) => v != null);
    return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
  };

  const w7 = window(7), w28 = window(28), w90 = window(90);
  const sustained = meanScore(w28) ?? meanScore(w7) ?? (scored.length ? scored[scored.length - 1].score : null);

  const recent = sorted.slice(-28);
  const avgOf = (field) => {
    const vals = recent.map((e) => e[field]).filter((v) => v != null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };
  const avgRestingHR = avgOf('restingHR');
  const avgHrv = avgOf('hrv');
  const confidence = confidenceFor(sorted.length, avgRestingHR != null || avgHrv != null);

  const pillarAverages = {};
  for (const key of Object.keys(PILLAR_WEIGHTS)) {
    const vals = w28.map((s) => s.pillars[key]?.score).filter((v) => v != null);
    pillarAverages[key] = vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
  }

  return {
    scored,
    today: scored.length ? scored[scored.length - 1] : null,
    avg7: meanScore(w7),
    avg28: meanScore(w28),
    avg90: meanScore(w90),
    sustained,
    pillarAverages,
    trendPerWeek: trendSlope(w28),
    regularity: sleepRegularity(recent),
    adherence: endDate ? adherence(sorted, 28, endDate) : null,
    streak: currentStreak(sorted),
    bioAge: bioAgeDelta(sustained, { ...ctx, avgRestingHR, avgHrv, confidence }),
    confidence,
    loggedDays: sorted.length,
  };
}

/** Consecutive days logged, counting back from the most recent entry. */
export function currentStreak(sorted) {
  if (!sorted.length) return 0;
  let streak = 1;
  for (let i = sorted.length - 1; i > 0; i--) {
    if (daysBetween(sorted[i - 1].date, sorted[i].date) === 1) streak++;
    else break;
  }
  return streak;
}

/**
 * What-if simulator (Pro). Apply a set of habit deltas to the recent average
 * day and report the projected score and bio-age change. This is the feature
 * that makes the upgrade concrete: "sleep +45min => -0.8 years".
 */
export function simulate(entries, changes, ctx = {}) {
  const recent = [...entries].sort((a, b) => (a.date < b.date ? -1 : 1)).slice(-28);
  if (!recent.length) return null;

  const avgDay = { date: recent[recent.length - 1].date };
  for (const name of Object.keys(FIELDS)) {
    const vals = recent.map((e) => e[name]).filter((v) => v != null);
    if (!vals.length) { avgDay[name] = null; continue; }
    if (name === 'bedtimeMinutes') {
      // Bedtime is circular. A user alternating 23:30 and 00:30 has a raw
      // clock mean of NOON, which bedtimeScore reads as "not late at all" —
      // it scored that user's timing 100 instead of ~46, and told them going
      // to bed 45 minutes EARLIER would cost 4.3 points. Average on the
      // wrapped scale (post-midnight values shifted +1440) and wrap back.
      const wrapped = vals.map((t) => (t < 720 ? t + 1440 : t));
      avgDay[name] = Math.round(wrapped.reduce((a, b) => a + b, 0) / wrapped.length) % 1440;
    } else {
      avgDay[name] = vals.reduce((a, b) => a + b, 0) / vals.length;
    }
  }

  const baselineScore = scoreDay(avgDay, ctx);
  const modified = { ...avgDay };
  for (const [field, delta] of Object.entries(changes)) {
    const f = FIELDS[field];
    if (!f) continue;
    // A field the user has never logged stays null on BOTH sides of the
    // comparison. Substituting the form default here (as an earlier version
    // did) conjured a brand-new scoring component into the projected day only,
    // so the reported delta conflated the nudge with silently starting to log
    // the field — inflating 'add 8 g of fiber' to three times its honest value
    // for users who never track fiber.
    if (modified[field] == null) continue;
    if (field === 'bedtimeMinutes') {
      const wrapped = modified[field] < 720 ? modified[field] + 1440 : modified[field];
      modified[field] = ((clamp(wrapped + delta, 720, 720 + 1439) % 1440) + 1440) % 1440;
    } else {
      modified[field] = clamp(modified[field] + delta, f.min, f.max);
    }
  }
  const projectedScore = scoreDay(modified, ctx);

  const baseBio = bioAgeDelta(baselineScore.score, ctx);
  const projBio = bioAgeDelta(projectedScore.score, ctx);

  return {
    baseline: baselineScore,
    projected: projectedScore,
    scoreDelta: round1((projectedScore.score ?? 0) - (baselineScore.score ?? 0)),
    yearsDelta: baseBio && projBio ? Math.round((projBio.years - baseBio.years) * 10) / 10 : null,
    pillarDeltas: Object.fromEntries(
      Object.keys(PILLAR_WEIGHTS).map((k) => [
        k,
        round1((projectedScore.pillars[k].score ?? 0) - (baselineScore.pillars[k].score ?? 0)),
      ])
    ),
  };
}

/**
 * Rank the highest-leverage single changes available to this user, by actually
 * running the simulator over a grid of candidate nudges. Brute force beats
 * hand-written heuristics here and stays correct when curves are retuned.
 */
export function topLeverage(entries, ctx = {}, limit = 5) {
  const candidates = [
    { field: 'sleepHours', delta: 0.5, label: 'Sleep 30 min longer' },
    { field: 'sleepHours', delta: 1.0, label: 'Sleep 1 hour longer' },
    { field: 'bedtimeMinutes', delta: -45, label: 'Go to bed 45 min earlier' },
    { field: 'steps', delta: 2000, label: 'Walk 2,000 more steps' },
    { field: 'steps', delta: 4000, label: 'Walk 4,000 more steps' },
    { field: 'exerciseMinutes', delta: 20, label: 'Add 20 min of training' },
    { field: 'strengthSession', delta: 1, label: 'Add a strength session' },
    { field: 'proteinGrams', delta: 30, label: 'Eat 30 g more protein' },
    { field: 'produceServings', delta: 2, label: 'Add 2 servings of fruit/veg' },
    { field: 'ultraProcessed', delta: -2, label: 'Cut 2 ultra-processed servings' },
    { field: 'fiberGrams', delta: 8, label: 'Add 8 g of fiber' },
    { field: 'alcoholUnits', delta: -1, label: 'Drink one fewer unit' },
    { field: 'alcoholUnits', delta: -2, label: 'Drink two fewer units' },
    { field: 'caffeineAfter2pm', delta: -100, label: 'Cut afternoon caffeine' },
    { field: 'sunlightMinutes', delta: 20, label: 'Get 20 more min of daylight' },
    { field: 'hydrationLitres', delta: 0.5, label: 'Drink 500 ml more water' },
    { field: 'socialMinutes', delta: 45, label: 'Add 45 min of social contact' },
  ];

  const results = [];
  for (const c of candidates) {
    const sim = simulate(entries, { [c.field]: c.delta }, ctx);
    if (!sim || sim.scoreDelta <= 0.05) continue;
    results.push({
      ...c,
      scoreDelta: sim.scoreDelta,
      yearsDelta: sim.yearsDelta,
      pillar: Object.entries(sim.pillarDeltas).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0][0],
    });
  }

  // Keep only the strongest nudge per field so the list isn't three flavours
  // of "sleep more".
  const seen = new Set();
  return results
    .sort((a, b) => b.scoreDelta - a.scoreDelta)
    .filter((r) => (seen.has(r.field) ? false : (seen.add(r.field), true)))
    .slice(0, limit);
}
