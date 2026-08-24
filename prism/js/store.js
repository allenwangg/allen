/* Prism — app state, persistence, XP / streak / progress accounting. */
(function () {
  'use strict';

  var KEY = 'prism.v1';
  var DAY_MS = 24 * 60 * 60 * 1000;

  var defaults = function () {
    return {
      xp: 0,
      xpByDay: {},            // 'YYYY-MM-DD' -> xp earned that day
      goalDays: {},           // 'YYYY-MM-DD' -> true once that day's goal was met
      lessons: {},            // courseId -> lessonId -> {completedAt, best (0-100), runs}
      srs: {},                // itemId -> SRS item
      reviewsByDay: {},       // 'YYYY-MM-DD' -> cards reviewed
      lastLesson: null,       // {courseId, lessonId}
      inProgress: {},         // 'courseId/lessonId' -> mid-lesson snapshot
      toured: false,          // first-visit tour dismissed
      saved: [],              // bookmarked cards: {courseId, lessonId, idx, savedAt}
      freezes: 0,             // unused streak freezes
      frozenDays: {},         // 'YYYY-MM-DD' -> true, a missed day covered by a freeze
      lastActiveDay: null,    // day key of the last day XP was earned
      certificates: {},       // courseId -> earnedAt
      badges: {},             // badgeId -> earnedAt timestamp
      settings: { theme: 'system', dailyGoal: 50, name: '', sound: true },
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
        for (var k2 in d.settings) if (!(k2 in s.settings)) s.settings[k2] = d.settings[k2];
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
    // freeze goal completion at the goal in force that day, so changing the
    // daily goal later never rewrites streak history
    if (state.xpByDay[k] >= state.settings.dailyGoal) state.goalDays[k] = true;
    save();
    return n;
  }

  function todayXP() { return state.xpByDay[dayKey()] || 0; }

  function goalMet(k) {
    return state.goalDays[k] === true || state.frozenDays[k] === true ||
      (state.xpByDay[k] || 0) >= state.settings.dailyGoal;
  }

  /* Consecutive days (ending today or yesterday) with the daily goal met.
     Walks calendar days, not fixed 24h steps, so DST transitions don't skip. */
  function streak() {
    var n = 0;
    var d = new Date(); d.setHours(0, 0, 0, 0);
    if (!goalMet(dayKey(d.getTime()))) d.setDate(d.getDate() - 1);
    while (goalMet(dayKey(d.getTime()))) { n += 1; d.setDate(d.getDate() - 1); }
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

  function totalReviews() { var n = 0; for (var k in state.reviewsByDay) n += state.reviewsByDay[k]; return n; }

  function exportData() { return JSON.stringify(state); }

  /* Replace state with a backup blob. Returns error string or null on success. */
  function importData(str) {
    var s;
    try { s = JSON.parse(str); } catch (e) { return 'That doesn’t look like valid backup text.'; }
    if (!s || typeof s !== 'object' || typeof s.xp !== 'number' || !s.settings || !s.xpByDay) {
      return 'That text isn’t a Prism backup — copy one from Settings on the device you’re importing from.';
    }
    var d = defaults();
    for (var k in d) if (!(k in s)) s[k] = d[k];
    for (var k2 in d.settings) if (!(k2 in s.settings)) s.settings[k2] = d.settings[k2];
    state = s;
    save();
    return null;
  }

  function setLastLesson(cid, lid) { state.lastLesson = { courseId: cid, lessonId: lid }; save(); }

  function saveProgress(cid, lid, snap) { state.inProgress[cid + '/' + lid] = snap; save(); }

  /* Mid-lesson snapshots expire after a week — stale resumes confuse more than help. */
  function getProgress(cid, lid) {
    var p = state.inProgress[cid + '/' + lid];
    if (!p) return null;
    if (Date.now() - p.savedAt > 7 * 24 * 60 * 60 * 1000) { clearProgress(cid, lid); return null; }
    return p;
  }

  function clearProgress(cid, lid) { delete state.inProgress[cid + '/' + lid]; save(); }

  /* Newest unexpired snapshot, or null. */
  function newestProgress() {
    var best = null, bestKey = null;
    for (var k in state.inProgress) {
      var p = state.inProgress[k];
      if (Date.now() - p.savedAt > 7 * 24 * 60 * 60 * 1000) continue;
      if (!best || p.savedAt > best.savedAt) { best = p; bestKey = k; }
    }
    if (!best) return null;
    var parts = bestKey.split('/');
    return { courseId: parts[0], lessonId: parts[1], snap: best };
  }

  function markToured() { state.toured = true; save(); }

  /* ---- streak freezes ----
     One freeze is earned every 5 goal-days (max 3 held). On the first visit of a
     new day, any single missed day is covered automatically if a freeze is held. */
  function grantFreezeIfEarned() {
    var met = 0;
    for (var k in state.xpByDay) if (goalMet(k) && !state.frozenDays[k]) met += 1;
    var earned = Math.floor(met / 5);
    var already = state.freezesEarned || 0;
    if (earned > already) {
      state.freezesEarned = earned;
      state.freezes = Math.min(3, state.freezes + (earned - already));
      save();
      return earned - already;
    }
    return 0;
  }

  /* Called on load: cover a single missed day with a freeze so the streak survives. */
  function applyFreeze() {
    var today = dayKey();
    if (!state.lastActiveDay || state.lastActiveDay === today) return null;
    var d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - 1);
    var yest = dayKey(d.getTime());
    if (state.lastActiveDay === yest) return null;          // no gap
    if (goalMet(yest)) return null;
    // only cover a one-day gap: the day before yesterday must have counted
    d.setDate(d.getDate() - 1);
    if (!goalMet(dayKey(d.getTime()))) return null;
    if (state.freezes <= 0) return null;
    state.freezes -= 1;
    state.frozenDays[yest] = true;
    save();
    return yest;
  }

  function noteActive() { state.lastActiveDay = dayKey(); save(); }

  /* ---- saved cards ---- */
  function savedKey(cid, lid, idx) { return cid + '|' + lid + '|' + idx; }
  function isSaved(cid, lid, idx) {
    for (var i = 0; i < state.saved.length; i++) {
      var s2 = state.saved[i];
      if (s2.courseId === cid && s2.lessonId === lid && s2.idx === idx) return true;
    }
    return false;
  }
  function toggleSaved(cid, lid, idx) {
    for (var i = 0; i < state.saved.length; i++) {
      var s2 = state.saved[i];
      if (s2.courseId === cid && s2.lessonId === lid && s2.idx === idx) {
        state.saved.splice(i, 1); save(); return false;
      }
    }
    state.saved.push({ courseId: cid, lessonId: lid, idx: idx, savedAt: Date.now() });
    save();
    return true;
  }

  function grantCertificate(cid) {
    if (state.certificates[cid]) return false;
    state.certificates[cid] = Date.now();
    save();
    return true;
  }

  function setSetting(k, v) { state.settings[k] = v; save(); }

  function resetAll() { state = defaults(); save(); }

  window.Store = {
    get state() { return state; },
    save: save, addXP: addXP, todayXP: todayXP, streak: streak, goalMet: goalMet,
    streakIncludesToday: streakIncludesToday, level: level, dayKey: dayKey,
    lessonRecord: lessonRecord, completeLesson: completeLesson, courseProgress: courseProgress,
    addReviewItems: addReviewItems, gradeReview: gradeReview, srsCount: srsCount,
    totalReviews: totalReviews, exportData: exportData, importData: importData,
    saveProgress: saveProgress, getProgress: getProgress, clearProgress: clearProgress,
    grantFreezeIfEarned: grantFreezeIfEarned, applyFreeze: applyFreeze, noteActive: noteActive,
    isSaved: isSaved, toggleSaved: toggleSaved, savedKey: savedKey, grantCertificate: grantCertificate,
    newestProgress: newestProgress, markToured: markToured,
    setLastLesson: setLastLesson, setSetting: setSetting, resetAll: resetAll
  };
})();
