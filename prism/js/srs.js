/* Prism — spaced repetition scheduler (SM-2 derived).
   Grades: 0 = Again, 1 = Hard, 2 = Good, 3 = Easy. */
(function () {
  'use strict';

  var MIN_EASE = 1.3;
  var START_EASE = 2.5;
  var MAX_IVL_DAYS = 365;
  var MIN_MS = 60 * 1000;
  var DAY_MS = 24 * 60 * 60 * 1000;

  function newItem(id, courseId, lessonId, front, back, now) {
    return {
      id: id, courseId: courseId, lessonId: lessonId,
      front: front, back: back,
      state: 'new',            // new | learning | review
      step: 0,
      ease: START_EASE,
      ivl: 0,                  // days, meaningful in review state
      due: now,
      reps: 0, lapses: 0,
      addedAt: now
    };
  }

  function clampIvl(d) { return Math.max(1, Math.min(MAX_IVL_DAYS, Math.round(d))); }

  function grade(item, g, now) {
    item.reps += 1;
    if (item.state === 'review') {
      if (g === 0) {
        item.lapses += 1;
        item.ease = Math.max(MIN_EASE, item.ease - 0.2);
        item.state = 'learning';
        item.step = 0;
        item.ivl = clampIvl(item.ivl * 0.5);
        item.due = now + 10 * MIN_MS;
      } else if (g === 1) {
        item.ease = Math.max(MIN_EASE, item.ease - 0.15);
        item.ivl = clampIvl(Math.max(item.ivl + 1, item.ivl * 1.2));
        item.due = now + item.ivl * DAY_MS;
      } else if (g === 2) {
        item.ivl = clampIvl(item.ivl * item.ease);
        item.due = now + item.ivl * DAY_MS;
      } else {
        item.ease += 0.15;
        item.ivl = clampIvl(item.ivl * item.ease * 1.35);
        item.due = now + item.ivl * DAY_MS;
      }
    } else { // new or learning
      item.state = 'learning';
      if (g === 0) {
        item.step = 0;
        item.due = now + 10 * MIN_MS;
      } else if (g === 1) {
        item.due = now + 30 * MIN_MS;
      } else if (g === 2) {
        if (item.step >= 1) {
          item.state = 'review';
          item.ivl = Math.max(1, item.ivl);   // a lapsed card keeps its halved interval
          item.due = now + item.ivl * DAY_MS;
        } else {
          item.step = 1;
          item.due = now + 60 * MIN_MS;
        }
      } else {
        item.state = 'review';
        item.ivl = Math.max(3, item.ivl);
        item.due = now + item.ivl * DAY_MS;
      }
    }
    return item;
  }

  function fmtIvl(ms) {
    if (ms < 60 * MIN_MS) return Math.round(ms / MIN_MS) + 'm';
    if (ms < DAY_MS) return Math.round(ms / (60 * MIN_MS)) + 'h';
    var d = Math.round(ms / DAY_MS);
    if (d < 30) return d + 'd';
    if (d < 365) return Math.round(d / 30.4) + 'mo';
    return Math.round(d / 365) + 'y';
  }

  /* Labels shown on the four grade buttons for a given item. */
  function previewIntervals(item) {
    if (item.state === 'review') {
      var hardIvl = clampIvl(Math.max(item.ivl + 1, item.ivl * 1.2));
      var goodIvl = clampIvl(item.ivl * item.ease);
      var easyIvl = clampIvl(item.ivl * (item.ease + 0.15) * 1.35);
      return ['10m', fmtIvl(hardIvl * DAY_MS), fmtIvl(goodIvl * DAY_MS), fmtIvl(easyIvl * DAY_MS)];
    }
    var good = item.step >= 1 ? fmtIvl(Math.max(1, item.ivl) * DAY_MS) : '1h';
    return ['10m', '30m', good, fmtIvl(Math.max(3, item.ivl) * DAY_MS)];
  }

  function dueItems(items, now) {
    var out = [];
    for (var k in items) if (items[k].due <= now) out.push(items[k]);
    out.sort(function (a, b) { return a.due - b.due; });
    return out;
  }

  function nextDue(items) {
    var t = null;
    for (var k in items) {
      if (t === null || items[k].due < t) t = items[k].due;
    }
    return t;
  }

  window.SRS = {
    newItem: newItem, grade: grade, previewIntervals: previewIntervals,
    dueItems: dueItems, nextDue: nextDue, fmtIvl: fmtIvl
  };
})();
