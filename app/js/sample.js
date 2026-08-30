/**
 * sample.js — Example data.
 *
 * The analysis needs about three weeks of logging before it can say anything
 * honest, which is a long time to wait before you can tell whether this app is
 * any use to you. This loads 90 example days so every view has something in it
 * and you can see what the thing actually does.
 *
 * It is example data, not yours. So:
 *   - a banner says so on every screen while it is loaded,
 *   - your own logging is blocked until you clear it, so the two can never mix,
 *   - clearing removes every trace and leaves a clean, empty app.
 *
 * The generator plants two real relationships (drinking suppresses next-day
 * energy; late caffeine costs sleep quality) so the analysis has something true
 * to find, plus a weekend rhythm so the weekday view has a story too.
 */

import { emptyEntry, addDays, dateKey } from './model.js';

/** Deterministic PRNG — the same example data every time, and testable. */
function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const SAMPLE_DAYS = 90;

export function generateSampleData(endDate = dateKey()) {
  const rnd = mulberry32(20260830);
  const entries = [];
  let d = addDays(endDate, -(SAMPLE_DAYS - 1));

  for (let i = 0; i < SAMPLE_DAYS; i++) {
    const e = emptyEntry(d);
    const p = i / (SAMPLE_DAYS - 1);            // slow improvement over the window
    const [y, m, dd] = d.split('-').map(Number);
    const dow = new Date(y, m - 1, dd).getDay();
    const weekend = dow === 0 || dow === 6;
    const friday = dow === 5;

    e.sleepHours = round2(6.3 + p * 0.9 + rnd() * 1.1 + (weekend ? 0.5 : 0) - (friday ? 0.6 : 0));
    e.bedtimeMinutes = clampMin(1290 + Math.round(rnd() * 80) + (friday ? 75 : 0) - Math.round(p * 25), 0);
    e.steps = Math.round(4300 + p * 3200 + rnd() * 4200 + (weekend ? 1200 : 0));
    e.exerciseMinutes = i % 2 === 0 ? Math.round(12 + p * 28 + rnd() * 22) : Math.round(rnd() * 12);
    e.exerciseIntensity = e.exerciseMinutes > 25 ? 1 + Math.round(rnd()) : rnd() < 0.4 ? 1 : 0;
    e.strengthSession = i % 3 === 0 ? 1 : 0;
    e.proteinGrams = Math.round(76 + p * 40 + rnd() * 34);
    e.produceServings = Math.round(1.5 + p * 2 + rnd() * 2.4);
    e.ultraProcessed = Math.max(0, Math.round(4.2 - p * 2 + rnd() * 2.2));
    e.fiberGrams = Math.round(15 + p * 9 + rnd() * 11);
    e.hydrationLitres = round2(Math.round((1.3 + p * 0.8 + rnd() * 0.9) * 4) / 4);
    e.alcoholUnits = weekend || friday ? Math.round(rnd() * 4.6) : rnd() < 0.2 ? 1 : 0;
    e.caffeineAfter2pm = rnd() < 0.4 ? Math.round(1 + rnd() * 3) * 50 : 0;
    e.nicotine = 0;
    e.stress = clamp15(Math.round(3.5 - p * 0.8 + rnd() * 1.6 - (weekend ? 0.8 : 0)));
    e.mood = clamp15(Math.round(2.8 + p * 1.0 + rnd() * 1.4));
    e.sunlightMinutes = Math.round(10 + p * 25 + rnd() * 35 + (weekend ? 20 : 0));
    e.socialMinutes = Math.round(rnd() * 150 + (weekend ? 90 : 0));
    e.restingHR = Math.round(65 - p * 5 + rnd() * 5);
    e.hrv = Math.round(35 + p * 12 + rnd() * 11);
    e.bodyweightKg = round1(83.5 - p * 3.5 + rnd() * 0.8);
    e.waistCm = round1(93 - p * 4 + rnd() * 1.2);
    e.energy = 3;                                // overwritten below
    e.notes = i === SAMPLE_DAYS - 1 ? 'This is example data — clear it from the banner to start your own log.' : '';
    entries.push(e);
    d = addDays(d, 1);
  }

  // Planted effect 1: yesterday's drinks suppress today's energy. This is the
  // one the insight engine should headline.
  const rn = mulberry32(777001);
  entries[0].energy = 3;
  for (let i = 1; i < entries.length; i++) {
    entries[i].energy = clamp15(Math.round(4.4 - entries[i - 1].alcoholUnits * 0.55 + (rn() - 0.5) * 1.9));
  }

  // Planted effect 2: late caffeine degrades that night's sleep quality.
  const rq = mulberry32(777002);
  for (const e of entries) {
    const base = 2.6 + (e.sleepHours - 6.5) * 0.35;
    e.sleepQuality = clamp15(Math.round(base - e.caffeineAfter2pm * 0.008 + (rq() - 0.5) * 1.3));
  }

  return entries;
}

const round1 = (x) => Math.round(x * 10) / 10;
const round2 = (x) => Math.round(x * 100) / 100;
const clamp15 = (x) => Math.max(1, Math.min(5, x));
const clampMin = (x, lo) => Math.max(lo, x);

export const SAMPLE_PROFILE = { age: 42, weightKg: 81 };
