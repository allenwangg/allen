/**
 * registry.js — what many verified n-of-1 trials say together.
 *
 * One certificate answers "did this work for me". A pile of them answers a
 * question nobody can currently answer at all: **what fraction of people who
 * genuinely tested this actually responded?** Not "is the average effect
 * non-zero" — that is what an RCT already tells you, and it is the wrong
 * question when a treatment works brilliantly for one person in five and does
 * nothing for the rest. The average of that is a small effect nobody
 * experiences.
 *
 * WHY THIS COULD NOT BE BUILT BEFORE. Aggregating self-reported experiments
 * gives you a database of testimonials: people run several, report the one that
 * worked, and the pile is worthless in a way no amount of sample size fixes.
 * Certificates are checkable — the p-value is rederivable from the numbers
 * carried with it, and the design is bound to a code committed before the data
 * existed — so a contribution can be rejected on arithmetic rather than trust.
 *
 * WHAT KEEPS IT HONEST. Not verification. Verification stops fabricated
 * results; it does nothing about **selective contribution**, which is the
 * bigger problem by far. If people only send in the trials that worked, every
 * cohort here reads as a miracle.
 *
 * The defence is the same one clinical trial registries were invented for: the
 * registration exists before the result does. A cohort therefore counts
 * REGISTRATIONS as its denominator, not certificates, and reports how many
 * registered trials never reported back. A cohort with 40% reporting is not a
 * finding, it is a warning, and this module says so rather than quietly
 * averaging what arrived.
 */

import { binomTailGE } from './safety.js';

/** Trials are called responders at this threshold; also the null rate below. */
export const RESPONDER_ALPHA = 0.05;

/**
 * Below this share of registered trials reporting back, a cohort is not
 * summarised as evidence.
 *
 * Not a statistical constant — a judgement about how much missingness makes a
 * responder rate meaningless. At 60% reporting, a cohort showing 20% responders
 * is consistent with anything from 12% to 52% depending on which trials went
 * missing, and the honest move is to show the range rather than the point.
 */
export const MIN_REPORTING = 0.6;

/** The key a cohort is grouped under: one change tested against one outcome. */
export const cohortKey = (leverId, outcomeKind) => `${leverId}|${outcomeKind}`;

/**
 * Aggregate verified certificates into per-cohort answers.
 *
 * `registrations` is the count of trials registered per cohort — the
 * denominator. Pass it and the result can report what is missing; omit it and
 * the module says the reporting rate is unknown rather than assuming it is 1,
 * because assuming it is 1 is exactly the optimistic error that makes these
 * datasets lie.
 *
 * `certs` must already have been checked; this module aggregates, it does not
 * authenticate. It does re-reject anything whose stated verdict disagrees with
 * its own p-value, since that costs one comparison and catches a contributor
 * whose client is wrong or dishonest in a way the checker upstream might pass.
 */
export function cohorts(certs, { registrations = null } = {}) {
  const byKey = new Map();
  const rejected = [];
  const seen = new Set();

  for (const c of certs || []) {
    if (!c || !c.leverLabel || !Array.isArray(c.pairDiffs)) { rejected.push('malformed'); continue; }
    // One trial, one vote. A duplicate is not extra evidence, and re-sending a
    // good result is the cheapest way to skew a cohort.
    const id = c.digest || c.trialId;
    if (!id || seen.has(id)) { rejected.push('duplicate'); continue; }
    seen.add(id);

    const responded = c.p != null && c.p <= RESPONDER_ALPHA;
    if (responded && c.verdict && c.verdict !== 'helped' && c.verdict !== 'hurt') {
      rejected.push('verdict disagrees with p-value'); continue;
    }
    const key = cohortKey(c.leverId || c.leverLabel, c.outcomeKind || c.outcomeLabel);
    if (!byKey.has(key)) {
      byKey.set(key, { key, lever: c.leverLabel, outcome: c.outcomeLabel, reported: 0,
                       helped: 0, hurt: 0, noEffect: 0, effects: [] });
    }
    const g = byKey.get(key);
    g.reported++;
    if (!responded) g.noEffect++;
    else if (c.verdict === 'hurt' || (c.verdict == null && c.observedDiff > 0)) g.hurt++;
    else g.helped++;
    if (Number.isFinite(c.observedDiff)) g.effects.push(c.observedDiff);
  }

  const out = [...byKey.values()].map((g) => summarise(g, registrations?.[g.key] ?? null));
  out.sort((a, b) => b.reported - a.reported);
  return { cohorts: out, rejected: rejected.length, rejectedReasons: rejected };
}

/** Wilson score interval — behaves at 0 and 1, unlike the normal approximation. */
export function wilson(successes, n, z = 1.96) {
  if (!n) return null;
  const p = successes / n;
  const d = 1 + (z * z) / n;
  const centre = p + (z * z) / (2 * n);
  const half = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [Math.max(0, (centre - half) / d), Math.min(1, (centre + half) / d)];
}

function summarise(g, registered) {
  const n = g.reported;
  const responders = g.helped + g.hurt;
  const rate = n ? responders / n : 0;
  const ci = wilson(responders, n);

  // Is the responder rate more than the false positives you would get if
  // nobody responded at all? At alpha = 0.05 you expect one trial in twenty to
  // come back significant by luck, so a cohort at 5% is not evidence of
  // anything and must never be presented as "1 in 20 people were helped".
  const pVsNull = n ? binomTailGE(responders, n, RESPONDER_ALPHA) : 1;

  const reporting = registered ? n / registered : null;
  const missing = registered ? Math.max(0, registered - n) : null;

  // The bound that matters when trials are missing: if every one of them found
  // nothing, what is the responder rate? Contributors who only send in wins
  // push the reported rate up and this number is what survives that.
  const worstCase = registered ? responders / Math.max(registered, 1) : null;

  const sorted = [...g.effects].sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;

  let status;
  if (n < 5) status = 'too-few';
  else if (reporting != null && reporting < MIN_REPORTING) status = 'under-reported';
  else if (pVsNull > 0.05) status = 'no-signal';
  else status = 'signal';

  return {
    ...g, responders, rate: round3(rate), ci: ci ? ci.map(round3) : null,
    pVsNull: round4(pVsNull), registered, reporting: reporting == null ? null : round3(reporting),
    missing, worstCase: worstCase == null ? null : round3(worstCase),
    medianEffect: median, status, headline: headline({ ...g, n, responders, rate, ci, pVsNull, registered, reporting, worstCase, status }),
  };
}

function pct(x) { return `${Math.round(x * 100)}%`; }
const round3 = (x) => Math.round(x * 1000) / 1000;
const round4 = (x) => Math.round(x * 10000) / 10000;

/**
 * The sentence a cohort is allowed to say about itself.
 *
 * Deliberately refuses to produce an encouraging number in three of the four
 * cases. A registry whose every row reads "23% of people were helped" is how
 * this stops being evidence and starts being marketing.
 */
function headline(g) {
  const what = `${g.lever} against ${g.outcome}`;
  if (g.status === 'too-few') {
    return `${g.n} ${g.n === 1 ? 'person has' : 'people have'} tested ${what}. Too few to say anything yet.`;
  }
  if (g.status === 'under-reported') {
    return `Of ${g.registered} people who registered a trial of ${what}, only ${g.n} reported back. `
      + `Among those, ${pct(g.rate)} found an effect — but if the ${g.registered - g.n} missing trials `
      + `found nothing, the true figure is nearer ${pct(g.worstCase)}. Not enough of them came back to say which.`;
  }
  if (g.status === 'no-signal') {
    return `${g.n} people have tested ${what}, and ${pct(g.rate)} found an effect — which is about what `
      + `you would expect by luck alone if it did nothing for anyone. No sign of a responder group here.`;
  }
  return `${g.n} people have tested ${what}. ${pct(g.rate)} found an effect `
    + `(${pct(g.ci[0])}–${pct(g.ci[1])}), more than chance would give`
    + (g.reporting != null && g.reporting < 1
      ? `. ${pct(g.reporting)} of registered trials reported back, so the figure could be as low as ${pct(g.worstCase)}.`
      : '.');
}
