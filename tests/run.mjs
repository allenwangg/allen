import { readFileSync } from 'node:fs';
/**
 * Dependency-free test runner. `node tests/run.mjs`
 * Covers the two things that must not break: scoring monotonicity and the
 * statistical honesty of the insight engine.
 */
import { emptyEntry, addDays, validateEntry, dateKey, daysBetween, completeness, validateSymptoms, validateSymptomRatings, symptomId, SEVERITY_MAX, validateFactors, validateFactorAmounts, AMOUNT_MAX } from '../app/js/model.js';
import { FIELDS } from '../app/js/model.js';
const FIELDS_KEYS = new Set(Object.keys(FIELDS));
import { curve, scoreDay, buildReport, simulate, topLeverage, weightedMean, ewma, currentStreak, sleepRegularity } from '../app/js/engine.js';
import { checkFlags, checkNotesForCrisis, RULES as SAFETY_RULES, SNOOZE_DAYS } from '../app/js/safety.js';
import { createTrial, verdict, analyze, adherence, armForDate, trialDays, schedule, floorP, isComplete, daysRemaining, LEVERS, leversFor, factorLever, leverForDriver, MIN_PAIRS as TRIAL_MIN_PAIRS } from '../app/js/experiments.js';
import { rank, spearman, pearson, benjaminiHochberg, permutationP, discover, correlationCI, MIN_INFORMATIVE, attainableR, MIN_REPORTABLE_R, weekdayEffect, weekdayEffects, loggingBias, loggingBiasChecks, detrend, conditionalDetrend, linearFit, studentTTwoSided, betai, phrase, weekdayFit, conditionalDeseasonalize, effectiveN, lag1Autocorr, effectSize, sensitivityNote, detectionChance, daysForChance, chancePhrase, POWER_CURVE, labelFor, isLowerBetter } from '../app/js/insights.js';

let pass = 0, fail = 0;
const failures = [];

function t(name, fn) {
  try { fn(); pass++; process.stdout.write('.'); }
  catch (e) { fail++; failures.push([name, e.message]); process.stdout.write('F'); }
}
function eq(a, b, msg = '') {
  if (a !== b) throw new Error(`${msg} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}
function near(a, b, tol = 1e-6, msg = '') {
  if (a == null || Math.abs(a - b) > tol) throw new Error(`${msg} expected ~${b}, got ${a}`);
}
function ok(v, msg = 'expected truthy') { if (!v) throw new Error(msg); }

/* -------- deterministic PRNG so failures are reproducible -------- */
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(rnd) {
  const u = Math.max(1e-9, rnd()), v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/* ================= model ================= */
t('dateKey/addDays cross month', () => eq(addDays('2026-01-31', 1), '2026-02-01'));
t('addDays leap year', () => eq(addDays('2028-02-28', 1), '2028-02-29'));
t('addDays negative', () => eq(addDays('2026-03-01', -1), '2026-02-28'));
t('daysBetween', () => eq(daysBetween('2026-01-01', '2026-03-01'), 59));
t('daysBetween across DST', () => eq(daysBetween('2026-03-01', '2026-04-01'), 31));
t('validateEntry clamps', () => {
  const { entry, errors } = validateEntry({ date: '2026-01-01', sleepHours: 99 });
  eq(entry.sleepHours, 16); ok(errors.some((e) => e.includes('clamped')));
});
t('validateEntry rejects bad date', () => eq(validateEntry({ date: 'nope' }).entry, null));
t('validateEntry keeps optional null', () => eq(validateEntry({ date: '2026-01-01', hrv: '' }).entry.hrv, null));
t('validateEntry survives garbage', () => {
  const { entry } = validateEntry({ date: '2026-01-01', steps: 'banana' });
  eq(entry.steps, 6000);
});
t('completeness full on default entry', () => eq(completeness(emptyEntry()), 1));

/* ================= symptoms ================= */
t('validateSymptoms dedupes, trims, and elects one primary', () => {
  const out = validateSymptoms([
    { label: 'Migraine' }, { label: 'Bloating' }, { label: '   ' },
    { label: 'Migraine' }, { label: 'x'.repeat(200) },
  ]);
  eq(out.length, 4, 'labels are no longer deduped by slug; only blanks are dropped');
  ok(/^s_[a-z0-9]+$/.test(out[0].id), 'ids are opaque, not slugs');
  eq(new Set(out.map((x) => x.id)).size, out.length, 'ids must be distinct');
  eq(out.filter((x) => x.primary).length, 1, 'exactly one primary');
  ok(out[2].label.length <= 60, 'labels are bounded');
});
t('validateSymptoms caps the list', () => {
  const many = Array.from({ length: 40 }, (_, i) => ({ label: 'sym' + i }));
  ok(validateSymptoms(many).length <= 12);
});
t('two differently-written symptoms never merge', () => {
  // A label-derived id merged "Joint pain (knee)" and "joint-pain-knee" into
  // one series and silently dropped the second symptom.
  const out = validateSymptoms([{ label: 'Joint pain (knee)' }, { label: 'joint-pain-knee' }]);
  eq(out.length, 2);
  ok(out[0].id !== out[1].id);
});
t('a hostile import cannot write arbitrary keys into an entry', () => {
  const junk = Object.fromEntries(Array.from({ length: 50 }, (_, i) => ['s_junk' + i, 3])
    .concat([['__proto__', 1], ['not a valid id', 2], ['s_ok', 9]]));
  const { entry } = validateEntry({ date: '2026-01-01', symptoms: junk });
  ok(Object.keys(entry.symptoms).length <= 12, 'must be capped');
  for (const k of Object.keys(entry.symptoms)) ok(/^s_[a-z0-9-]{1,32}$/.test(k), 'bad id kept: ' + k);
  ok(Object.values(entry.symptoms).every((v) => v >= 0 && v <= SEVERITY_MAX), 'ratings clamped');
});
t('symptom ratings are clamped and unknown ids dropped', () => {
  const syms = validateSymptoms([{ label: 'Migraine' }]);
  const id = syms[0].id;
  const r = validateSymptomRatings({ [id]: 99, s_nope: 2, junk: 'x' }, syms);
  eq(r[id], SEVERITY_MAX);
  eq(r.s_nope, undefined);
});
t('a logged day defaults its symptoms to none, not to missing', () => {
  // "I logged today and didn't mark the migraine" means I didn't have one.
  // Leaving it absent would build a series made only of bad days, which
  // correlates with nothing.
  const syms = validateSymptoms([{ label: 'Migraine' }]);
  eq(emptyEntry('2026-01-01', syms).symptoms[syms[0].id], 0);
});
t('symptoms survive the validateEntry round-trip', () => {
  const syms = validateSymptoms([{ label: 'Migraine' }]);
  const { entry } = validateEntry({ date: '2026-01-01', symptoms: { [syms[0].id]: 3 } }, syms);
  eq(entry.symptoms[syms[0].id], 3);
});

t('SYMPTOMS: a real driver is found and noise symptoms stay silent', () => {
  // Sampled across many datasets, not one seed. The single-seed version of
  // this test passed while the engine was leaking fabricated findings on
  // 3-4 of every 40 noise datasets, which is exactly the failure a one-seed
  // test cannot see.
  const syms = validateSymptoms([{ label: 'A' }, { label: 'B' }, { label: 'C' }]);
  const ids = syms.map((x) => x.id);
  const primary = ids[0];
  const build = (seed, plant) => {
    const es = synth(150, seed, (e, i, r) => {
      e.sleepHours = 6 + r() * 2.5;
      e.steps = Math.round(3000 + r() * 8000);
      e.exerciseMinutes = Math.round(r() * 60);
      e.proteinGrams = Math.round(70 + r() * 60);
      e.produceServings = Math.round(r() * 6);
      e.ultraProcessed = Math.round(r() * 6);
      e.fiberGrams = Math.round(12 + r() * 20);
      e.alcoholUnits = Math.round(r() * 4);
      e.caffeineAfter2pm = Math.round(r() * 4) * 50;
      e.sunlightMinutes = Math.round(r() * 70);
      e.stress = 1 + Math.floor(r() * 5);
      e.mood = 1 + Math.floor(r() * 5);
      e.energy = 1 + Math.floor(r() * 5);
      e.sleepQuality = 1 + Math.floor(r() * 5);
      e.symptoms = {};
      for (const id of ids) e.symptoms[id] = r() < 0.25 ? 1 + Math.floor(r() * 4) : 0;
    });
    if (plant) {
      const rn = mulberry32(seed * 7 + 3);
      for (let i = 1; i < es.length; i++) {
        es[i].symptoms[primary] = Math.max(0, Math.min(4,
          Math.round(es[i - 1].alcoholUnits * plant + (rn() - 0.5) * 1.6)));
      }
    }
    return es;
  };

  let hits = 0, leaks = 0;
  const T = 15;
  for (let s = 0; s < T; s++) {
    const found = discover(build(70000 + s, 0.5), { symptoms: syms }).findings;
    if (found.some((f) => f.outcome === primary && f.driver === 'alcoholUnits')) hits++;
    const noise = discover(build(80000 + s, 0), { symptoms: syms }).findings;
    if (noise.some((f) => f.outcome.startsWith('s_'))) leaks++;
  }
  console.log(`\n  [symptoms] planted driver found ${hits}/${T}; noise datasets leaking ${leaks}/${T}`);
  ok(hits / T >= 0.8, `recall too low: ${hits}/${T}`);
  ok(leaks === 0, `fabricated symptom findings on noise: ${leaks}/${T}`);
});

t('ONE correction covers everything the user is shown', () => {
  // Reverted from a per-symptom split. Each family having its own 10% error
  // budget meant the user saw the union of six budgets, and the engine leaked
  // fabricated findings on noise; measurement showed the split bought no
  // recall in exchange. Groups survive for reporting only.
  const syms = validateSymptoms([{ label: 'A' }, { label: 'B' }, { label: 'C' }]);
  const ids = syms.map((x) => x.id);
  const es = synth(120, 12, (e, i, r) => {
    e.sleepHours = 6 + r() * 2.5;
    e.steps = Math.round(3000 + r() * 8000);
    e.alcoholUnits = Math.round(r() * 4);
    e.mood = 1 + Math.floor(r() * 5);
    e.symptoms = {};
    for (const id of ids) e.symptoms[id] = Math.floor(r() * 3);
  });
  const res = discover(es, { symptoms: syms });
  eq(res.families.filter((f) => f.kind === 'symptom').length, 3, 'one reporting group per symptom');
  eq(res.families.reduce((a, f) => a + f.tested, 0), res.tested, 'groups partition the grid exactly');
});

/* ================= curves ================= */
t('curve exact node', () => near(curve([[0, 0], [10, 100]], 10), 100));
t('curve interpolates', () => near(curve([[0, 0], [10, 100]], 5), 50));
t('curve flat below', () => near(curve([[2, 40], [10, 100]], 0), 40));
t('curve flat above', () => near(curve([[2, 40], [10, 100]], 99), 100));
t('curve null input', () => eq(curve([[0, 0], [10, 100]], null), null));
t('sleep curve is U-shaped', () => {
  const s7 = curve([[0,0],[4,20],[5.5,45],[6.5,75],[7,92],[7.5,100],[8.5,100],[9,88],[10,62],[12,30],[16,15]], 7.5);
  const s12 = curve([[0,0],[4,20],[5.5,45],[6.5,75],[7,92],[7.5,100],[8.5,100],[9,88],[10,62],[12,30],[16,15]], 12);
  const s4 = curve([[0,0],[4,20],[5.5,45],[6.5,75],[7,92],[7.5,100],[8.5,100],[9,88],[10,62],[12,30],[16,15]], 4);
  ok(s7 > s12 && s7 > s4, 'optimum must beat both extremes');
});
t('weightedMean ignores nulls', () => near(weightedMean([{score:100,weight:1},{score:null,weight:9}]), 100));
t('weightedMean all-null is null', () => eq(weightedMean([{score:null,weight:1}]), null));

/* ================= scoring ================= */
const ctx = { age: 40, weightKg: 80 };
t('perfect day scores high', () => {
  const e = emptyEntry('2026-01-01');
  Object.assign(e, { sleepHours: 8, sleepQuality: 5, bedtimeMinutes: 1330, steps: 12000,
    exerciseMinutes: 50, exerciseIntensity: 2, strengthSession: 1, proteinGrams: 130,
    produceServings: 8, ultraProcessed: 0, fiberGrams: 35, hydrationLitres: 2.75,
    alcoholUnits: 0, nicotine: 0, caffeineAfter2pm: 0, stress: 1, mood: 5, energy: 5,
    sunlightMinutes: 60, socialMinutes: 180 });
  ok(scoreDay(e, ctx).score > 92, 'got ' + scoreDay(e, ctx).score);
});
t('terrible day scores low', () => {
  const e = emptyEntry('2026-01-01');
  Object.assign(e, { sleepHours: 4, sleepQuality: 1, bedtimeMinutes: 200, steps: 800,
    exerciseMinutes: 0, exerciseIntensity: 0, strengthSession: 0, proteinGrams: 30,
    produceServings: 0, ultraProcessed: 9, fiberGrams: 3, hydrationLitres: 0.4,
    alcoholUnits: 7, nicotine: 1, caffeineAfter2pm: 400, stress: 5, mood: 1, energy: 1,
    sunlightMinutes: 0, socialMinutes: 0 });
  ok(scoreDay(e, ctx).score < 20, 'got ' + scoreDay(e, ctx).score);
});
t('score bounded 0..100 over random fuzz', () => {
  const rnd = mulberry32(7);
  for (let i = 0; i < 4000; i++) {
    const e = emptyEntry('2026-01-01');
    for (const k of Object.keys(e)) {
      if (typeof e[k] === 'number' && k !== 'createdAt' && k !== 'updatedAt' && k !== 'v') {
        e[k] = rnd() * 400 - 50;   // deliberately out of range
      }
    }
    const s = scoreDay(e, ctx).score;
    ok(s === null || (s >= 0 && s <= 100), `score out of bounds: ${s}`);
  }
});
t('more sleep monotonic up to optimum', () => {
  const mk = (h) => { const e = emptyEntry('2026-01-01'); e.sleepHours = h; return scoreDay(e, ctx).score; };
  ok(mk(5) < mk(6) && mk(6) < mk(7) && mk(7) <= mk(7.5), 'sleep must improve toward optimum');
});
t('alcohol strictly hurts', () => {
  const mk = (a) => { const e = emptyEntry('2026-01-01'); e.alcoholUnits = a; return scoreDay(e, ctx).score; };
  ok(mk(0) > mk(2) && mk(2) > mk(5));
});
t('pillar weights sum to 1', () => {
  const e = emptyEntry('2026-01-01');
  const total = Object.values(scoreDay(e, ctx).pillars).reduce((a, p) => a + p.weight, 0);
  near(total, 1, 1e-9);
});
t('missing biomarkers do not zero metabolic', () => {
  const e = emptyEntry('2026-01-01');
  eq(scoreDay(e, ctx).pillars.metabolic.score, null);
  ok(scoreDay(e, ctx).score > 0, 'composite must still compute');
});
t('protein scales with bodyweight', () => {
  const e = emptyEntry('2026-01-01'); e.proteinGrams = 100; e.bodyweightKg = null;
  const light = scoreDay(e, { age: 40, weightKg: 55 }).pillars.nutrition.score;
  const heavy = scoreDay(e, { age: 40, weightKg: 110 }).pillars.nutrition.score;
  ok(light > heavy, 'same grams should score better for a lighter person');
});
t('bedtime wraps past midnight', () => {
  const mk = (b) => { const e = emptyEntry('2026-01-01'); e.bedtimeMinutes = b; return scoreDay(e, ctx).pillars.sleep.score; };
  ok(mk(1320) > mk(90), '22:00 must beat 01:30');
});

/* ================= aggregates ================= */
t('ewma smooths and tracks', () => {
  const out = ewma([50, 50, 50, 90, 90, 90, 90, 90, 90, 90, 90, 90, 90, 90], 3);
  ok(out[3] > 50 && out[3] < 90 && out[13] > 85);
});
t('ewma tolerates nulls', () => { const out = ewma([50, null, 60], 3); ok(out[1] != null); });
t('streak counts consecutive', () => {
  const es = ['2026-01-01','2026-01-02','2026-01-03'].map(emptyEntry);
  eq(currentStreak(es), 3);
});
t('streak breaks on gap', () => {
  const es = ['2026-01-01','2026-01-05','2026-01-06'].map(emptyEntry);
  eq(currentStreak(es), 2);
});
t('streak of empty is 0', () => eq(currentStreak([]), 0));
t('regularity needs 4 nights', () => eq(sleepRegularity([emptyEntry('2026-01-01')]), null));
t('regularity rewards consistency', () => {
  const steady = [0,1,2,3,4,5].map((i) => { const e = emptyEntry(addDays('2026-01-01', i)); e.bedtimeMinutes = 1350; return e; });
  const chaotic = [0,1,2,3,4,5].map((i) => { const e = emptyEntry(addDays('2026-01-01', i)); e.bedtimeMinutes = i % 2 ? 1200 : 120; return e; });
  ok(sleepRegularity(steady).score > sleepRegularity(chaotic).score);
});

/* ================= bio age ================= */
t('simulate scores boolean frequency, not truthiness', () => {
  const es = Array.from({ length: 28 }, (_, i) => {
    const e = emptyEntry(addDays('2026-06-01', i));
    e.nicotine = i === 0 ? 1 : 0;
    e.strengthSession = i === 0 ? 1 : 0;
    return e;
  });
  const sim = simulate(es, {}, ctx);
  const nic = sim.baseline.pillars.substances.parts.find((p) => p.key === 'nicotine').score;
  const str = sim.baseline.pillars.movement.parts.find((p) => p.key === 'strength').score;
  ok(nic > 90, 'one smoking day in 28 must not baseline as a daily smoker, got ' + nic);
  ok(str < 45, 'one session in 28 must not baseline as daily training, got ' + str);
});
t('simulate never materializes a never-logged field', () => {
  const es = Array.from({ length: 28 }, (_, i) => {
    const e = emptyEntry(addDays('2026-06-01', i));
    e.fiberGrams = null;
    return e;
  });
  const sim = simulate(es, { fiberGrams: 8 }, ctx);
  near(sim.scoreDelta, 0, 0.001, 'nudging an unlogged field must be a no-op');
});

/* ================= statistics ================= */
t('rank averages ties', () => { const r = rank([10, 20, 20, 30]); near(r[1], 2.5); near(r[2], 2.5); });
t('rank ascending', () => { const r = rank([5, 1, 3]); eq(r[0], 3); eq(r[1], 1); eq(r[2], 2); });
t('pearson perfect', () => near(pearson([1,2,3,4],[2,4,6,8]), 1, 1e-9));
t('pearson inverse', () => near(pearson([1,2,3,4],[8,6,4,2]), -1, 1e-9));
t('pearson zero variance => null', () => eq(pearson([1,1,1,1],[1,2,3,4]), null));
t('spearman catches monotone nonlinear', () => near(spearman([1,2,3,4],[1,4,9,16]), 1, 1e-9));
t('CI brackets r', () => { const [lo, hi] = correlationCI(0.5, 40); ok(lo < 0.5 && hi > 0.5); });
t('CI narrows with n', () => {
  const w = correlationCI(0.5, 20), n = correlationCI(0.5, 200);
  ok((n[1] - n[0]) < (w[1] - w[0]));
});
t('BH controls: uniform p-values yield few passes', () => {
  const rnd = mulberry32(99);
  const ps = Array.from({ length: 300 }, () => rnd());
  eq(benjaminiHochberg(ps, 0.1).passing.size <= 5, true);
});
t('BH passes obvious signal', () => {
  const ps = [1e-9, 1e-8, 1e-7, ...Array.from({ length: 50 }, (_, i) => 0.4 + i * 0.01)];
  ok(benjaminiHochberg(ps, 0.1).passing.size >= 3);
});
t('BH adjusted p is monotone non-decreasing in raw p', () => {
  const ps = [0.001, 0.01, 0.02, 0.3, 0.5, 0.9];
  const { adjusted } = benjaminiHochberg(ps, 0.1);
  for (let i = 1; i < ps.length; i++) ok(adjusted[i] >= adjusted[i - 1] - 1e-12);
});
t('permutation p high for noise', () => {
  const rnd = mulberry32(3);
  const xs = Array.from({ length: 60 }, () => gauss(rnd));
  const ys = Array.from({ length: 60 }, () => gauss(rnd));
  ok(permutationP(xs, ys, spearman(xs, ys)) > 0.05);
});
t('permutation p low for strong signal', () => {
  const rnd = mulberry32(4);
  const xs = Array.from({ length: 60 }, () => gauss(rnd));
  const ys = xs.map((x) => x * 2 + gauss(rnd) * 0.3);
  ok(permutationP(xs, ys, spearman(xs, ys)) < 0.02);
});

t('effectiveN shrinks with autocorrelation, not without', () => {
  const rnd = mulberry32(5150);
  const iidA = Array.from({ length: 120 }, () => gauss(rnd));
  const iidB = Array.from({ length: 120 }, () => gauss(rnd));
  ok(effectiveN(iidA, iidB) > 90, 'iid pairs must keep most of their sample size');
  const ar = [gauss(rnd)], ar2 = [gauss(rnd)];
  for (let i = 1; i < 120; i++) {
    ar.push(0.8 * ar[i - 1] + 0.6 * gauss(rnd));
    ar2.push(0.8 * ar2[i - 1] + 0.6 * gauss(rnd));
  }
  ok(effectiveN(ar, ar2) < 70, 'smooth pairs must lose effective sample size');
});
t('lag1Autocorr basics', () => {
  near(lag1Autocorr([1, 1, 1, 1]), 0, 1e-9, 'constant series');
  ok(lag1Autocorr([1, 2, 3, 4, 5, 6, 7, 8]) > 0.5, 'ramp is autocorrelated');
});

t('permutationP is calibrated on autocorrelated noise', () => {
  // docs/INSIGHTS.md publishes an AR(1) calibration row; this is the test
  // behind it, so "run npm test to reproduce every number" stays true.
  const ar1 = (n, phi, rnd) => {
    const out = [gauss(rnd)];
    for (let i = 1; i < n; i++) out.push(phi * out[i - 1] + gauss(rnd) * Math.sqrt(1 - phi * phi));
    return out;
  };
  for (const phi of [0, 0.5, 0.8]) {
    const T = 120, ps = [];
    for (let s = 0; s < T; s++) {
      const rnd = mulberry32(50000 + s * 7 + Math.round(phi * 100));
      const xs = ar1(120, phi, rnd), ys = ar1(120, phi, rnd);
      ps.push(permutationP(xs, ys, spearman(xs, ys)));
    }
    const at01 = ps.filter((p) => p <= 0.01).length / T;
    const at05 = ps.filter((p) => p <= 0.05).length / T;
    ok(at01 <= 0.05, `phi=${phi}: P(p<=.01)=${at01} should be near 0.01`);
    ok(at05 <= 0.12, `phi=${phi}: P(p<=.05)=${at05} should be near 0.05`);
  }
});
t('CI coverage is restored by the effective-n correction', () => {
  // Backs the 78.8% -> 96.2% figures quoted in docs/INSIGHTS.md Guard 6.
  const T = 200, n = 120, phi = 0.7, rho = 0.4;
  const rhoS = (6 / Math.PI) * Math.asin(rho / 2);
  let coverNominal = 0, coverEffective = 0;
  for (let s = 0; s < T; s++) {
    const rnd = mulberry32(70000 + s);
    const shared = [gauss(rnd)], ex = [gauss(rnd)], ey = [gauss(rnd)];
    for (let i = 1; i < n; i++) {
      shared.push(phi * shared[i - 1] + gauss(rnd) * Math.sqrt(1 - phi * phi));
      ex.push(phi * ex[i - 1] + gauss(rnd) * Math.sqrt(1 - phi * phi));
      ey.push(phi * ey[i - 1] + gauss(rnd) * Math.sqrt(1 - phi * phi));
    }
    const a = Math.sqrt(rho), c = Math.sqrt(1 - rho);
    const xs = shared.map((v, i) => a * v + c * ex[i]);
    const ys = shared.map((v, i) => a * v + c * ey[i]);
    const r = spearman(xs, ys);
    const ciN = correlationCI(r, n);
    const ciE = correlationCI(r, effectiveN(xs, ys));
    if (ciN && rhoS >= ciN[0] && rhoS <= ciN[1]) coverNominal++;
    if (ciE && rhoS >= ciE[0] && rhoS <= ciE[1]) coverEffective++;
  }
  const nom = coverNominal / T, eff = coverEffective / T;
  console.log(`\n  [ci-coverage] nominal-n ${(nom * 100).toFixed(1)}% -> effective-n ${(eff * 100).toFixed(1)}% (target 95%)`);
  ok(nom < 0.9, 'setup check: the nominal-n interval should under-cover on autocorrelated data');
  ok(eff >= 0.9, `effective-n coverage too low: ${eff}`);
});
t('waist is actually scored when height is known', () => {
  // The Pro copy sells "waist folded into your score"; this asserts the code
  // backs that sentence rather than merely storing the number.
  const mk = (w) => { const e = emptyEntry('2026-01-01'); e.restingHR = 60; e.hrv = 45; e.waistCm = w; return e; };
  const c = { age: 40, weightKg: 80, heightCm: 178 };
  ok(scoreDay(mk(80), c).pillars.metabolic.score > scoreDay(mk(110), c).pillars.metabolic.score,
     'a smaller waist must score better');
  const noHeight = { age: 40, weightKg: 80 };
  eq(scoreDay(mk(80), noHeight).pillars.metabolic.score, scoreDay(mk(110), noHeight).pillars.metabolic.score,
     'without height there is no ratio, so waist must be ignored rather than guessed');
});

/* ================= insight engine: the honesty tests ================= */
function synth(n, seed, fn) {
  const rnd = mulberry32(seed);
  const out = [];
  let d = '2026-01-01';
  for (let i = 0; i < n; i++) {
    const e = emptyEntry(d);
    fn(e, i, rnd);
    out.push(e);
    d = addDays(d, 1);
  }
  return out;
}

t('refuses to report below MIN_PAIRS', () => {
  const es = synth(10, 1, (e, i, r) => { e.sleepHours = 6 + r() * 3; e.mood = 1 + Math.floor(r() * 5); });
  eq(discover(es).status, 'insufficient-data');
});

t('FALSE POSITIVE RATE on pure noise stays at/below target', () => {
  // The single most important test in the suite. 40 independent noise datasets;
  // if the engine hallucinates findings here, the product is a liability.
  let datasetsWithFindings = 0;
  const trials = 40;
  for (let s = 0; s < trials; s++) {
    const es = synth(90, 1000 + s, (e, i, r) => {
      e.sleepHours = 5.5 + r() * 3.5;
      e.steps = Math.round(2000 + r() * 10000);
      e.exerciseMinutes = Math.round(r() * 70);
      e.proteinGrams = Math.round(60 + r() * 90);
      e.produceServings = Math.round(r() * 7);
      e.ultraProcessed = Math.round(r() * 7);
      e.alcoholUnits = Math.round(r() * 4);
      e.sunlightMinutes = Math.round(r() * 70);
      e.hydrationLitres = Math.round((0.8 + r() * 2.5) * 4) / 4;
      e.caffeineAfter2pm = Math.round(r() * 5) * 50;
      e.mood = 1 + Math.floor(r() * 5);
      e.energy = 1 + Math.floor(r() * 5);
      e.stress = 1 + Math.floor(r() * 5);
      e.sleepQuality = 1 + Math.floor(r() * 5);
      e.restingHR = Math.round(55 + r() * 20);
      e.hrv = Math.round(25 + r() * 45);
    });
    if (discover(es).findings.length > 0) datasetsWithFindings++;
  }
  const rate = datasetsWithFindings / trials;
  console.log(`\n  [noise] ${datasetsWithFindings}/${trials} noise datasets produced any finding (${(rate * 100).toFixed(0)}%)`);
  ok(rate <= 0.05, `false-positive rate too high: ${rate}`);
});

t('RECOVERS a planted effect', () => {
  // Alcohol on day d suppresses energy on day d+1. Buried in realistic noise.
  const es = synth(120, 42, (e, i, r) => {
    e.sleepHours = 6.4 + r() * 2.2;
    e.steps = Math.round(3000 + r() * 8000);
    e.exerciseMinutes = Math.round(r() * 60);
    e.proteinGrams = Math.round(70 + r() * 70);
    e.produceServings = Math.round(r() * 6);
    e.ultraProcessed = Math.round(r() * 6);
    e.sunlightMinutes = Math.round(r() * 60);
    e.alcoholUnits = Math.round(r() * 5);
    e.mood = 1 + Math.floor(r() * 5);
    e.stress = 1 + Math.floor(r() * 5);
    e.sleepQuality = 1 + Math.floor(r() * 5);
  });
  for (let i = 1; i < es.length; i++) {
    const drinks = es[i - 1].alcoholUnits;
    es[i].energy = Math.max(1, Math.min(5, Math.round(4.6 - drinks * 0.62 + (mulberry32(i * 7)() - 0.5) * 1.1)));
  }
  es[0].energy = 3;
  const res = discover(es);
  const hit = res.findings.find((f) => f.driver === 'alcoholUnits' && f.outcome === 'energy');
  console.log(`\n  [signal] tested ${res.tested} hypotheses, ${res.findings.length} survived FDR; planted effect ${hit ? 'FOUND r=' + hit.r + ' lag=' + hit.lag + ' p_adj=' + hit.pAdjusted : 'MISSED'}`);
  ok(hit, 'planted alcohol->next-day-energy effect was not recovered');
  ok(hit.r < 0, 'direction must be negative');
  ok(hit.lag === 1, 'should identify lag 1, got ' + hit.lag);
});

t('detrend removes a linear time trend', () => {
  const times = Array.from({ length: 50 }, (_, i) => i);
  const trended = times.map((t) => 10 + 0.5 * t);
  const out = detrend(trended, times);
  for (const v of out) near(v, 0, 1e-9, 'pure trend must detrend to zero');
});
t('detrend preserves residual structure', () => {
  // A least-squares line absorbs a small share of any finite alternating
  // signal (the alternation is not exactly orthogonal to time at finite n), so
  // the residual comes back near 3 rather than exactly 3. What matters is that
  // the structure survives essentially intact, not that it is untouched.
  const times = Array.from({ length: 50 }, (_, i) => i);
  const vals = times.map((t) => 10 + 0.5 * t + (t % 2 ? 3 : -3));
  const out = detrend(vals, times);
  for (const v of out) ok(Math.abs(Math.abs(v) - 3) < 0.35, 'alternating residual must survive, got ' + v);
  // and the sign pattern must be preserved exactly
  for (let i = 0; i < out.length; i++) ok((out[i] > 0) === (i % 2 === 1), 'sign pattern lost at ' + i);
});
t('detrend is a no-op on a flat-in-time series', () => {
  const times = Array.from({ length: 40 }, (_, i) => i);
  const vals = times.map((t) => (t % 3) - 1);
  const out = detrend(vals, times);
  const before = spearman(vals, vals.map((v, i) => v + (i % 5)));
  const after = spearman(out, detrend(vals.map((v, i) => v + (i % 5)), times));
  ok(Math.abs(before - after) < 0.12, 'untrended data should be barely affected');
});
t('detrend tolerates short input', () => { eq(detrend([1, 2], [0, 1]).length, 2); });
t('studentT matches known critical values', () => {
  near(studentTTwoSided(2.776, 4), 0.05, 1e-3);
  near(studentTTwoSided(2.228, 10), 0.05, 1e-3);
  near(studentTTwoSided(0, 10), 1, 1e-9);
});
t('betai is monotone', () => {
  let prev = -1;
  for (let x = 0; x <= 1; x += 0.05) { const v = betai(2, 3, x); ok(v >= prev - 1e-12); prev = v; }
});

t('DEFEATS spurious correlations from a shared time trend', () => {
  // The failure mode this guards against: someone starts a health kick, so
  // protein/fiber/produce all rise while resting HR falls, over months. Every
  // pair correlates strongly and every correlation is the calendar, not a
  // daily effect. Only the planted day-to-day effect should survive.
  const es = synth(120, 2024, (e, i, r) => {
    const p = i / 119;
    e.sleepHours = 6.2 + p * 1.0 + r() * 0.9;
    e.steps = Math.round(4200 + p * 3500 + r() * 4000);
    e.exerciseMinutes = (i % 2 === 0) ? Math.round(15 + p * 30 + r() * 20) : Math.round(r() * 10);
    e.proteinGrams = Math.round(78 + p * 45 + r() * 30);
    e.produceServings = Math.round(1.5 + p * 2.5 + r() * 2);
    e.ultraProcessed = Math.max(0, Math.round(4.5 - p * 2.5 + r() * 2));
    e.fiberGrams = Math.round(16 + p * 10 + r() * 10);
    e.alcoholUnits = Math.round(r() * 4);
    e.sunlightMinutes = Math.round(12 + p * 28 + r() * 30);
    e.stress = Math.max(1, Math.min(5, Math.round(3.6 - p * 0.9 + r() * 1.4)));
    e.mood = Math.max(1, Math.min(5, Math.round(2.9 + p * 1.1 + r() * 1.2)));
    e.sleepQuality = Math.max(1, Math.min(5, Math.round(2.4 + p * 1.4 + r() * 1.2)));
    e.restingHR = Math.round(66 - p * 6 + r() * 5);
    e.hrv = Math.round(36 + p * 14 + r() * 10);
    e.energy = 3;
  });
  const rn = mulberry32(777);
  for (let i = 1; i < es.length; i++) {
    es[i].energy = Math.max(1, Math.min(5, Math.round(4.5 - es[i - 1].alcoholUnits * 0.55 + (rn() - 0.5) * 1.8)));
  }

  const withTrend = discover(es, { detrend: false });
  const detrended = discover(es, { detrend: true });
  const real = (f) => f.driver === 'alcoholUnits' && f.outcome === 'energy';

  console.log(`\n  [confound] trend-confounded data: ${withTrend.findings.length} findings raw -> ${detrended.findings.length} after detrending`);

  ok(withTrend.findings.length >= 8, 'setup check: raw analysis should be flooded with spurious hits');
  ok(detrended.findings.some(real), 'the genuine day-to-day effect must survive detrending');
  ok(detrended.findings.length <= 3, `too many spurious findings survived: ${detrended.findings.length}`);
  const survivor = detrended.findings.find(real);
  ok(Math.abs(survivor.r) > 0.6, 'genuine effect should be barely attenuated, got r=' + survivor.r);
});

t('phrasing states the right verdict', () => {
  const es = synth(120, 42, (e, i, r) => {
    e.sleepHours = 6.4 + r() * 2.2; e.steps = Math.round(3000 + r() * 8000);
    e.alcoholUnits = Math.round(r() * 5); e.mood = 1 + Math.floor(r() * 5);
    e.stress = 1 + Math.floor(r() * 5); e.sleepQuality = 1 + Math.floor(r() * 5);
    e.proteinGrams = Math.round(70 + r() * 70); e.produceServings = Math.round(r() * 6);
  });
  for (let i = 1; i < es.length; i++) {
    es[i].energy = Math.max(1, Math.min(5, Math.round(4.6 - es[i-1].alcoholUnits * 0.62 + (mulberry32(i*7)() - 0.5) * 1.1)));
  }
  es[0].energy = 3;
  const hit = discover(es).findings.find((f) => f.driver === 'alcoholUnits' && f.outcome === 'energy');
  ok(hit.text.includes('costing you'), 'bad effect must be phrased as a cost: ' + hit.text);
});

t('never endorses a harmful habit for a beneficial-looking correlation', () => {
  // Weekend confound: drinking clusters on already-relaxed days, so alcohol
  // correlates with LOWER same-day stress. The pattern is shown, but the
  // verdict must caution about context rather than bless the drinking.
  const f = { driver: 'alcoholUnits', outcome: 'stress', lag: 0, r: -0.5, effect: 'large',
              practical: { delta: -0.7 } };
  const text = phrase(f);
  ok(!text.includes('working for you'), 'must not endorse alcohol: ' + text);
  ok(/care|context|those days/i.test(text), 'must carry a caution: ' + text);
});
t('still celebrates a beneficial correlation from a healthy driver', () => {
  const f = { driver: 'sleepHours', outcome: 'stress', lag: 0, r: -0.5, effect: 'large',
              practical: { delta: -0.7 } };
  ok(phrase(f).includes('working for you'), 'got: ' + phrase(f));
});

t('skips same-day self-report pairs', () => {
  const es = synth(90, 5, (e, i, r) => {
    const bad = r();
    e.mood = 1 + Math.floor(bad * 5); e.stress = 6 - e.mood; e.energy = e.mood;
    e.sleepHours = 6 + r() * 2; e.steps = Math.round(3000 + r() * 6000);
  });
  const res = discover(es);
  ok(!res.findings.some((f) => f.lag === 0 && ['mood','stress','energy','sleepQuality'].includes(f.driver)),
     'same-day self-report tautology leaked through');
});

t('flat series produce nothing', () => {
  const es = synth(90, 6, (e) => { e.sleepHours = 7; e.mood = 3; e.steps = 5000; e.energy = 3; });
  eq(discover(es).findings.length, 0);
});

t('gaps break pairs rather than interpolating', () => {
  const es = synth(60, 8, (e, i, r) => { e.alcoholUnits = Math.round(r()*4); e.energy = 1 + Math.floor(r()*5); });
  const gapped = es.filter((_, i) => i % 2 === 0);   // every other day missing
  const res = discover(gapped, { lags: [1] });
  ok(res.status === 'insufficient-data' || res.findings.length === 0, 'must not fabricate pairs across gaps');
});

t('conditionalDetrend leaves an untrended series alone', () => {
  const times = Array.from({ length: 60 }, (_, i) => i);
  // Mostly zeros with occasional spikes — the sparse shape that broke naive
  // detrending by turning tied zeros into a time-ordered ramp.
  const vals = times.map((t) => (t % 7 === 5 || t % 7 === 6 ? 3 : 0));
  const out = conditionalDetrend(vals, times);
  eq(out.detrended, false, 'a series with no time trend must not be detrended');
  eq(out.values.filter((v) => v === 0).length, vals.filter((v) => v === 0).length, 'ties must survive intact');
});
t('conditionalDetrend still removes a genuine trend', () => {
  const times = Array.from({ length: 60 }, (_, i) => i);
  const vals = times.map((t) => 10 + 0.6 * t);
  const out = conditionalDetrend(vals, times);
  eq(out.detrended, true);
  for (const v of out.values) near(v, 0, 1e-6);
});
t('linearFit reports explained variance', () => {
  const times = Array.from({ length: 40 }, (_, i) => i);
  near(linearFit(times.map((t) => 2 * t), times).r2, 1, 1e-9);
  ok(linearFit(times.map((t) => (t % 2 ? 1 : -1)), times).r2 < 0.05);
});
t('permutationP is deterministic across calls', () => {
  const rnd = mulberry32(1234);
  const xs = Array.from({ length: 60 }, () => gauss(rnd));
  const ys = xs.map((x) => x * 1.5 + gauss(rnd));
  const a = permutationP(xs, ys, spearman(xs, ys));
  const b = permutationP(xs, ys, spearman(xs, ys));
  eq(a, b, 'the same data must always give the same p-value');
});

t('reports NOTHING when every habit trends but none actually matters', () => {
  // This backs the "0 of 60" claim on the landing page: thirty datasets where
  // habits all improve together over four months, with no real day-to-day
  // relationship anywhere. Naive analysis finds a dozen "insights" in data like
  // this; the correct answer is silence.
  let datasetsWithFindings = 0;
  const trials = 30;
  for (let s = 0; s < trials; s++) {
    const es = synth(120, 7000 + s, (e, i, r) => {
      const p = i / 119;
      e.sleepHours = 6.2 + p * 1.0 + r() * 0.9;
      e.steps = Math.round(4200 + p * 3500 + r() * 4000);
      e.exerciseMinutes = Math.round(r() * 60);
      e.proteinGrams = Math.round(78 + p * 45 + r() * 30);
      e.produceServings = Math.round(1.5 + p * 2.5 + r() * 2);
      e.ultraProcessed = Math.max(0, Math.round(4.5 - p * 2.5 + r() * 2));
      e.fiberGrams = Math.round(16 + p * 10 + r() * 10);
      e.hydrationLitres = Math.round((1.4 + p * 0.7 + r() * 0.9) * 4) / 4;
      e.sunlightMinutes = Math.round(12 + p * 28 + r() * 30);
      e.caffeineAfter2pm = r() < 0.35 ? Math.round(r() * 4) * 50 : 0;
      e.bedtimeMinutes = 1320 + Math.round(r() * 90);
      e.socialMinutes = Math.round(r() * 180);
      e.alcoholUnits = Math.round(r() * 4);
      e.stress = Math.max(1, Math.min(5, Math.round(3.6 - p * 0.9 + r() * 1.4)));
      e.mood = Math.max(1, Math.min(5, Math.round(2.9 + p * 1.1 + r() * 1.2)));
      e.sleepQuality = Math.max(1, Math.min(5, Math.round(2.4 + p * 1.4 + r() * 1.2)));
      e.restingHR = Math.round(66 - p * 6 + r() * 5);
      e.hrv = Math.round(36 + p * 14 + r() * 10);
      e.energy = 1 + Math.floor(r() * 5);       // deliberately unrelated to anything
    });
    if (discover(es).findings.length > 0) datasetsWithFindings++;
  }
  console.log(`\n  [trending] ${datasetsWithFindings}/${trials} all-habits-trending datasets produced any finding`);
  ok(datasetsWithFindings === 0, `expected silence, got findings in ${datasetsWithFindings} datasets`);
});

t('weekdayFit recovers planted group means', () => {
  const dows = Array.from({ length: 70 }, (_, i) => i % 7);
  const vals = dows.map((d) => 10 + d * 2);
  const fit = weekdayFit(vals, dows);
  near(fit.eta2, 1, 1e-9, 'pure weekday structure must explain everything');
  const uniq = new Set(fit.residuals.map((v) => Math.round(v * 1e6)));
  eq(uniq.size, 1, 'residuals of pure weekday structure must be constant');
});
t('conditionalDeseasonalize leaves structureless series alone', () => {
  const rnd = mulberry32(31337);
  const dows = Array.from({ length: 120 }, (_, i) => i % 7);
  const vals = dows.map(() => Math.floor(rnd() * 3));   // ties, no weekday link
  const out = conditionalDeseasonalize(vals, dows);
  eq(out.deseasonalized, false, 'no weekday structure -> untouched');
  eq(out.values.filter((v) => v === 0).length, vals.filter((v) => v === 0).length, 'ties preserved');
});
t('conditionalDeseasonalize removes a real weekday rhythm', () => {
  const rnd = mulberry32(99);
  const dows = Array.from({ length: 140 }, (_, i) => i % 7);
  const vals = dows.map((d) => (d === 0 || d === 6 ? 8 : 2) + rnd());
  const out = conditionalDeseasonalize(vals, dows);
  eq(out.deseasonalized, true);
  const fitAfter = weekdayFit(out.values, dows);
  ok(fitAfter.eta2 < 0.05, 'weekday share must be gone after removal, got ' + fitAfter.eta2);
});
t('permutationP p-value does not depend on the observed effect size (seed independence)', () => {
  // The surrogate seed must derive from the data alone. If it moved with the
  // observed correlation, p would be non-monotone in effect size.
  const rnd = mulberry32(777);
  const xs = Array.from({ length: 80 }, () => gauss(rnd));
  const ys = Array.from({ length: 80 }, () => gauss(rnd));
  const r = spearman(xs, ys);
  // Same data, two slightly different claimed "observed" values: the null
  // sample must be identical, so p must move monotonically with |observed|.
  const pWeak = permutationP(xs, ys, 0.30);
  const pStrong = permutationP(xs, ys, 0.45);
  ok(pStrong < pWeak, `p must decrease as |r| grows on the same null: ${pStrong} vs ${pWeak}`);
});

t('SILENT on independent weekly rhythms with no cross-effects', () => {
  // Habits that each follow their own day-of-week profile — busy Mondays, lazy
  // Sundays — correlate through the shared weekday without influencing each
  // other at all. Before conditional deseasonalization existed this scenario
  // produced ~12 confident findings per dataset, 20/20 datasets. The honest
  // answer is zero.
  let dsWith = 0, total = 0;
  const trials = 12;
  for (let s = 0; s < trials; s++) {
    const rp = mulberry32(90000 + s);
    const prof = {};
    for (const v of ['sleepHours','steps','proteinGrams','produceServings','ultraProcessed',
                     'alcoholUnits','sunlightMinutes','stress','mood','energy','sleepQuality','restingHR','hrv']) {
      prof[v] = Array.from({ length: 7 }, () => rp() - 0.5);
    }
    const es = synth(120, 91000 + s, (e, i, r) => {
      const parts = e.date.split('-');
      const dow = new Date(+parts[0], +parts[1] - 1, +parts[2]).getDay();
      const w = (v, amp) => prof[v][dow] * amp;
      e.sleepHours = 6.8 + w('sleepHours', 1.6) + r() * 0.8;
      e.steps = Math.round(6500 + w('steps', 5000) + r() * 2500);
      e.proteinGrams = Math.round(95 + w('proteinGrams', 50) + r() * 25);
      e.produceServings = Math.max(0, Math.round(3 + w('produceServings', 4) + r() * 1.5));
      e.ultraProcessed = Math.max(0, Math.round(3 + w('ultraProcessed', 4) + r() * 1.5));
      e.alcoholUnits = Math.max(0, Math.round(1 + w('alcoholUnits', 3) + r() * 1.5));
      e.sunlightMinutes = Math.max(0, Math.round(30 + w('sunlightMinutes', 40) + r() * 20));
      e.stress = Math.max(1, Math.min(5, Math.round(3 + w('stress', 2.4) + r() * 1.2)));
      e.mood = Math.max(1, Math.min(5, Math.round(3 + w('mood', 2.4) + r() * 1.2)));
      e.energy = Math.max(1, Math.min(5, Math.round(3 + w('energy', 2.4) + r() * 1.2)));
      e.sleepQuality = Math.max(1, Math.min(5, Math.round(3 + w('sleepQuality', 2.4) + r() * 1.2)));
      e.restingHR = Math.round(62 + w('restingHR', 6) + r() * 4);
      e.hrv = Math.round(45 + w('hrv', 14) + r() * 8);
    });
    const res = discover(es);
    total += res.findings.length;
    if (res.findings.length) dsWith++;
  }
  console.log(`\n  [weekday-confound] ${dsWith}/${trials} rhythm-only datasets produced any finding (${(total / trials).toFixed(1)}/ds)`);
  ok(dsWith === 0, `weekday-confounded findings leaked through in ${dsWith} datasets`);
});

t('RECOVERS an effect in weekly-clustered data', () => {
  // The realistic shape: drinking clusters at weekends, so the driver is zero
  // on most days and strongly periodic. Two separate mechanisms previously
  // destroyed this — naive detrending broke the tied zeros, and a null
  // estimated from only n-1 circular shifts was too unstable to clear
  // correction. Recall on this scenario went 47% -> 100%.
  let found = 0;
  const trials = 15;
  for (let s = 0; s < trials; s++) {
    const es = synth(120, 6000 + s, (e, i, r) => {
      const parts = e.date.split('-');
      const dow = new Date(+parts[0], +parts[1] - 1, +parts[2]).getDay();
      const weekend = dow === 0 || dow === 6;
      e.sleepHours = 6.2 + r() * 0.9;
      e.steps = Math.round(4200 + r() * 4000);
      e.exerciseMinutes = Math.round(r() * 60);
      e.proteinGrams = Math.round(78 + r() * 30);
      e.produceServings = Math.round(1.5 + r() * 2);
      e.ultraProcessed = Math.max(0, Math.round(4.5 + r() * 2));
      e.fiberGrams = Math.round(16 + r() * 10);
      e.sunlightMinutes = Math.round(12 + r() * 30);
      e.bedtimeMinutes = 1320 + Math.round(r() * 90);
      e.alcoholUnits = weekend ? Math.round(r() * 5) : (r() < 0.25 ? Math.round(r() * 2) : 0);
      e.stress = Math.max(1, Math.min(5, Math.round(3.6 + r() * 1.4)));
      e.mood = Math.max(1, Math.min(5, Math.round(2.9 + r() * 1.2)));
      e.sleepQuality = Math.max(1, Math.min(5, Math.round(2.4 + r() * 1.2)));
      e.restingHR = Math.round(66 + r() * 5);
      e.hrv = Math.round(36 + r() * 10);
      e.energy = 3;
    });
    const rn = mulberry32(s * 13 + 1);
    for (let i = 1; i < es.length; i++) {
      es[i].energy = Math.max(1, Math.min(5, Math.round(4.5 - es[i - 1].alcoholUnits * 0.55 + (rn() - 0.5) * 1.8)));
    }
    if (discover(es).findings.some((f) => f.driver === 'alcoholUnits' && f.outcome === 'energy')) found++;
  }
  console.log(`\n  [weekly] planted effect recovered in ${found}/${trials} weekend-clustered datasets`);
  ok(found / trials >= 0.85, `recall too low on weekly-clustered data: ${found}/${trials}`);
});

/* ================= report + simulator ================= */
const demo = synth(60, 21, (e, i, r) => {
  e.sleepHours = 6.5 + r(); e.steps = Math.round(5000 + r() * 4000);
  e.exerciseMinutes = Math.round(r() * 40); e.proteinGrams = Math.round(80 + r() * 40);
  e.produceServings = Math.round(1 + r() * 4); e.ultraProcessed = Math.round(r() * 5);
  e.alcoholUnits = Math.round(r() * 2); e.stress = 1 + Math.floor(r() * 5);
  e.mood = 1 + Math.floor(r() * 5); e.energy = 1 + Math.floor(r() * 5);
  e.restingHR = Math.round(58 + r() * 12); e.hrv = Math.round(30 + r() * 25);
});
t('buildReport populates every headline field', () => {
  const r = buildReport(demo, ctx);
  for (const k of ['today','avg7','avg28','sustained','pillarAverages','trendPerWeek','streak','loggedDays']) {
    ok(r[k] !== undefined && r[k] !== null, `missing ${k}`);
  }
});
t('buildReport handles a single day', () => {
  const r = buildReport([emptyEntry('2026-01-01')], ctx);
  ok(r.today.score > 0); eq(r.streak, 1);
});
t('buildReport handles zero days', () => {
  const r = buildReport([], ctx);
  eq(r.today, null); eq(r.streak, 0);
});
t('simulate: more sleep raises score', () => {
  const s = simulate(demo, { sleepHours: 1 }, ctx);
  ok(s.scoreDelta > 0, 'got ' + s.scoreDelta);
});
t('simulate: more alcohol lowers score', () => {
  const s = simulate(demo, { alcoholUnits: 3 }, ctx);
  ok(s.scoreDelta < 0, 'got ' + s.scoreDelta);
});
t('simulate respects field bounds', () => {
  const s = simulate(demo, { sleepHours: 500 }, ctx);
  ok(s.projected.score >= 0 && s.projected.score <= 100);
});
t('simulate ignores unknown fields', () => {
  const s = simulate(demo, { notARealField: 10 }, ctx);
  near(s.scoreDelta, 0, 0.001);
});
t('topLeverage returns ranked positive-delta actions', () => {
  const l = topLeverage(demo, ctx);
  ok(l.length > 0);
  for (const x of l) ok(x.scoreDelta > 0, 'all suggestions must help');
  for (let i = 1; i < l.length; i++) ok(l[i - 1].scoreDelta >= l[i].scoreDelta, 'must be sorted');
});
t('topLeverage does not repeat a field', () => {
  const fields = topLeverage(demo, ctx).map((l) => l.field);
  eq(new Set(fields).size, fields.length);
});

t('an empty result always states how blind the test was', () => {
  // "Nothing held up" is the app's most common output. Measured recall of a
  // genuine effect at |r| = 0.32 is 8% at 90 days and 56% at 180, so
  // presenting an empty result as a settled negative would be the most
  // frequent overclaim the app makes.
  for (const n of [40, 90, 120, 200]) {
    const note = sensitivityNote(n);
    ok(note && note.length > 40, 'must say something concrete at ' + n);
    ok(/strong|would not appear|clean bill/i.test(note), 'must describe the limits: ' + note);
    ok(/\d/.test(note), 'must give a number, not a vibe: ' + note);
    ok(!/no effect|you are fine|nothing wrong|rules out/i.test(note), 'must not read as a clean bill: ' + note);
  }
  ok(sensitivityNote(90) !== sensitivityNote(200), 'the claim must scale with how much data there is');
});
t('the trial verdict never says randomisation rules a confound out', () => {
  // Randomisation makes drift and ordering unlikely as SYSTEMATIC bias; in a
  // single trial they can still line up by luck, and this card is the most
  // persuasive thing in the app.
  const { trial, es } = runTrial(1000, 1.5);
  const v = verdict(trial, es);
  const all = `${v.headline} ${v.body} ${v.caveat || ''}`;
  ok(!/cannot explain|rules? out|proves/i.test(all), 'overclaimed causality: ' + all);
  ok(/by luck|still|single|one experiment/i.test(all), 'must admit the single-trial limit');
});

/* ================= factors ================= */
t('factors validate like symptoms and cap out', () => {
  const out = validateFactors([{ label: 'Dairy' }, { label: 'Late screens' }, { label: '  ' }]);
  eq(out.length, 2);
  ok(/^f_[a-z0-9]+$/.test(out[0].id), 'factor ids are opaque and namespaced');
  eq(new Set(out.map((x) => x.id)).size, 2);
  ok(validateFactors(Array.from({ length: 40 }, (_, i) => ({ label: 'f' + i }))).length <= 12);
  const amounts = validateFactorAmounts({ [out[0].id]: 99, f_nope: 1, junk: 'x' }, out);
  eq(amounts[out[0].id], AMOUNT_MAX);
  eq(amounts.f_nope, undefined);
});
t('a logged day defaults its factors to none', () => {
  const facs = validateFactors([{ label: 'Dairy' }]);
  eq(emptyEntry('2026-01-01', [], facs).factors[facs[0].id], 0);
});

t('FACTORS: your own suspicion is tested, and a wrong one stays silent', () => {
  // The point of the feature: before this, the app could only answer questions
  // it had thought of. Someone whose actual suspicion is dairy got nothing.
  const syms = validateSymptoms([{ label: 'Migraine' }]);
  const facs = validateFactors([{ label: 'Dairy' }, { label: 'Loud office' }]);
  const sid = syms[0].id, dairy = facs[0].id, office = facs[1].id;
  const es = synth(150, 5, (e, i, r) => {
    e.sleepHours = 6 + r() * 2.5;
    e.steps = Math.round(3000 + r() * 8000);
    e.alcoholUnits = Math.round(r() * 4);
    e.mood = 1 + Math.floor(r() * 5);
    e.energy = 1 + Math.floor(r() * 5);
    e.stress = 1 + Math.floor(r() * 5);
    e.sleepQuality = 1 + Math.floor(r() * 5);
    e.factors = { [dairy]: r() < 0.4 ? 1 + Math.floor(r() * 3) : 0,
                  [office]: r() < 0.5 ? 1 + Math.floor(r() * 3) : 0 };
    e.symptoms = { [sid]: 0 };
  });
  const rn = mulberry32(88);
  for (let i = 1; i < es.length; i++) {
    es[i].symptoms[sid] = Math.max(0, Math.min(4,
      Math.round(es[i - 1].factors[dairy] * 1.05 + (rn() - 0.5) * 1.4)));
  }
  const res = discover(es, { symptoms: syms, factors: facs });
  const hit = res.findings.find((f) => f.driver === dairy && f.outcome === sid);
  ok(hit, 'the planted user factor must be found');
  ok(!res.findings.some((f) => f.driver === office), 'the innocent factor must stay silent');
  ok(!/[sf]_[a-z0-9]{6,}/.test(hit.text), 'raw ids must not leak into the sentence: ' + hit.text);
  ok(/dairy/i.test(hit.text) && /migraine/i.test(hit.text), 'both must be named: ' + hit.text);
});

t('a factor becomes a trial lever and returns an honest verdict', () => {
  // Correlation on a suspicion is still only a hypothesis. Being able to
  // deliberately avoid it on random blocks is what makes it answerable.
  const syms = validateSymptoms([{ label: 'Migraine' }]);
  const facs = validateFactors([{ label: 'Dairy' }]);
  const sid = syms[0].id, did = facs[0].id;
  eq(leversFor(facs).length, LEVERS.length + 1, 'the user factor joins the lever list');
  const lever = factorLever(facs[0]);
  ok(/^factor:/.test(lever.id) && lever.userDefined);

  const run = (effect) => {
    const { trial } = createTrial({ leverId: lever.id, outcome: sid, outcomeLabel: 'Migraine',
      pairs: 7, startDate: '2026-05-01', seed: 4242, factors: facs });
    const r = mulberry32(31);
    const es = [];
    for (let i = 0; i < trialDays(trial); i++) {
      const date = addDays(trial.startDate, i);
      const e = emptyEntry(date, syms, facs);
      e.factors[did] = armForDate(trial, date) === 'on' ? 0 : 1 + Math.floor(r() * 3);
      e.symptoms[sid] = Math.max(0, Math.min(4,
        Math.round(0.7 + e.factors[did] * effect * 0.6 + (r() - 0.5) * 1.3)));
      es.push(e);
    }
    return verdict(trial, es, facs);
  };
  eq(run(1.5).kind, 'helped', 'a real cause must be detected');
  eq(run(0).kind, 'no-effect', 'an innocent suspicion must come back clean');
});

/* ================= safety ================= */

function safetySeries(n, fn, syms) {
  const es = [];
  let d = addDays('2026-08-30', -(n - 1));
  for (let i = 0; i < n; i++) { const e = emptyEntry(d, syms); fn(e, i, n); es.push(e); d = addDays(d, 1); }
  return es;
}

t('flags a substantial unintentional weight loss', () => {
  const es = safetySeries(95, (e, i, n) => { e.bodyweightKg = 80 - (i / n) * 6; });
  ok(checkFlags(es, {}, '2026-08-30').some((f) => f.id === 'weight-loss'));
});
t('does not flag ordinary weight fluctuation', () => {
  const rnd = mulberry32(4);
  const es = safetySeries(95, (e, i) => { e.bodyweightKg = 78 + Math.sin(i / 9) + (rnd() - 0.5) * 1.2; });
  eq(checkFlags(es, {}, '2026-08-30').length, 0);
});
t('flags two weeks of sustained low mood, with support routes', () => {
  const es = safetySeries(20, (e) => { e.mood = 2; });
  const f = checkFlags(es, {}, '2026-08-30').find((x) => x.id === 'low-mood');
  ok(f, 'must notice');
  ok(f.support === true, 'must offer support routes');
  ok(!/depress|diagnos|disorder/i.test(f.title + f.detail + f.ask), 'must not name a condition');
});
t('does not flag ordinary mood', () => {
  eq(checkFlags(safetySeries(20, (e) => { e.mood = 4; }), {}, '2026-08-30').length, 0);
});
t('flags a symptom that has been severe for two weeks', () => {
  const syms = validateSymptoms([{ label: 'Migraine' }]);
  const es = safetySeries(20, (e) => { e.symptoms[syms[0].id] = 4; e.mood = 4; }, syms);
  ok(checkFlags(es, { symptoms: syms }, '2026-08-30').some((f) => f.id.startsWith('persistent-symptom')));
});
t('a dismissed flag stays quiet, then returns', () => {
  const es = safetySeries(20, (e) => { e.mood = 2; });
  eq(checkFlags(es, { dismissedFlags: { 'low-mood': '2026-08-20' } }, '2026-08-30').length, 0, 'recently dismissed');
  ok(checkFlags(es, { dismissedFlags: { 'low-mood': '2026-06-01' } }, '2026-08-30').length > 0, 'returns after the snooze');
});
t('no rule ever names a condition or reassures', () => {
  const banned = /\b(diagnos|you have|probably nothing|don'?t worry|nothing to worry|cure|it'?s fine)\b/i;
  const syms = validateSymptoms([{ label: 'Migraine' }]);
  const extreme = safetySeries(95, (e, i, n) => {
    e.bodyweightKg = 90 - (i / n) * 12;
    e.restingHR = 55 + Math.round((i / n) * 25);
    e.mood = 1;
    e.symptoms[syms[0].id] = 4;
  }, syms);
  const flags = checkFlags(extreme, { symptoms: syms }, '2026-08-30');
  ok(flags.length > 0, 'setup check: this person should be flagged');
  for (const f of flags) {
    ok(!banned.test(`${f.title} ${f.detail} ${f.ask}`), 'unsafe wording in ' + f.id);
    ok(/doctor|looked at|mention/i.test(f.ask), 'every flag must point somewhere real: ' + f.id);
  }
});
t('never shows more than two flags at once', () => {
  const syms = validateSymptoms([{ label: 'A' }, { label: 'B' }]);
  const es = safetySeries(95, (e, i, n) => {
    e.bodyweightKg = 90 - (i / n) * 12;
    e.restingHR = 55 + Math.round((i / n) * 25);
    e.mood = 1;
    for (const sy of syms) e.symptoms[sy.id] = 4;
  }, syms);
  ok(checkFlags(es, { symptoms: syms }, '2026-08-30').length <= 2);
});
t('the report gets every flag, however many were dismissed', () => {
  // Tapping "I've seen this" is an acknowledgement, not a decision to leave
  // something out of what you hand a doctor. The report used to read the
  // banner list, which is dismissal-filtered and capped at two — so with five
  // rules firing it showed two, and acknowledging them removed them entirely.
  const syms = validateSymptoms([{ label: 'Migraine' }]);
  const id = syms[0].id;
  const es = safetySeries(95, (e, i, n) => {
    e.bodyweightKg = 90 - (i / n) * 12;
    e.restingHR = 55 + Math.round((i / n) * 25);
    e.mood = 1;
    e.symptoms[id] = i > 60 ? 4 : 1;
  }, syms);
  const ctx = { symptoms: syms };
  const banner = checkFlags(es, ctx, '2026-08-30');
  const full = checkFlags(es, ctx, '2026-08-30', { all: true });
  ok(full.length > banner.length, 'the report set must not be truncated');
  eq(banner.length, 2, 'the banner stays readable');

  // And acknowledging everything must not empty the report.
  const dismissed = {};
  for (const f of full) dismissed[f.id] = '2026-08-29';
  eq(checkFlags(es, { ...ctx, dismissedFlags: dismissed }, '2026-08-30').length, 0, 'banner respects dismissal');
  eq(checkFlags(es, { ...ctx, dismissedFlags: dismissed }, '2026-08-30', { all: true }).length, full.length,
     'the report keeps every flag even when all are acknowledged');
});

t('the notes crisis check is precise, not keyword soup', () => {
  for (const s of ['this headache is killing me', 'my back is murder today',
                   'dead tired', 'ended my workout early', 'I could die of embarrassment']) {
    eq(checkNotesForCrisis(s), false, 'false positive on: ' + s);
  }
  for (const s of ['i want to die', 'I am going to kill myself', 'i want to hurt myself']) {
    eq(checkNotesForCrisis(s), true, 'missed: ' + s);
  }
});
t('flags do not fire on people who are simply unwell-ish', () => {
  // The crying-wolf check: a flag nobody trusts is worse than no flag.
  const syms = validateSymptoms([{ label: 'Migraine' }]);
  let flagged = 0;
  const T = 60;
  for (let s = 0; s < T; s++) {
    const rnd = mulberry32(9000 + s);
    const es = safetySeries(120, (e, i) => {
      e.bodyweightKg = 78 + Math.sin(i / 9) * 0.9 + (rnd() - 0.5) * 1.2;
      e.restingHR = Math.round(60 + Math.sin(i / 13) * 3 + (rnd() - 0.5) * 5);
      e.mood = 2 + Math.floor(rnd() * 4);
      e.symptoms[syms[0].id] = rnd() < 0.25 ? 1 + Math.floor(rnd() * 3) : 0;
    }, syms);
    if (checkFlags(es, { symptoms: syms }, '2026-08-30').length) flagged++;
  }
  console.log(`\n  [safety] ${flagged}/${T} ordinary logs produced a flag`);
  ok(flagged / T <= 0.1, `too many false alarms: ${flagged}/${T}`);
});

t('a symptom finding names the symptom and gets the direction right', () => {
  // Both of these were broken: the sentence printed the opaque id, and because
  // a symptom is in neither FIELDS nor LOWER_IS_BETTER, "more alcohol, more
  // migraine" was classified as working for you.
  const syms = validateSymptoms([{ label: 'Migraine' }]);
  const id = syms[0].id;
  eq(labelFor(id, syms), 'Migraine');
  eq(labelFor('sleepHours', syms), 'Sleep duration');
  eq(isLowerBetter(id), true, 'a symptom is always lower-is-better');
  eq(isLowerBetter('mood'), false);

  const es = synth(150, 11, (e, i, r) => {
    e.sleepHours = 6 + r() * 2.5;
    e.steps = Math.round(3000 + r() * 8000);
    e.alcoholUnits = Math.round(r() * 4);
    e.mood = 1 + Math.floor(r() * 5);
    e.energy = 1 + Math.floor(r() * 5);
    e.stress = 1 + Math.floor(r() * 5);
    e.sleepQuality = 1 + Math.floor(r() * 5);
    e.symptoms = { [id]: 0 };
  });
  const rn = mulberry32(77);
  for (let i = 1; i < es.length; i++) {
    es[i].symptoms[id] = Math.max(0, Math.min(4,
      Math.round(es[i - 1].alcoholUnits * 0.8 + (rn() - 0.5) * 1.4)));
  }
  const hit = discover(es, { symptoms: syms }).findings.find((f) => f.outcome === id);
  ok(hit, 'setup check: the planted effect should be found');
  ok(!/s_[a-z0-9]{4,}/.test(hit.text), 'raw id leaked into the sentence: ' + hit.text);
  ok(hit.text.includes('migraine'), 'symptom must be named: ' + hit.text);
  ok(/costing you/.test(hit.text), 'more alcohol -> more migraine must read as a cost: ' + hit.text);
});

t('a dismissed flag reopens if the situation gets materially worse', () => {
  // The snooze exists so the app does not nag about something already known.
  // It must not become a way of going quiet while things deteriorate.
  const mk = (n, fn) => {
    const es = []; let d = addDays('2026-08-30', -(n - 1));
    for (let i = 0; i < n; i++) { const e = emptyEntry(d); fn(e, i); es.push(e); d = addDays(d, 1); }
    return es;
  };
  const bad = mk(20, (e) => { e.mood = 1; });
  const ackLow = { 'low-mood': { at: '2026-08-25', severity: 4 } };
  const reopened = checkFlags(bad, { dismissedFlags: ackLow }, '2026-08-30');
  ok(reopened.some((f) => f.id === 'low-mood' && f.reopened), 'deterioration must speak up');

  const ackSame = { 'low-mood': { at: '2026-08-25', severity: 14 } };
  eq(checkFlags(bad, { dismissedFlags: ackSame }, '2026-08-30').length, 0,
     'an unchanged situation must stay quiet');

  // Records written before this existed are bare date strings.
  eq(checkFlags(bad, { dismissedFlags: { 'low-mood': '2026-08-25' } }, '2026-08-30').length, 0,
     'legacy acknowledgements must still snooze');
});

t('a driver that accumulates over a week is found', () => {
  // Detection of an n-night sleep-debt effect was 20/20 at n=1 and 0/20 from
  // n=7, because by then one night is too small a share of the sum. Trailing
  // weekly means close that gap.
  const syms = validateSymptoms([{ label: 'Migraine' }]);
  const id = syms[0].id;
  let found = 0;
  const T = 10;
  for (let s = 0; s < T; s++) {
    const es = synth(160, 4000 + s, (e, i, r) => {
      e.sleepHours = 5.2 + r() * 3.4;
      e.steps = Math.round(3000 + r() * 8000);
      e.alcoholUnits = Math.round(r() * 4);
      e.exerciseMinutes = Math.round(r() * 60);
      e.caffeineAfter2pm = Math.round(r() * 4) * 50;
      e.mood = 1 + Math.floor(r() * 5);
      e.energy = 1 + Math.floor(r() * 5);
      e.stress = 1 + Math.floor(r() * 5);
      e.sleepQuality = 1 + Math.floor(r() * 5);
      e.symptoms = { [id]: 0 };
    });
    const rn = mulberry32(s * 3 + 1);
    for (let i = 7; i < es.length; i++) {
      let debt = 0;
      for (let k = 1; k <= 7; k++) debt += Math.max(0, 7.5 - es[i - k].sleepHours);
      es[i].symptoms[id] = Math.max(0, Math.min(4, Math.round((debt / 7) * 1.7 - 0.6 + (rn() - 0.5) * 1.3)));
    }
    const res = discover(es, { symptoms: syms });
    if (res.findings.some((f) => /sleepHours$/.test(f.driver) && f.outcome === id)) found++;
  }
  console.log(`\n  [window] weekly sleep-debt effect found in ${found}/${T} datasets`);
  ok(found / T >= 0.7, `cumulative effects still missed: ${found}/${T}`);
});
t('a windowed finding reads as a sentence and names the driver plainly', () => {
  // Substituting the windowed label into the day-to-day template produced
  // "On your higher-stress at work over the past week days, ..." — a run-on
  // that reads like a rendering bug.
  const syms = validateSymptoms([{ label: 'Migraine' }]);
  const facs = validateFactors([{ label: 'Stress at work' }]);
  const sid = syms[0].id, fid = facs[0].id;
  const es = synth(170, 9, (e, i, r) => {
    e.sleepHours = 6 + r() * 2.5;
    e.steps = Math.round(3000 + r() * 8000);
    e.alcoholUnits = Math.round(r() * 4);
    e.mood = 1 + Math.floor(r() * 5);
    e.energy = 1 + Math.floor(r() * 5);
    e.stress = 1 + Math.floor(r() * 5);
    e.sleepQuality = 1 + Math.floor(r() * 5);
    e.factors = { [fid]: Math.floor(r() * 4) };
    e.symptoms = { [sid]: 0 };
  });
  const rn = mulberry32(21);
  for (let i = 7; i < es.length; i++) {
    let load = 0;
    for (let k = 1; k <= 7; k++) load += es[i - k].factors[fid];
    es[i].symptoms[sid] = Math.max(0, Math.min(4, Math.round((load / 7) * 1.5 - 0.5 + (rn() - 0.5) * 1.3)));
  }
  const hit = discover(es, { symptoms: syms, factors: facs })
    .findings.find((f) => f.driver === 'w7_' + fid);
  ok(hit, 'the cumulative factor effect must be found');
  ok(!/over the past week days/.test(hit.text), 'run-on phrasing: ' + hit.text);
  ok(/build(s)? up/.test(hit.text), 'must say it accumulates: ' + hit.text);
  ok(!/[sf]_[a-z0-9]{6,}/.test(hit.text), 'raw id leaked: ' + hit.text);
  eq((hit.text.match(/This one/g) || []).length <= 1, true, 'repetitive copy: ' + hit.text);
});

t('a weekly window is never compared against its own outcome', () => {
  // A window ending on day d contains day d, so "stress over the past week"
  // against "stress today" is a variable correlated with itself. That was the
  // only thing leaking when windows were introduced.
  const es = synth(150, 6001, (e, i, r) => {
    e.sleepHours = 6 + r() * 2.5;
    e.stress = 1 + Math.floor(r() * 5);
    e.mood = 1 + Math.floor(r() * 5);
    e.energy = 1 + Math.floor(r() * 5);
    e.sleepQuality = 1 + Math.floor(r() * 5);
    e.steps = Math.round(3000 + r() * 8000);
  });
  const res = discover(es, { raw: true });
  const tautology = (res._raw || []).some((c) =>
    c.driver === 'w7_' + c.outcome && c.lag === 0);
  ok(!tautology, 'a window was tested against the variable it contains');
});

/* ================= n-of-1 trials ================= */

function runTrial(seed, trueEffect, adhereRate = 0.95, syms = null) {
  const symptoms = syms || validateSymptoms([{ label: 'Migraine' }]);
  const { trial } = createTrial({
    leverId: 'no-late-caffeine', outcome: 's_migraine', outcomeLabel: 'Migraine',
    pairs: 7, startDate: '2026-05-01', seed,
  });
  const r = mulberry32(seed * 31 + 7);
  const es = [];
  for (let i = 0; i < trialDays(trial); i++) {
    const date = addDays(trial.startDate, i);
    const e = emptyEntry(date, symptoms);
    const arm = armForDate(trial, date);
    const adhering = r() < adhereRate;
    e.caffeineAfter2pm = arm === 'on' ? (adhering ? 0 : 100) : (r() < 0.9 ? 150 : 0);
    const exposure = e.caffeineAfter2pm > 0 ? 1 : 0;
    e.symptoms.s_migraine = Math.max(0, Math.min(4, Math.round(1.0 + exposure * trueEffect + (r() - 0.5) * 1.6)));
    es.push(e);
  }
  return { trial, es };
}

t('a design that cannot reach significance is refused', () => {
  // The reference set is the 2^K coin tosses, so the smallest two-sided p is
  // 2/2^K. At 5 pairs that is 0.0625 — above alpha, so the trial could never
  // come back significant however large the effect.
  for (let k = 1; k < TRIAL_MIN_PAIRS; k++) ok(floorP(k) > 0.05, `floor at ${k} pairs should exceed alpha`);
  ok(floorP(TRIAL_MIN_PAIRS) <= 0.05, 'the minimum must itself be usable');
  ok(createTrial({ leverId: 'no-alcohol', outcome: 'mood', pairs: 5 }).error, 'must refuse 5 pairs');
  ok(!createTrial({ leverId: 'no-alcohol', outcome: 'mood', pairs: 6 }).error, 'must allow 6');
});
t('a trial pre-registers its outcome and balances the arms', () => {
  const { trial } = createTrial({ leverId: 'no-alcohol', outcome: 'mood', pairs: 7, seed: 5 });
  eq(trial.outcome, 'mood');
  eq(trial.assignment.length, 14);
  // exactly one ON per pair — that is what makes the sign-flip reference set exact
  for (let i = 0; i < 7; i++) {
    const pair = [trial.assignment[i * 2], trial.assignment[i * 2 + 1]].sort().join(',');
    eq(pair, 'off,on', `pair ${i} must contain exactly one ON block`);
  }
  eq(schedule(trial).length, trialDays(trial));
});
t('the same seed reproduces the same schedule', () => {
  const a = createTrial({ leverId: 'no-alcohol', outcome: 'mood', pairs: 7, seed: 99 }).trial;
  const b = createTrial({ leverId: 'no-alcohol', outcome: 'mood', pairs: 7, seed: 99 }).trial;
  eq(a.assignment.join(''), b.assignment.join(''));
});

t('TRIALS detect a real effect', () => {
  let hits = 0;
  const T = 12;
  for (let s = 0; s < T; s++) if (runTrialVerdict(1000 + s, 1.5).kind === 'helped') hits++;
  console.log(`\n  [trial-power] real effect detected in ${hits}/${T} trials`);
  ok(hits / T >= 0.7, `power too low: ${hits}/${T}`);
});
t('TRIALS stay quiet when there is nothing there', () => {
  let fp = 0;
  const T = 20;
  for (let s = 0; s < T; s++) {
    const k = runTrialVerdict(3000 + s, 0).kind;
    if (k === 'helped' || k === 'hurt') fp++;
  }
  console.log(`\n  [trial-null] ${fp}/${T} null trials produced a positive verdict (alpha 0.05)`);
  ok(fp / T <= 0.15, `false positive rate too high: ${fp}/${T}`);
});
function runTrialVerdict(seed, effect, adhere = 0.95) {
  const { trial, es } = runTrial(seed, effect, adhere);
  return verdict(trial, es);
}
t('a trial you did not stick to returns no verdict', () => {
  const v = runTrialVerdict(5000, 1.5, 0.4);
  eq(v.kind, 'not-run');
  ok(/did not really get tested/i.test(v.headline));
});
t('a trial with no contrast between arms returns no verdict', () => {
  const symptoms = validateSymptoms([{ label: 'Migraine' }]);
  const { trial } = createTrial({ leverId: 'no-alcohol', outcome: 's_migraine', pairs: 7, startDate: '2026-05-01', seed: 7 });
  const es = [];
  for (let i = 0; i < trialDays(trial); i++) {
    const e = emptyEntry(addDays(trial.startDate, i), symptoms);
    e.alcoholUnits = 0;                       // teetotal all month: OFF blocks never differ
    e.symptoms.s_migraine = i % 3;
    es.push(e);
  }
  eq(verdict(trial, es).kind, 'no-contrast');
});
t('missing days block a verdict rather than shrinking the test', () => {
  const { trial, es } = runTrial(1000, 1.5);
  const gappy = es.filter((_, i) => i % 4 !== 0);   // drop a day from most blocks
  const res = analyze(trial, gappy);
  ok(res.status === 'analysed' || res.status === 'inconclusive');
  const sparse = es.slice(0, 6);                    // only the first few days exist
  eq(analyze(trial, sparse).status, 'inconclusive');
  eq(verdict(trial, sparse).kind, 'inconclusive');
});
t('a finding offers the experiment that would settle it', () => {
  // A correlation is a hypothesis; the trial is the only thing that can answer
  // it. Without this mapping the user has to notice the finding, go to Trials
  // and rebuild the same two choices by hand.
  const facs = validateFactors([{ label: 'Dairy' }]);
  eq(leverForDriver('alcoholUnits', facs)?.id, 'no-alcohol');
  eq(leverForDriver('caffeineAfter2pm', facs)?.id, 'no-late-caffeine');
  // A windowed driver offers the same lever — avoiding it for a week is just
  // avoiding it.
  eq(leverForDriver('w7_alcoholUnits', facs)?.id, 'no-alcohol');
  eq(leverForDriver(facs[0].id, facs)?.field, facs[0].id);
  eq(leverForDriver('w7_' + facs[0].id, facs)?.field, facs[0].id);
  // Nothing you can deliberately change: no offer, rather than a fake one.
  eq(leverForDriver('restingHR', facs), null);
  eq(leverForDriver('hrv', facs), null);
  eq(leverForDriver('sleepHours', facs), null, 'you set a bedtime, not a duration');
  // A factor that has been removed must not resurrect a lever.
  eq(leverForDriver(facs[0].id, []), null);
});

t('a trial is not finished until its last day is past', () => {
  // It used to be declared finished ON the final day, revealing and offering
  // to save a verdict computed before that day was logged — the exact peeking
  // the whole design exists to prevent, and the answer could then change.
  const { trial } = createTrial({ leverId: 'no-alcohol', outcome: 'mood', pairs: 7, startDate: '2026-05-01', seed: 3 });
  const last = addDays(trial.startDate, trialDays(trial) - 1);
  eq(isComplete(trial, last), false, 'the final day is still part of the trial');
  eq(isComplete(trial, addDays(last, 1)), true, 'the day after it is over');
  eq(daysRemaining(trial, last), 1, 'the final day counts as one still to go');
  eq(daysRemaining(trial, addDays(last, 1)), 0);
});
t('a trial whose lever was deleted degrades instead of throwing', () => {
  // Removing a tracked suspicion with a running trial used to take the whole
  // app down: getLever returned null and every read of lever.onText threw.
  const syms = validateSymptoms([{ label: 'Migraine' }]);
  const facs = validateFactors([{ label: 'Dairy' }]);
  const { trial } = createTrial({
    leverId: factorLever(facs[0]).id, outcome: syms[0].id, outcomeLabel: 'Migraine',
    pairs: 7, startDate: '2026-05-01', seed: 1, factors: facs,
  });
  const es = [];
  for (let i = 0; i < trialDays(trial); i++) {
    const date = addDays(trial.startDate, i);
    const e = emptyEntry(date, syms, facs);
    e.factors[facs[0].id] = armForDate(trial, date) === 'on' ? 0 : 2;
    e.symptoms[syms[0].id] = i % 3;
    es.push(e);
  }
  ok(['helped', 'hurt', 'no-effect', 'not-run', 'no-contrast'].includes(verdict(trial, es, facs).kind));
  const orphan = verdict(trial, es, []);          // factor removed
  eq(orphan.kind, 'orphaned');
  ok(orphan.headline && orphan.body, 'must still say something useful');
});

t('every lever is a plain behaviour, never a medicine', () => {
  // What defines the intervention is the label and id, not the prose note —
  // an earlier version of this test flagged "works fastest of the lot" for
  // containing "fast". Match whole words against what the user is asked to do.
  const banned = /\b(medication|medicine|drug|dose|dosage|supplement|pill|fasting|starve|starvation|restriction|detox|cleanse|prescription)\b/i;
  for (const l of LEVERS) {
    ok(!banned.test(`${l.label} ${l.id} ${l.onText} ${l.offText}`), 'unsafe lever: ' + l.label);
    ok(l.field && l.on && l.off, 'lever needs a measurable target: ' + l.id);
    // Every lever must be checkable from data the app already logs, otherwise
    // adherence is self-reported about self-report.
    ok(FIELDS_KEYS.has(l.field), 'lever must target a logged field: ' + l.field);
  }
});
t('the null verdict states the floor rather than claiming proof', () => {
  const v = runTrialVerdict(3000, 0);
  eq(v.kind, 'no-effect');
  ok(/does not prove it does nothing/i.test(v.caveat), 'must not overclaim a null');
  ok(v.caveat.includes(String(v.analysis.floorP)), 'must state the smallest p it could have found');
});


t('a real weekday pattern is found, and a fake one is not', () => {
  const mk = (bump, dow, seed) => {
    const r = mulberry32(seed); const es = []; let z = 0;
    for (let i = 0; i < 140; i++) {
      z = 0.5 * z + Math.sqrt(0.75) * (r() + r() + r() + r() - 2) * 1.2;
      const date = addDays('2026-01-05', i);
      const [y, m, d] = date.split('-').map(Number);
      const isDow = new Date(y, m - 1, d).getDay() === dow;
      es.push({ date, symptoms: { s_a: Math.max(0, Math.min(4, Math.round(1.4 + z + (isDow ? bump : 0)))) } });
    }
    return es;
  };
  const hit = weekdayEffect(mk(1.2, 1, 4242), 's_a');
  eq(hit.worst.day, 'Monday');
  ok(hit.p <= 0.01, `planted Monday effect should be found, got p=${hit.p}`);

  // The same generator with no bump must not produce a confident claim.
  let leaked = 0;
  for (let k = 0; k < 30; k++) if (weekdayEffect(mk(0, 1, 900 + k * 7919), 's_a').p <= 0.05) leaked++;
  ok(leaked <= 4, `too many false weekday patterns: ${leaked}/30 at p<=.05`);
});

t('a weekday claim needs enough days, enough of each day, and enough symptom', () => {
  const flat = (n, val, seed) => {
    const r = mulberry32(seed);
    return Array.from({ length: n }, (_, i) => ({
      date: addDays('2026-01-05', i), symptoms: { s_a: val == null ? (r() < 0.5 ? 0 : 1) : val },
    }));
  };
  eq(weekdayEffect(flat(14, null, 1), 's_a'), null, 'under three weeks says nothing');
  eq(weekdayEffect(flat(60, 2, 2), 's_a'), null, 'a constant series has no pattern');
  // Present on only a handful of days: a perfect-looking week that means nothing.
  const sparse = Array.from({ length: 60 }, (_, i) => ({ date: addDays('2026-01-05', i), symptoms: { s_a: i % 20 === 0 ? 3 : 0 } }));
  eq(weekdayEffect(sparse, 's_a'), null, 'three flare days cannot carry a weekday claim');
  // Weekends only — five weekdays never observed.
  const weekendsOnly = [];
  for (let i = 0; i < 120; i++) {
    const [y, m, d] = addDays('2026-01-05', i).split('-').map(Number);
    const dw = new Date(y, m - 1, d).getDay();
    if (dw === 0 || dw === 6) weekendsOnly.push({ date: addDays('2026-01-05', i), symptoms: { s_a: dw === 0 ? 3 : 1 } });
  }
  eq(weekdayEffect(weekendsOnly, 's_a'), null, 'cannot rank days that were never logged');
});

t('the same log always gives the same weekday p-value', () => {
  const r = mulberry32(77); const es = [];
  for (let i = 0; i < 100; i++) es.push({ date: addDays('2026-01-05', i), symptoms: { s_a: Math.round(r() * 4) } });
  const a = weekdayEffect(es, 's_a'), b = weekdayEffect(es, 's_a');
  eq(a.p, b.p, 'a p-value that moves between renders is not a p-value');
  eq(a.eta2, b.eta2);
});

t('testing several symptoms for weekday patterns is corrected for', () => {
  const r = mulberry32(31337);
  const es = [];
  for (let i = 0; i < 140; i++) {
    const date = addDays('2026-01-05', i);
    const [y, m, d] = date.split('-').map(Number);
    const isMon = new Date(y, m - 1, d).getDay() === 1;
    const sym = { s_real: Math.max(0, Math.min(4, Math.round(1.4 + (r() + r() - 1) + (isMon ? 1.4 : 0)))) };
    for (const id of ['s_n1', 's_n2', 's_n3', 's_n4', 's_n5']) sym[id] = Math.round(r() * 3);
    es.push({ date, symptoms: sym });

  }
  const syms = [{ id: 's_real', label: 'Migraine', primary: true },
    ...['s_n1', 's_n2', 's_n3', 's_n4', 's_n5'].map((id) => ({ id, label: id }))];
  const out = weekdayEffects(es, syms);
  ok(out.length >= 1, 'the planted pattern should survive correction');
  eq(out[0].field, 's_real');
  eq(out[0].worst.day, 'Monday');
  ok(out.every((w) => w.pAdjusted >= w.p), 'correction can only ever raise a p-value');
  // An archived symptom is not tested at all.
  eq(weekdayEffects(es, syms.map((x) => ({ ...x, archivedAt: 1 }))).length, 0);
});

/* ================= report ================= */
t('a log that skips the bad days is caught; one with random gaps is not', () => {
  const build = (seed, mnar) => {
    const r = mulberry32(seed); const sev = []; let z = 0;
    for (let i = 0; i < 150; i++) {
      z = 0.5 * z + Math.sqrt(0.75) * (r() + r() + r() + r() - 2) * 1.2;
      sev.push(Math.max(0, Math.min(4, Math.round(1.6 + z))));
    }
    const es = [];
    for (let i = 0; i < 150; i++) {
      const drop = mnar ? (sev[i] >= 3 ? r() < 0.75 : r() < 0.03) : r() < 0.14;
      if (!drop) es.push({ date: addDays('2026-01-05', i), symptoms: { s_a: sev[i] } });
    }
    return es;
  };
  // Bad days deliberately dropped: the shoulders of those stretches run worse.
  let caught = 0;
  for (let k = 0; k < 12; k++) {
    const b = loggingBias(build(3000 + k * 7919, true), 's_a');
    if (b && b.p <= 0.05) caught++;
  }
  ok(caught >= 4, `missing-not-at-random should usually be caught, got ${caught}/12`);

  // Gaps unrelated to severity: accusing someone of hiding their bad days on
  // the strength of a random gap is worse than saying nothing.
  let leaked = 0;
  for (let k = 0; k < 40; k++) {
    const b = loggingBias(build(500 + k * 104729, false), 's_a');
    if (b && b.p <= 0.05) leaked++;
  }
  ok(leaked <= 6, `too many false logging-bias accusations: ${leaked}/40`);
});

t('logging bias stays quiet when there is nothing to judge', () => {
  const full = Array.from({ length: 90 }, (_, i) => ({ date: addDays('2026-01-05', i), symptoms: { s_a: i % 5 } }));
  eq(loggingBias(full, 's_a'), null, 'a complete log has no gaps to test');
  const short = full.slice(0, 20);
  eq(loggingBias(short, 's_a'), null, 'too few days to judge');
  // Barely logged at all: the gaps outnumber the data and nothing can be said.
  const sparse = full.filter((_, i) => i % 4 === 0);
  eq(loggingBias(sparse, 's_a'), null, 'a mostly-empty log cannot be assessed');
});

t('logging bias is one-sided and corrected across symptoms', () => {
  const r = mulberry32(6060); const es = [];
  const sev = [];
  for (let i = 0; i < 150; i++) sev.push(Math.max(0, Math.min(4, Math.round(1.6 + (r() + r() + r() + r() - 2) * 1.2))));
  for (let i = 0; i < 150; i++) {
    const drop = sev[i] >= 3 ? r() < 0.75 : r() < 0.03;
    if (drop) continue;
    es.push({ date: addDays('2026-01-05', i), symptoms: { s_a: sev[i], s_b: Math.round(r() * 4) } });
  }
  const out = loggingBiasChecks(es, [{ id: 's_a', label: 'Migraine' }, { id: 's_b', label: 'Noise' }]);
  ok(out.every((b) => b.pAdjusted >= b.p), 'correction can only raise a p-value');
  ok(out.every((b) => b.diff > 0), 'only under-logged BAD days are worth flagging');
  eq(loggingBiasChecks(es, []).length, 0);
});

t('the power curve never claims more than was measured', () => {
  const { days, weak, moderate, strong } = POWER_CURVE;
  for (const [name, ys] of [['weak', weak], ['moderate', moderate], ['strong', strong]]) {
    eq(ys.length, days.length, `${name} has the wrong number of points`);
    for (let i = 1; i < ys.length; i++) {
      ok(ys[i] >= ys[i - 1], `${name} recall falls off between ${days[i - 1]} and ${days[i]} days`);
    }
    ok(ys.every((y) => y >= 0 && y <= 1), `${name} has a probability outside [0,1]`);
  }
  // A bigger effect is never harder to find than a smaller one.
  for (let i = 0; i < days.length; i++) {
    ok(strong[i] >= moderate[i] && moderate[i] >= weak[i], `effect sizes are out of order at ${days[i]} days`);
  }
});

t('detectionChance interpolates and never extrapolates upward', () => {
  for (let i = 0; i < POWER_CURVE.days.length; i++) {
    near(detectionChance(POWER_CURVE.days[i], 'moderate'), POWER_CURVE.moderate[i], 1e-9);
  }
  const mid = detectionChance(105, 'moderate');
  ok(mid > POWER_CURVE.moderate[1] && mid < POWER_CURVE.moderate[2], 'should sit between the measured points');
  eq(detectionChance(0, 'strong'), 0, 'no days, no chance');
  // Beyond the longest measured log, hold the last measurement — never grow it.
  eq(detectionChance(5000, 'moderate'), POWER_CURVE.moderate[POWER_CURVE.moderate.length - 1]);
  eq(detectionChance(90, 'nonsense'), null);
});

t('daysForChance answers with a length that actually delivers it', () => {
  for (const target of [0.3, 0.5, 0.7, 0.9]) {
    const need = daysForChance('moderate', target);
    ok(need != null, `no answer for ${target}`);
    ok(detectionChance(need, 'moderate') >= target - 1e-9,
      `${need} days does not actually reach ${target}`);
  }
  // A weak driver never reaches 9-in-10 anywhere on the measured curve, and
  // inventing a number there would be the whole point of this missed.
  eq(daysForChance('weak', 0.9), null);
});

t('the sensitivity note is honest at short lengths', () => {
  // The wording this replaced said only a strong driver "would reliably show
  // up" at 60 days. Measured, that is 2 times in 10.
  const short = sensitivityNote(60);
  ok(!/reliably/i.test(short), 'must not call a 2-in-10 chance reliable: ' + short);
  ok(/essentially never|1 time in 10/.test(short), 'must be blunt about a moderate driver: ' + short);
  ok(/clean bill of health/.test(short), 'must not be read as an all-clear');
  // Every length gives a target to walk towards, until the curve runs out.
  for (const n of [30, 60, 90, 120, 150, 180, 240]) {
    ok(/Another \d+ days/.test(sensitivityNote(n)), `no milestone offered at ${n} days`);
  }
  ok(!/Another \d+ days/.test(sensitivityNote(300)), 'must not invent a milestone past the curve');
});

t('chancePhrase never rounds a near-miss up to a certainty', () => {
  eq(chancePhrase(1), 'almost every time');
  eq(chancePhrase(0.96), 'about 9 times in 10');
  eq(chancePhrase(0.02), 'essentially never');
  eq(chancePhrase(0.1), 'about 1 time in 10');
  eq(chancePhrase(0.5), 'about 5 times in 10');
  ok(!/always|certain|guarantee/i.test([0, 0.3, 0.6, 0.9, 1].map(chancePhrase).join(' ')));
});

t('a yes/no habit is a real driver, at the lag it actually acts on', () => {
  // REGRESSION. hasUsableVariance required three distinct values, so every
  // binary habit was silently dropped: strengthSession could never produce a
  // finding, and a user tracking "dairy: yes/no" was never tested at all while
  // the report told them "nothing found".
  const symptoms = [{ id: 's_mig', label: 'Migraine', primary: true }];
  const factors = [{ id: 'f_dairy', label: 'Dairy' }];
  const r = mulberry32(11);
  const es = []; let d = '2026-01-01';
  for (let i = 0; i < 220; i++) {
    const e = emptyEntry(d, symptoms);
    const dairy = r() < 0.5 ? 1 : 0;
    e.factors = { f_dairy: dairy };
    e.strengthSession = r() < 0.45 ? 1 : 0;
    e.sleepHours = 6.5 + r() * 2; e.steps = Math.round(5000 + r() * 5000);
    e.stress = 1 + Math.floor(r() * 5);
    e.symptoms = { s_mig: Math.max(0, Math.min(4, Math.round(1.0 + dairy * 1.6 + (r() + r() - 1) * 0.6))) };
    es.push(e); d = addDays(d, 1);
  }
  const res = discover(es, { symptoms, factors });
  const direct = res.findings.find((f) => f.driver === 'f_dairy');
  ok(direct, 'a same-day binary effect must be found: ' + res.findings.map((f) => f.driver).join(','));
  eq(direct.lag, 0, 'and attributed to the day it actually happened on');
  // The windowed version alone used to be the ONLY thing that surfaced, which
  // told the user a same-day effect "builds up over a week".
  const win = res.findings.findIndex((f) => f.driver === 'w7_f_dairy');
  const dir = res.findings.findIndex((f) => f.driver === 'f_dairy');
  ok(win === -1 || dir < win, 'the same-day cause must outrank its own weekly average');
});

t('a yes/no habit logged too rarely is still refused', () => {
  // The informative-count floor is what makes two distinct values safe. A
  // habit present on a handful of days out of hundreds is a few outliers, not
  // a variable, however strongly it lines up.
  const symptoms = [{ id: 's_a', label: 'Ache', primary: true }];
  const factors = [{ id: 'f_rare', label: 'Rare thing' }];
  const r = mulberry32(3);
  const es = []; let d = '2026-01-01';
  for (let i = 0; i < 200; i++) {
    const e = emptyEntry(d, symptoms);
    const rare = i % 25 === 0 ? 1 : 0;                 // 4% of days
    e.factors = { f_rare: rare };
    e.sleepHours = 6.5 + r() * 2; e.steps = Math.round(5000 + r() * 5000);
    e.symptoms = { s_a: rare ? 4 : Math.round(r()) };  // perfectly aligned, still not enough
    es.push(e); d = addDays(d, 1);
  }
  const res = discover(es, { symptoms, factors });
  ok(!res.findings.some((f) => f.driver === 'f_rare'),
    'an 8-event habit must not be reportable however well it lines up');
});

t('binary drivers do not leak false positives', () => {
  const symptoms = [{ id: 's_a', label: 'Symptom', primary: true }];
  const factors = [{ id: 'f_a', label: 'A' }, { id: 'f_b', label: 'B' }, { id: 'f_c', label: 'C' }];
  let leaked = 0;
  const R = 30;
  for (let k = 0; k < R; k++) {
    const r = mulberry32(9000 + k * 7919);
    const es = []; let d = '2026-01-01';
    for (let i = 0; i < 180; i++) {
      const e = emptyEntry(d, symptoms);
      e.factors = { f_a: r() < 0.5 ? 1 : 0, f_b: r() < 0.5 ? 1 : 0, f_c: r() < 0.5 ? 1 : 0 };
      e.strengthSession = r() < 0.5 ? 1 : 0;
      e.caffeineAfter2pm = r() < 0.5 ? 0 : 150;
      e.sleepHours = 6.5 + r() * 2; e.steps = Math.round(5000 + r() * 5000);
      e.stress = 1 + Math.floor(r() * 5); e.mood = 1 + Math.floor(r() * 5);
      e.symptoms = { s_a: Math.max(0, Math.min(4, Math.round(1.5 + (r() + r() + r() + r() - 2) * 1.1))) };
      es.push(e); d = addDays(d, 1);
    }
    if (discover(es, { symptoms, factors }).findings.length) leaked++;
  }
  ok(leaked / R <= 0.15, `binary drivers leak too much noise: ${leaked}/${R}`);
});

t('an episodic symptom is analysed, not silently dropped', () => {
  // REGRESSION, and the worst bug of its kind found so far. hasUsableVariance
  // required 15% of observations away from the modal value and was applied to
  // OUTCOMES as well as drivers, so migraine on 12% of days — three or four
  // attacks a month, the textbook episodic presentation — was excluded
  // entirely. On this exact log the count of relationships tested fell from 36
  // to 16 and not one of them concerned the migraine, while the report told
  // the user "nothing found" about their main complaint.
  const symptoms = [{ id: 's_mig', label: 'Migraine', primary: true }];
  const factors = [{ id: 'f_dairy', label: 'Dairy' }];
  const build = (rate) => {
    const r = mulberry32(5); const es = []; let d = '2026-01-01';
    for (let i = 0; i < 300; i++) {
      const e = emptyEntry(d, symptoms);
      const dairy = r() < 0.35 ? 1 : 0;
      e.factors = { f_dairy: dairy };
      e.sleepHours = 6.5 + r() * 2; e.steps = Math.round(5000 + r() * 5000);
      e.stress = 1 + Math.floor(r() * 5);
      const flare = dairy ? r() < rate * 2.2 : r() < rate * 0.25;
      e.symptoms = { s_mig: flare ? 2 + Math.floor(r() * 3) : 0 };
      es.push(e); d = addDays(d, 1);
    }
    return es;
  };
  for (const rate of [0.12, 0.10, 0.06]) {
    const res = discover(build(rate), { symptoms, factors });
    ok(res.findings.some((f) => f.outcome === 's_mig' && f.driver === 'f_dairy'),
      `an unambiguous trigger must be found at a ${rate * 100}% flare rate`);
  }
  // Genuinely too few events to rest anything on.
  const rare = discover(build(0.03), { symptoms, factors });
  ok(!rare.findings.some((f) => f.outcome === 's_mig'), 'nine flare days cannot carry a finding');
});

t('the informative floor is a count, not a proportion', () => {
  // 12 flare days is 12 flare days whether they sit in 100 days of log or 400.
  // The second person has a rarer symptom, not a less analysable one.
  const symptoms = [{ id: 's_a', label: 'Flare', primary: true }];
  const spaced = (days, events) => {
    const r = mulberry32(21); const es = []; let d = '2026-01-01';
    const every = Math.floor(days / events);
    for (let i = 0; i < days; i++) {
      const e = emptyEntry(d, symptoms);
      const flare = i % every === 0 && i / every < events;
      e.sleepHours = flare ? 4.5 + r() * 0.5 : 7.5 + r() * 0.5;   // a blatant link
      e.steps = Math.round(5000 + r() * 5000);
      e.symptoms = { s_a: flare ? 3 : 0 };
      es.push(e); d = addDays(d, 1);
    }
    return es;
  };
  eq(MIN_INFORMATIVE, 12);
  const wide = discover(spaced(400, 14), { symptoms, factors: [] });
  ok(wide.findings.some((f) => f.outcome === 's_a'),
    '14 events in 400 days is 3.5% and must still be analysable');
  const tooFew = discover(spaced(90, 9), { symptoms, factors: [] });
  ok(!tooFew.findings.some((f) => f.outcome === 's_a'),
    '9 events is under the floor even at 10% of days');
});

t('sparse symptoms do not leak false positives', () => {
  const symptoms = [{ id: 's_a', label: 'Flare', primary: true }, { id: 's_b', label: 'Ache' }];
  const factors = [{ id: 'f_a', label: 'A' }, { id: 'f_b', label: 'B' }];
  let leaked = 0;
  const R = 25;
  for (let k = 0; k < R; k++) {
    const r = mulberry32(11000 + k * 7919);
    const es = []; let d = '2026-01-01';
    for (let i = 0; i < 200; i++) {
      const e = emptyEntry(d, symptoms);
      e.factors = { f_a: r() < 0.3 ? 1 : 0, f_b: Math.floor(r() * 4) };
      e.strengthSession = r() < 0.4 ? 1 : 0;
      e.sleepHours = 6.5 + r() * 2; e.steps = Math.round(5000 + r() * 5000);
      e.stress = 1 + Math.floor(r() * 5); e.mood = 1 + Math.floor(r() * 5);
      e.alcoholUnits = Math.round(r() * 3); e.bedtimeMinutes = Math.round(1290 + r() * 120);
      e.symptoms = { s_a: r() < 0.10 ? 1 + Math.floor(r() * 4) : 0,
                     s_b: r() < 0.10 ? 1 + Math.floor(r() * 4) : 0 };
      es.push(e); d = addDays(d, 1);
    }
    if (discover(es, { symptoms, factors }).findings.length) leaked++;
  }
  ok(leaked / R <= 0.12, `sparse symptoms leak noise: ${leaked}/${R}`);
});

t('attainableR is 1 for continuous data and lower where ties compress it', () => {
  const r = mulberry32(4);
  const cont = Array.from({ length: 200 }, () => r());
  near(attainableR(cont, cont.map(() => r())), 1, 1e-9, 'distinct values can reach 1');
  // A common exposure against a rare outcome cannot reach 1 however well they line up.
  const ex = Array.from({ length: 300 }, (_, i) => (i < 180 ? 1 : 0));
  const flare = Array.from({ length: 300 }, (_, i) => (i < 15 ? 1 : 0));
  const cap = attainableR(ex, flare);
  ok(cap < 0.3, `a 60%/5% split cannot exceed ~0.19, got ${cap}`);
  ok(cap > 0, 'and it is still positive');
  // Never returns something that would raise the floor above the fixed one.
  ok(attainableR([1, 1, 1], [1, 1, 1]) === 1, 'a degenerate pair falls back to 1');
});

t('a perfect trigger for a rare symptom is reported, not filtered as weak', () => {
  // REGRESSION. Spearman is attenuated by ties, so a fixed 0.20 floor was
  // unreachable where a common habit meets a rare flare: at 60% exposure and
  // 5% flares, a relationship in which EVERY flare follows the habit scores
  // r = 0.187 and was discarded as too weak to mention.
  const symptoms = [{ id: 's_mig', label: 'Migraine', primary: true }];
  const factors = [{ id: 'f_x', label: 'Trigger' }];
  for (const [pe, pf] of [[0.6, 0.05], [0.5, 0.04]]) {
    const r = mulberry32(9); const es = []; let d = '2026-01-01';
    for (let i = 0; i < 330; i++) {
      const e = emptyEntry(d, symptoms);
      const ex = r() < pe ? 1 : 0;
      e.factors = { f_x: ex };
      e.sleepHours = 6.5 + r() * 2; e.steps = Math.round(5000 + r() * 5000);
      e.stress = 1 + Math.floor(r() * 5);
      e.symptoms = { s_mig: ex && r() < pf / pe ? 2 + Math.floor(r() * 3) : 0 };
      es.push(e); d = addDays(d, 1);
    }
    const f = discover(es, { symptoms, factors }).findings.find((x) => x.driver === 'f_x');
    ok(f, `a perfect trigger at ${pe * 100}% exposure / ${pf * 100}% flares must be reported`);
    ok(f.floor < MIN_REPORTABLE_R, 'its floor must reflect what was actually attainable');
  }
});

t('the reporting floor still discards trivia on continuous data', () => {
  // The whole point of the floor. Normalising it must not turn it off where it
  // was doing its job: with distinct values the attainable maximum is 1, so
  // the floor is still a flat 0.20.
  const symptoms = [{ id: 's_a', label: 'Ache', primary: true }];
  const r = mulberry32(17); const es = []; let d = '2026-01-01';
  for (let i = 0; i < 400; i++) {
    const e = emptyEntry(d, symptoms);
    const sleep = 5 + r() * 4;
    e.sleepHours = sleep; e.steps = Math.round(5000 + r() * 5000);
    e.stress = 1 + Math.floor(r() * 5); e.mood = 1 + Math.floor(r() * 5);
    // A real but tiny link: about r = 0.1, far too weak to act on.
    e.symptoms = { s_a: Math.max(0, Math.min(4, Math.round(2 - 0.1 * (sleep - 7) + (r() + r() + r() - 1.5) * 1.3))) };
    es.push(e); d = addDays(d, 1);
  }
  const f = discover(es, { symptoms, factors: [] }).findings.find((x) => x.driver === 'sleepHours' && x.outcome === 's_a');
  ok(!f || Math.abs(f.r) >= 0.20, `a trivial continuous link must still be filtered, got r=${f && f.r}`);
});

t('an episodic symptom is described by how often it happened', () => {
  // "On your red wine days migraine runs 0.31 points higher" is arithmetically
  // true and nearly useless to someone who wants to know whether wine is doing
  // it. The badge was worse: a habit preceding EVERY attack scored r = 0.21
  // against a ceiling of 0.19 and the card said SMALL EFFECT.
  const symptoms = [{ id: 's_mig', label: 'Migraine', primary: true }];
  const factors = [{ id: 'f_x', label: 'Red wine' }];
  const r = mulberry32(9); const es = []; let d = '2026-01-01';
  for (let i = 0; i < 330; i++) {
    const e = emptyEntry(d, symptoms);
    const ex = r() < 0.6 ? 1 : 0;
    e.factors = { f_x: ex };
    e.sleepHours = 6.5 + r() * 2; e.steps = Math.round(5000 + r() * 5000);
    e.stress = 1 + Math.floor(r() * 5);
    e.symptoms = { s_mig: ex && r() < 0.05 / 0.6 ? 2 + Math.floor(r() * 3) : 0 };
    es.push(e); d = addDays(d, 1);
  }
  const f = discover(es, { symptoms, factors }).findings.find((x) => x.driver === 'f_x');
  ok(f, 'the trigger must be found at all');
  eq(f.effect, 'large', 'a trigger that precedes every attack is not a small effect');
  ok(f.practical.episodic, 'a symptom absent on 95% of days is episodic');
  eq(f.practical.lowRate, 0, 'no attacks on the other days');
  ok(f.practical.highRate > 0, 'and some on the exposed ones');
  const said = phrase(f, symptoms, factors);
  ok(/turned up on \d+% of them against \d+% of the rest/.test(said), 'wrong shape: ' + said);
  ok(!/points/.test(said), 'a rate sentence must not also quote a points delta: ' + said);
  ok(/costing you/.test(said), 'and it must still name the direction: ' + said);
});

t('a day-to-day symptom keeps the points wording', () => {
  // The rate framing is for things that mostly do not happen. A symptom
  // present most days has a meaningful average, and "turned up on 96% of them
  // against 91% of the rest" would be a worse sentence than the points one.
  const symptoms = [{ id: 's_ache', label: 'Back ache', primary: true }];
  const r = mulberry32(23); const es = []; let d = '2026-01-01';
  for (let i = 0; i < 300; i++) {
    const e = emptyEntry(d, symptoms);
    const sleep = 5 + r() * 4;
    e.sleepHours = sleep; e.steps = Math.round(5000 + r() * 5000);
    e.symptoms = { s_ache: Math.max(0, Math.min(4, Math.round(3.2 - 0.45 * (sleep - 7) + (r() - 0.5) * 1.1))) };
    es.push(e); d = addDays(d, 1);
  }
  const f = discover(es, { symptoms, factors: [] }).findings.find((x) => x.driver === 'sleepHours');
  ok(f, 'the link must be found');
  ok(!f.practical.episodic, 'a symptom present nearly every day is not episodic');
  ok(/points/.test(phrase(f, symptoms, [])), 'should keep the points wording');
});

t('effectSize is relative to what was attainable', () => {
  // Continuous data is unaffected: the maximum is 1, so the thresholds are the
  // ones they always were.
  eq(effectSize(0.6), 'large');
  eq(effectSize(0.4), 'moderate');
  eq(effectSize(0.25), 'small');
  eq(effectSize(0.1), 'negligible');
  // Where ties compress the ceiling, the label follows the ceiling.
  eq(effectSize(0.19, 0.19), 'large', 'a maxed-out correlation is a large effect');
  eq(effectSize(0.05, 0.19), 'small');
  eq(effectSize(0.4, 0), 'moderate', 'a zero ceiling must not divide by zero');
});

// Every t(...) in this file must run exactly once. A test accidentally nested
// inside another test's loop still passes — it just runs 140 times and is not
// where anyone thinks it is. That happened, and the only reason it surfaced
// was a stale-count message from the copy guard.
const DEFINED = (readFileSync(new URL(import.meta.url), 'utf8').match(/^t\(/gm) || []).length;
if (pass + fail !== DEFINED) {
  console.error(`\n\nBROKEN SUITE: ${DEFINED} tests are defined but ${pass + fail} ran.`);
  console.error('A test is probably nested inside another test\'s body or loop.');
  process.exit(1);
}

console.log(`\n\n${pass} passed, ${fail} failed`);
if (failures.length) {
  console.log('\nFailures:');
  for (const [n, m] of failures) console.log(`  x ${n}\n      ${m}`);
  process.exit(1);
}
