/**
 * safety.js — When to stop logging and go and see someone.
 *
 * Once an app tracks real symptoms it will sometimes hold data that means the
 * person should be talking to a doctor rather than to a notebook. This module
 * is the part that says so.
 *
 * THE RULES IT FOLLOWS.
 *
 * Never a diagnosis. Every message says a pattern is worth MENTIONING, never
 * what it might be. Naming a condition would be both wrong (there is no
 * clinician here, and self-reported data cannot support it) and cruel (the
 * named condition is the only thing anyone would remember).
 *
 * Never reassurance either. "Probably nothing" is not this app's to say, and
 * getting it wrong is worse than any false alarm.
 *
 * Crying wolf has a cost. A flag that fires constantly gets ignored, and the
 * one time it matters it will be ignored too. So the thresholds are
 * deliberately conservative, every rule needs enough data before it can speak,
 * and a flag that has been seen goes quiet for a month rather than nagging
 * every morning about a situation the person already knows about.
 *
 * Nothing here is transmitted. There is no server, no account and no report to
 * anyone. These messages exist on the device, for one reader.
 */

import { dateKey, addDays, daysBetween } from './model.js';

/** How long a dismissed flag stays quiet before it may speak again. */
export const SNOOZE_DAYS = 30;

/**
 * How much worse a dismissed situation must get to speak up again anyway.
 *
 * The snooze exists so the app does not nag every morning about something the
 * person already knows and is already dealing with. It must not become a way
 * of going quiet while things deteriorate: someone whose mood drops from four
 * low days a fortnight to twelve, or whose weight loss doubles, is in a
 * different situation from the one they acknowledged, and the acknowledgement
 * should not carry over to it.
 *
 * Expressed as a proportion so it scales with whatever each rule measures.
 */
export const REOPEN_ON_WORSENING = 1.5;

/**
 * Rules whose severity is a COUNT OF DAYS IN A FIXED WINDOW cannot grow by
 * half again once they are near the top of that window: low mood maxes out at
 * 14 of the last 14 days, and 14 >= 14 * 1.5 is never true. So the person
 * whose situation is worst — the one the reopen was written for — was the one
 * it could never reach.
 *
 * For those rules a reopen instead needs a fixed absolute step, which a
 * saturated count can still clear from a lower starting point, plus a
 * near-maximum override so an acknowledged flag that then saturates speaks up
 * once more rather than going quiet for a month at its worst.
 */
export const COUNT_RULES = new Set(['low-mood', 'persistent-symptom', 'symptom-worsening']);

/**
 * P(X >= k) for X ~ Binomial(n, p), computed iteratively from the pmf so that
 * no factorial is ever formed. Exact for the sizes this file deals with.
 */
export function binomTailGE(k, n, p) {
  if (k <= 0) return 1;
  if (k > n) return 0;
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  let term = Math.pow(1 - p, n);      // P(X = 0)
  let cum = term;
  for (let i = 1; i < k; i++) {
    term *= ((n - i + 1) / i) * (p / (1 - p));
    cum += term;
  }
  return Math.max(0, Math.min(1, 1 - cum));
}

export const REOPEN_COUNT_STEP = 3;
export const SATURATION_RATIO = 0.92;

const within = (entries, days, today) => {
  const from = addDays(today, -(days - 1));
  return entries.filter((e) => e.date >= from && e.date <= today);
};

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/* ------------------------------------------------------------------ *
 * The rules
 *
 * Each returns a flag object or null. Thresholds lean on ordinary clinical
 * rules of thumb (5% unintentional weight loss; two weeks of persistent low
 * mood) rather than on anything invented here, and each rule states the
 * observation rather than an interpretation of it.
 * ------------------------------------------------------------------ */

export const RULES = [
  {
    id: 'weight-loss',
    minDays: 60,
    check(entries, today) {
      const recent = within(entries, 21, today).map((e) => e.bodyweightKg).filter((v) => v != null);
      const before = within(entries, 90, today)
        .filter((e) => e.date < addDays(today, -60))
        .map((e) => e.bodyweightKg).filter((v) => v != null);
      if (recent.length < 5 || before.length < 5) return null;
      const now = mean(recent), then = mean(before);
      const pct = ((then - now) / then) * 100;
      // 5% over about three months is the usual threshold for "worth asking
      // about", and only when it was not deliberate — which the app cannot
      // know, so the message asks rather than assumes.
      if (pct < 5) return null;
      return {
        severity: pct,
        title: 'Your weight has dropped noticeably',
        detail: `You are down about ${pct.toFixed(1)}% (${(then - now).toFixed(1)} kg) over the last three months.`,
        ask: 'If you were not trying to lose weight, this is the kind of thing worth mentioning to a doctor.',
      };
    },
  },
  {
    id: 'resting-hr-up',
    minDays: 56,
    check(entries, today) {
      const recent = within(entries, 21, today).map((e) => e.restingHR).filter((v) => v != null);
      const before = within(entries, 90, today)
        .filter((e) => e.date < addDays(today, -42))
        .map((e) => e.restingHR).filter((v) => v != null);
      if (recent.length < 10 || before.length < 10) return null;
      const rise = mean(recent) - mean(before);
      if (rise < 8) return null;
      return {
        severity: rise,
        title: 'Your resting heart rate has been climbing',
        detail: `It is averaging about ${Math.round(rise)} bpm higher over the last three weeks than it was a month or two ago (${Math.round(mean(before))} to ${Math.round(mean(recent))}).`,
        ask: 'Plenty of ordinary things do this — illness, stress, poor sleep, alcohol, a new medication. It is worth a mention if it stays up.',
      };
    },
  },
  {
    id: 'low-mood',
    minDays: 14,
    kind: 'mood',
    check(entries, today) {
      const days = within(entries, 14, today).map((e) => e.mood).filter((v) => v != null);
      if (days.length < 10) return null;
      const low = days.filter((m) => m <= 2).length;
      if (low < 10) return null;
      return {
        // More low days is worse; used to reopen a dismissed card if this
        // gets materially worse rather than waiting out the snooze.
        severity: low,
        severityMax: days.length,
        title: 'It has been a hard couple of weeks',
        detail: `You have rated your mood low on ${low} of the last ${days.length} days you logged.`,
        ask: 'Two weeks of feeling like this is the point at which talking to a doctor is genuinely worth it — not because something is wrong with you, but because this is treatable and you do not have to wait it out alone.',
        support: true,
      };
    },
  },
  {
    id: 'persistent-symptom',
    minDays: 14,
    check(entries, today, ctx) {
      const symptoms = ctx?.symptoms || [];
      for (const sym of symptoms) {
        if (sym.archivedAt) continue;
        const days = within(entries, 14, today)
          .map((e) => e.symptoms?.[sym.id]).filter((v) => v != null);
        if (days.length < 10) continue;
        const bad = days.filter((v) => v >= 3).length;
        if (bad < 10) continue;
        return {
          severity: bad,
          severityMax: days.length,
          id: `persistent-symptom:${sym.id}`,
          title: `Your ${sym.label.toLowerCase()} has not let up`,
          detail: `You have rated it severe or worse on ${bad} of the last ${days.length} days.`,
          ask: 'Something this persistent is worth having looked at properly rather than tracked for longer. Take the report with you.',
        };
      }
      return null;
    },
  },
  {
    /**
     * The same symptom, happening more often than it used to.
     *
     * WHY SEVERITY RULES MISS THIS. Both symptom rules above key on mean
     * severity, which is the wrong instrument for anything episodic — the
     * failure that ran through the whole engine. Someone whose migraine goes
     * from two attacks a month to eight has quadrupled the thing that matters
     * and moved their 28-day mean by about 0.6 of a point, under the 1.0
     * threshold, while never coming close to "severe on 10 of the last 14
     * days". Measured on exactly that log: no flag at all. Escalating attack
     * frequency is a textbook reason to be seen, and the app said nothing.
     *
     * THE TEST. Counting events in two windows is a two-rate comparison, and
     * conditional on the total there is an exact one: if the rate were
     * unchanged, the number of recent attacks among all of them is
     * Binomial(total, recentDays / allDays). No simulation and no
     * approximation, which matters because this is the one part of the app
     * that tells someone to go and see a person about it.
     */
    id: 'symptom-more-often',
    minDays: 56,
    check(entries, today, ctx) {
      const symptoms = ctx?.symptoms || [];
      for (const sym of symptoms) {
        if (sym.archivedAt) continue;
        const recent = within(entries, 28, today).map((e) => e.symptoms?.[sym.id]).filter((v) => v != null);
        // A long baseline: episodic symptoms are counted in events, not days,
        // and 28 days of history carries too few events to compare against.
        const before = within(entries, 196, today)
          .filter((e) => e.date < addDays(today, -28))
          .map((e) => e.symptoms?.[sym.id]).filter((v) => v != null);
        if (recent.length < 20 || before.length < 42) continue;

        const k1 = recent.filter((v) => v > 0).length;
        const k2 = before.filter((v) => v > 0).length;
        const total = k1 + k2;
        // Nothing to compare, or so frequent that a rate is the wrong lens and
        // the persistent-symptom rule above is the right one.
        if (total < 6 || k1 < 4) continue;
        if (k1 / recent.length > 0.6) continue;

        const share = recent.length / (recent.length + before.length);
        // Alpha 0.005, not the 0.05 or 0.01 that would look conservative on a
        // single test. This rule is re-evaluated EVERY DAY, so what a person
        // experiences is the chance it ever fires, not the chance it fires
        // today. Measured on symptoms that never change, over 120 days of
        // daily checks: 7.6% of people are falsely alarmed at 0.01 and 4.8% at
        // 0.005, against 0.6% and 0.3% on any given day. Repeated looks at
        // accumulating data is a multiple-comparisons problem like any other,
        // and this rule tells someone to go and be seen.
        const p = binomTailGE(k1, total, share);
        if (p > 0.005) continue;

        // Statistical significance is not the same as being worth someone's
        // afternoon: also require the rate to have at least doubled.
        const rateNow = k1 / recent.length, rateBefore = k2 / before.length;
        if (rateBefore > 0 && rateNow < rateBefore * 2) continue;

        const perMonth = (r) => Math.round(r * 30 * 10) / 10;
        return {
          severity: rateNow - rateBefore,
          id: `symptom-more-often:${sym.id}`,
          title: `Your ${sym.label.toLowerCase()} is happening more often`,
          detail: `It turned up on ${k1} of the last ${recent.length} days — about ${perMonth(rateNow)} `
            + `days a month, against ${perMonth(rateBefore)} across the ${before.length} logged days before that.`,
          ask: 'A symptom becoming more frequent is worth raising even when each episode is no worse than it was. Take the report with you.',
        };
      }
      return null;
    },
  },
  {
    id: 'symptom-worsening',
    minDays: 42,
    check(entries, today, ctx) {
      const symptoms = ctx?.symptoms || [];
      for (const sym of symptoms) {
        if (sym.archivedAt) continue;
        const recent = within(entries, 21, today).map((e) => e.symptoms?.[sym.id]).filter((v) => v != null);
        const before = within(entries, 63, today)
          .filter((e) => e.date < addDays(today, -21))
          .map((e) => e.symptoms?.[sym.id]).filter((v) => v != null);
        if (recent.length < 10 || before.length < 10) continue;
        const rise = mean(recent) - mean(before);
        // A full point on a five-point scale, sustained over three weeks.
        if (rise < 1) continue;
        return {
          severity: rise,
          id: `symptom-worsening:${sym.id}`,
          title: `Your ${sym.label.toLowerCase()} is getting worse, not better`,
          detail: `Over the last three weeks it has averaged about ${rise.toFixed(1)} points higher than the month before.`,
          ask: 'A symptom that is trending the wrong way over weeks is worth raising, even if each individual day feels manageable.',
        };
      }
      return null;
    },
  },
];

/**
 * Evaluate every rule.
 *
 * By default this returns the BANNER list: anything acknowledged recently is
 * skipped, and at most two are shown, because a wall of warnings is a wall
 * nobody reads.
 *
 * Pass `{ all: true }` for the unfiltered, untruncated set. The report needs
 * that, and reading the banner list there was a real bug: tapping "I've seen
 * this" — the only acknowledgement the card offers, sitting next to a button
 * labelled "Put it in the report" — silently removed that flag from the
 * printed handout for thirty days, and with five rules firing the report
 * showed two of them in declaration order. Acknowledging a message on screen
 * is not the same act as deciding not to mention it to a doctor.
 */
export function checkFlags(entries, ctx = {}, today = dateKey(), opts = {}) {
  const dismissed = ctx.dismissedFlags || {};
  const out = [];
  for (const rule of RULES) {
    if (entries.length < rule.minDays) continue;
    let flag;
    try { flag = rule.check(entries, today, ctx); } catch { flag = null; }
    if (!flag) continue;
    const id = flag.id || rule.id;
    const record = dismissed[id];
    // Older records are a bare date string; newer ones carry the severity that
    // was acknowledged.
    const seenAt = typeof record === 'string' ? record : record?.at;
    const seenSeverity = typeof record === 'object' ? record?.severity : null;

    if (!opts.all && seenAt && daysBetween(seenAt, today) < SNOOZE_DAYS) {
      const ruleKey = id.split(':')[0];
      const isCount = COUNT_RULES.has(ruleKey);
      const max = Number.isFinite(flag.severityMax) ? flag.severityMax : null;
      const worsened = Number.isFinite(seenSeverity) && Number.isFinite(flag.severity) && (
        isCount
          // A count in a fixed window: a fixed step it can actually reach, or
          // reaching the top of that window having been acknowledged lower.
          ? (flag.severity >= seenSeverity + REOPEN_COUNT_STEP
             || (max != null && flag.severity >= max * SATURATION_RATIO && seenSeverity < max * SATURATION_RATIO))
          : flag.severity >= seenSeverity * REOPEN_ON_WORSENING
      );
      if (!worsened) continue;
      out.push({ ...flag, id, kind: rule.kind || 'general', reopened: true });
      continue;
    }
    out.push({ ...flag, id, kind: rule.kind || 'general' });
  }
  return opts.all ? out : out.slice(0, 2);
}

/**
 * A very narrow check on the free-text notes for an explicit statement of
 * self-harm.
 *
 * Deliberately narrow. This is someone's private journal in an app that
 * promises nothing leaves the device, and a keyword scanner that fires on "this
 * headache is killing me" would be both useless and a small betrayal. It
 * matches first-person present-tense statements only, and it exists because the
 * cost of missing the real thing is not symmetrical with the cost of a false
 * alarm.
 *
 * Nothing is stored, counted, or sent anywhere. The only effect is that a quiet
 * card appears on this device.
 */
export function checkNotesForCrisis(text) {
  if (typeof text !== 'string' || text.length < 8) return false;
  const t = text.toLowerCase();
  const patterns = [
    /\bi (want|wanted) to (die|kill myself|end (it|my life))\b/,
    /\bi(?:'m| am)? (?:going to |gonna )?kill(?:ing)? myself\b/,
    /\bi (want|wanted) to hurt myself\b/,
    /\b(?:i(?:'m| am)? )?better off dead\b/,
    /\bend(ing)? my life\b/,
    /\bi can'?t (?:go on|keep going|do this any\s?more)\b.*\b(?:die|dying|dead|alive)\b/,
  ];
  return patterns.some((re) => re.test(t));
}

/**
 * Support routes, written for someone who is not in the mood to be managed.
 * No hotline number is hardcoded because this app has no idea what country it
 * is in, and a wrong number is worse than none.
 */
export const SUPPORT = {
  title: 'This is worth telling someone about',
  body: 'Feeling like this for weeks is not something you have to sort out on your own, and it is not something a tracking app can help with. A doctor is the most useful person to tell — this is common, and it is treatable.',
  routes: [
    { label: 'Find a helpline in your country', href: 'https://findahelpline.com', note: 'free, confidential, most countries' },
    { label: 'If you are in immediate danger', href: null, note: 'call your local emergency number' },
  ],
  footer: 'Nothing you have written here has been sent anywhere. This message appeared on your device only.',
};
