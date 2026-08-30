/**
 * Dependency-free test runner. `node tests/run.mjs`
 * Covers the two things that must not break: scoring monotonicity and the
 * statistical honesty of the insight engine.
 */
import { emptyEntry, addDays, validateEntry, dateKey, daysBetween, completeness, validateSymptoms, validateSymptomRatings, symptomId, SEVERITY_MAX } from '../app/js/model.js';
import { curve, scoreDay, buildReport, simulate, topLeverage, weightedMean, ewma, currentStreak, bioAgeDelta, sleepRegularity } from '../app/js/engine.js';
import { rank, spearman, pearson, benjaminiHochberg, permutationP, discover, correlationCI, weekdayPattern, detrend, conditionalDetrend, linearFit, studentTTwoSided, betai, phrase, weekdayFit, conditionalDeseasonalize, effectiveN, lag1Autocorr } from '../app/js/insights.js';

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
  eq(out.length, 3);
  eq(out[0].id, 's_migraine');
  eq(out.filter((x) => x.primary).length, 1, 'exactly one primary');
  ok(out[2].label.length <= 60, 'labels are bounded');
});
t('validateSymptoms caps the list', () => {
  const many = Array.from({ length: 40 }, (_, i) => ({ label: 'sym' + i }));
  ok(validateSymptoms(many).length <= 12);
});
t('symptomId is a safe slug', () => {
  eq(symptomId('Joint pain!! (left knee)'), 's_joint-pain-left-knee');
  ok(/^s_[a-z0-9-]+$/.test(symptomId('  ??  ')) || symptomId('  ??  ') === 's_symptom');
});
t('symptom ratings are clamped and unknown ids dropped', () => {
  const syms = validateSymptoms([{ label: 'Migraine' }]);
  const r = validateSymptomRatings({ s_migraine: 99, s_nope: 2, junk: 'x' }, syms);
  eq(r.s_migraine, SEVERITY_MAX);
  eq(r.s_nope, undefined);
});
t('a logged day defaults its symptoms to none, not to missing', () => {
  // "I logged today and didn't mark the migraine" means I didn't have one.
  // Leaving it absent would build a series made only of bad days, which
  // correlates with nothing.
  const syms = validateSymptoms([{ label: 'Migraine' }]);
  eq(emptyEntry('2026-01-01', syms).symptoms.s_migraine, 0);
});
t('symptoms survive the validateEntry round-trip', () => {
  const { entry } = validateEntry({ date: '2026-01-01', symptoms: { s_migraine: 3 } });
  eq(entry.symptoms.s_migraine, 3);
});

t('a symptom is explained, and noise symptoms stay silent', () => {
  const syms = validateSymptoms([{ label: 'Migraine' }, { label: 'Bloating' }, { label: 'Joint pain' }]);
  const es = synth(120, 11, (e, i, r) => {
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
    e.symptoms = {
      s_migraine: 0,
      s_bloating: r() < 0.3 ? 1 + Math.floor(r() * 3) : 0,
      's_joint-pain': r() < 0.25 ? 1 + Math.floor(r() * 3) : 0,
    };
  });
  const rn = mulberry32(78);
  for (let i = 1; i < es.length; i++) {
    es[i].symptoms.s_migraine = Math.max(0, Math.min(4,
      Math.round(es[i - 1].alcoholUnits * 0.75 + (rn() - 0.5) * 1.4)));
  }
  const res = discover(es, { symptoms: syms });
  const hit = res.findings.find((f) => f.driver === 'alcoholUnits' && f.outcome === 's_migraine');
  ok(hit, 'the planted symptom driver must be found');
  ok(hit.r > 0.5, 'and at roughly its true strength, got ' + hit.r);
  ok(!res.findings.some((f) => f.outcome === 's_bloating' || f.outcome === 's_joint-pain'),
     'symptoms with no real driver must stay silent');
});

t('each symptom is corrected as its own family', () => {
  // Pooling every symptom into one BH family would mean that tracking a second
  // symptom makes the app worse at explaining the first. Each family must be
  // sized by its own hypotheses only.
  const syms = validateSymptoms([{ label: 'A' }, { label: 'B' }, { label: 'C' }]);
  const es = synth(90, 12, (e, i, r) => {
    e.sleepHours = 6 + r() * 2.5;
    e.steps = Math.round(3000 + r() * 8000);
    e.alcoholUnits = Math.round(r() * 4);
    e.mood = 1 + Math.floor(r() * 5);
    e.symptoms = { s_a: Math.floor(r() * 3), s_b: Math.floor(r() * 3), s_c: Math.floor(r() * 3) };
  });
  const res = discover(es, { symptoms: syms });
  const symFamilies = res.families.filter((f) => f.kind === 'symptom');
  eq(symFamilies.length, 3, 'one family per symptom');
  const sizes = new Set(symFamilies.map((f) => f.tested));
  eq(sizes.size, 1, 'each symptom family is the same size regardless of the others');
  ok(symFamilies[0].tested < res.tested, 'a family must be smaller than the pooled grid');
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
t('bioAge sign is correct', () => {
  ok(bioAgeDelta(88, { age: 40 }).years < 0, 'great habits => younger');
  ok(bioAgeDelta(18, { age: 40 }).years > 0, 'poor habits => older');
});
t('bioAge near zero at population average', () => near(bioAgeDelta(50, { age: 35 }).years, 0, 0.15));
t('bioAge saturates', () => {
  ok(Math.abs(bioAgeDelta(100, { age: 70 }).years) <= 9);
  ok(Math.abs(bioAgeDelta(0, { age: 70 }).years) <= 9);
});
t('bioAge monotonic in score', () => {
  let prev = Infinity;
  for (let s = 0; s <= 100; s += 5) {
    const y = bioAgeDelta(s, { age: 45 }).years;
    ok(y <= prev + 1e-9, `not monotonic at ${s}`);
    prev = y;
  }
});
t('bioAge null-safe', () => eq(bioAgeDelta(null, { age: 40 }), null));

t('simulate averages bedtime on the circular scale', () => {
  // Alternating 23:30 / 00:30 has a raw clock mean of noon; the wrapped mean
  // is midnight. Timing must score like a midnight sleeper, not a noon one.
  const es = ['2026-06-01'].concat(Array.from({ length: 27 }, (_, i) => addDays('2026-06-01', i + 1)))
    .map((d, i) => { const e = emptyEntry(d); e.bedtimeMinutes = i % 2 ? 1410 : 30; return e; });
  const sim = simulate(es, {}, ctx);
  const timing = sim.baseline.pillars.sleep.parts.find((p) => p.key === 'timing').score;
  ok(timing < 60, 'noon artifact: timing scored ' + timing);
  const earlier = simulate(es, { bedtimeMinutes: -45 }, ctx);
  ok(earlier.scoreDelta > 0, 'going to bed earlier must help a post-midnight sleeper, got ' + earlier.scoreDelta);
});
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
t('bioAge hits its documented anchors at the reference age', () => {
  near(bioAgeDelta(85, { age: 35 }).years, -4.5, 0.3);
  near(bioAgeDelta(20, { age: 35 }).years, 4.0, 0.4);
  near(bioAgeDelta(50, { age: 35 }).years, 0, 0.15);
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

t('weekdayPattern finds a planted bad Friday', () => {
  const es = synth(120, 11, (e, i, r) => { e.sleepHours = 7 + r() * 0.5; e.steps = 8000; });
  const scoreFn = (e) => (new Date(...e.date.split('-').map((v, i) => (i === 1 ? +v - 1 : +v))).getDay() === 5 ? 60 : 78);
  const wp = weekdayPattern(es, scoreFn);
  eq(wp.worst.day, 'Friday');
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
  for (const k of ['today','avg7','avg28','sustained','pillarAverages','trendPerWeek','streak','bioAge','confidence','loggedDays']) {
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
t('simulate: improvement reduces bio age', () => {
  const s = simulate(demo, { sleepHours: 1, steps: 4000, produceServings: 3 }, ctx);
  ok(s.yearsDelta < 0, 'got ' + s.yearsDelta);
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

/* ================= report ================= */
console.log(`\n\n${pass} passed, ${fail} failed`);
if (failures.length) {
  console.log('\nFailures:');
  for (const [n, m] of failures) console.log(`  x ${n}\n      ${m}`);
  process.exit(1);
}
