/**
 * timeline.js — put a series back on the calendar.
 *
 * THE BUG THIS EXISTS TO KILL. Every chart in this app was built by mapping
 * over the *logged entries*:
 *
 *     entries.map((e) => ({ date: e.date, value: e.symptoms?.[id] ?? null }))
 *
 * which silently deletes the days you did not log. Measured on a 31-day month
 * with ten days logged at severity 1, a fortnight of nothing, then a week at
 * severity 4: the chart drew ONE UNBROKEN LINE through seventeen evenly spaced
 * points and described itself as "17 points from 2026-03-01 to 2026-03-31".
 *
 * Read that chart as a clinician and you see a symptom climbing steadily from
 * mild to very bad across a month. What happened was ten mild days, a
 * fortnight of silence, and then a week of very bad ones — which is a different
 * illness, and arguably a different conversation.
 *
 * It is the same failure as the one that had the app printing sleep hours
 * nobody entered, in a different medium: an absence rendered as data. Breaking
 * the line is not enough on its own either, because the x-axis is positional —
 * seventeen points across the full width of a 31-day chart puts every single
 * one of them in the wrong place.
 *
 * SO: the axis is the calendar, one slot per day, and a day with no entry is a
 * null in its own slot. The line breaks (charts.js already handles nulls
 * correctly once they are actually there), the surviving points land on their
 * true dates, and the gap gets drawn as a marked absence rather than left as
 * ambiguous white space — because a reader cannot tell blank-because-nothing
 * -happened from blank-because-nobody-asked, and the difference decides whether
 * the chart means anything.
 *
 * WHY THE WINDOW IS COUNTED IN DAYS, NOT ENTRIES. The call sites used
 * `.slice(-60)` — the last sixty *logged* days. For someone who logs twice a
 * week that reaches back seven months while the caption says sixty days. A
 * window has to be a window of time or it is not a window.
 */

import { addDays, daysBetween } from './model.js';

/**
 * The longest calendar span we will ever lay out.
 *
 * Someone who logged once last year and once today has a 400-slot axis, which
 * is a legible chart. Beyond that the slots are sub-pixel and the whole thing
 * is a smear, so the window anchors on the recent end and says so.
 */
export const MAX_SPAN_DAYS = 400;

/** Gaps shorter than this are shown by the break in the line alone. */
export const MIN_SHADED_GAP = 2;

/**
 * Lay a sparse series out on a continuous daily axis.
 *
 * @param {{date:string}[]} entries  logged days, any order
 * @param {(e:object)=>number|null} value  what to plot
 * @param {object} opts
 * @param {number} [opts.days]  trailing window in CALENDAR days
 * @param {string} [opts.to]    last day of the window (default: last logged day)
 * @returns {{points:{date:string,value:number|null,logged:boolean}[],
 *            gaps:{from:string,to:string,days:number,start:number,end:number}[],
 *            span:number, logged:number, missing:number, coverage:number,
 *            longestGap:number, truncated:boolean}}
 */
export function onCalendar(entries, value = (e) => e.value, opts = {}) {
  const rows = (entries || []).filter((e) => e && typeof e.date === 'string');
  const empty = {
    points: [], gaps: [], span: 0, logged: 0, missing: 0,
    coverage: 0, longestGap: 0, truncated: false,
  };
  if (!rows.length) return empty;

  const byDate = new Map();
  for (const e of rows) byDate.set(e.date, e);
  const keys = [...byDate.keys()].sort();

  const last = opts.to || keys[keys.length - 1];
  let first = keys[0];
  // A window given in days is measured back from the end of the window, so the
  // caption and the axis agree even when the log inside it is sparse.
  if (opts.days > 0) {
    const windowStart = addDays(last, -(Math.floor(opts.days) - 1));
    if (windowStart > first) first = windowStart;
  }
  let truncated = false;
  if (daysBetween(first, last) + 1 > MAX_SPAN_DAYS) {
    first = addDays(last, -(MAX_SPAN_DAYS - 1));
    truncated = true;
  }

  const span = daysBetween(first, last) + 1;
  if (span <= 0) return empty;

  const points = [];
  for (let i = 0, d = first; i < span; i++, d = addDays(d, 1)) {
    const e = byDate.get(d);
    // `logged` and `value != null` are different facts and both matter: a day
    // can be logged with this particular field left blank. That is a gap in
    // this series but not a gap in the diary, and telling the person "you
    // missed 14 days" when they logged all 14 and simply never weighed
    // themselves would be a false accusation.
    const v = e ? value(e) : null;
    points.push({ date: d, value: Number.isFinite(v) ? v : null, logged: !!e });
  }

  // Runs of unlogged days, which is the honest definition of a gap here.
  const gaps = [];
  let run = -1;
  for (let i = 0; i <= points.length; i++) {
    const out = i < points.length && !points[i].logged;
    if (out && run < 0) run = i;
    if (!out && run >= 0) {
      gaps.push({
        from: points[run].date, to: points[i - 1].date,
        days: i - run, start: run, end: i - 1,
      });
      run = -1;
    }
  }

  const logged = points.filter((p) => p.logged).length;
  return {
    points, gaps, span, logged,
    missing: span - logged,
    coverage: Math.round((logged / span) * 100),
    longestGap: gaps.reduce((a, g) => Math.max(a, g.days), 0),
    truncated,
  };
}

/**
 * One sentence a reader can hold the chart to.
 *
 * Coverage is the number that decides how much the shape is worth, so it is
 * stated rather than left to be inferred from how dotty the line looks.
 */
export function coverageNote(tl, { what = 'these days' } = {}) {
  if (!tl || !tl.span) return null;
  if (!tl.missing) return `Every one of the ${tl.span} days is logged.`;
  const worst = tl.longestGap > 1 ? ` The longest unlogged stretch is ${tl.longestGap} days.` : '';
  return `${tl.logged} of these ${tl.span} days are logged (${tl.coverage}%); `
    + `the shaded stretches are days with no entry, not days without ${what}.${worst}`;
}
