/* Prism — app state, persistence, XP / streak / progress accounting. */
(function () {
  'use strict';

  var KEY = 'prism.v1';
  var DAY_MS = 24 * 60 * 60 * 1000;

  var defaults = function () {
    return {
      xp: 0,
      xpByDay: {},            // 'YYYY-MM-DD' -> xp earned that day
      lessons: {},            // courseId -> lessonId -> {completedAt, best (0-100), runs}
      srs: {},                // itemId -> SRS item
      reviewsByDay: {},       // 'YYYY-MM-DD' -> cards reviewed
      lastLesson: null,       // {courseId, lessonId}
      settings: { theme: 'system', dailyGoal: 50, name: '' },
      firstSeen: Date.now()
    };
  };

  var state = load();

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var s = JSON.parse(raw);
        var d = defaults();
        for (var k in d) if (!(k in s)) s[k] = d[k];
        if (!s.settings.theme) s.settings.theme = 'system';
        if (!s.settings.dailyGoal) s.settings.dailyGoal = 50;
        return s;
      }
    } catch (e) { /* storage unavailable or corrupt — run in-memory */ }
    return defaults();
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* in-memory only */ }
  }

  function dayKey(t) {
    var d = new Date(t || Date.now());
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }

  function addXP(n) {
    state.xp += n;
    var k = dayKey();
    state.xpByDay[k] = (state.xpByDay[k] || 0) + n;
    save();
    return n;
  }

  function todayXP() { return state.xpByDay[dayKey()] || 0; }

  function goalMet(k) { return (state.xpByDay[k] || 0) >= state.settings.dailyGoal; }

  /* Consecutive days (ending today or yesterday) with the daily goal met. */
  function streak() {
    var n = 0;
    var t = Date.now();
    if (!goalMet(dayKey(t))) t -= DAY_MS;          // today not yet met: streak survives from yesterday
    while (goalMet(dayKey(t))) { n += 1; t -= DAY_MS; }
    return n;
  }

  function streakIncludesToday() { return goalMet(dayKey()); }

  var LEVELS = ['Newcomer', 'Learner', 'Explorer', 'Scholar', 'Thinker', 'Adept', 'Sage', 'Polymath', 'Luminary', 'Prismatic'];
  function level() {
    var lvl = Math.floor(Math.sqrt(state.xp / 60));
    var title = LEVELS[Math.min(lvl, LEVELS.length - 1)];
    var floorXP = lvl * lvl * 60;
    var nextXP = (lvl + 1) * (lvl + 1) * 60;
    return { n: lvl + 1, title: title, into: state.xp - floorXP, span: nextXP - floorXP };
  }

  function lessonRecord(cid, lid) {
    return (state.lessons[cid] || {})[lid] || null;
  }

  function completeLesson(cid, lid, accuracy) {
    if (!state.lessons[cid]) state.lessons[cid] = {};
    var rec = state.lessons[cid][lid];
    if (!rec) rec = state.lessons[cid][lid] = { completedAt: Date.now(), best: 0, runs: 0 };
    rec.runs += 1;
    rec.completedAt = Date.now();
    rec.best = Math.max(rec.best, accuracy);
    save();
    return rec;
  }

  function courseProgress(course) {
    var done = 0;
    for (var i = 0; i < course.lessons.length; i++) {
      if (lessonRecord(course.id, course.lessons[i].id)) done += 1;
    }
    return { done: done, total: course.lessons.length };
  }

  function addReviewItems(course, lesson) {
    var added = 0;
    var now = Date.now();
    for (var i = 0; i < lesson.review.length; i++) {
      var id = course.id + '/' + lesson.id + '/' + i;
      if (!state.srs[id]) {
        state.srs[id] = SRS.newItem(id, course.id, lesson.id, lesson.review[i].front, lesson.review[i].back, now);
        added += 1;
      }
    }
    save();
    return added;
  }

  function gradeReview(item, g) {
    SRS.grade(item, g, Date.now());
    var k = dayKey();
    state.reviewsByDay[k] = (state.reviewsByDay[k] || 0) + 1;
    save();
  }

  function srsCount() { var n = 0; for (var k in state.srs) n += 1; return n; }

  function setLastLesson(cid, lid) { state.lastLesson = { courseId: cid, lessonId: lid }; save(); }

  function setSetting(k, v) { state.settings[k] = v; save(); }

  function resetAll() { state = defaults(); save(); }

  window.Store = {
    get state() { return state; },
    save: save, addXP: addXP, todayXP: todayXP, streak: streak,
    streakIncludesToday: streakIncludesToday, level: level, dayKey: dayKey,
    lessonRecord: lessonRecord, completeLesson: completeLesson, courseProgress: courseProgress,
    addReviewItems: addReviewItems, gradeReview: gradeReview, srsCount: srsCount,
    setLastLesson: setLastLesson, setSetting: setSetting, resetAll: resetAll
  };
})();
