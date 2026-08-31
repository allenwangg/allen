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
 * Evaluate every rule, minus anything the person has already acknowledged
 * recently. Returns at most two flags: a wall of warnings is a wall nobody
 * reads, and the most important one is the one at the top.
 */
export function checkFlags(entries, ctx = {}, today = dateKey()) {
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

    if (seenAt && daysBetween(seenAt, today) < SNOOZE_DAYS) {
      const worsened = Number.isFinite(seenSeverity) && Number.isFinite(flag.severity)
        && flag.severity >= seenSeverity * REOPEN_ON_WORSENING;
      if (!worsened) continue;
      out.push({ ...flag, id, kind: rule.kind || 'general', reopened: true });
      continue;
    }
    out.push({ ...flag, id, kind: rule.kind || 'general' });
  }
  return out.slice(0, 2);
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
