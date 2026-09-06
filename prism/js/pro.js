/* Prism — Pro entitlement.

   The app is offline-first, so the entitlement lives in Store and is trusted
   offline. It is re-checked with the server at most once a day when online, and
   only an explicit "no" from the server — refunded, lapsed, invalid — revokes it.
   A network failure never does.

   Honest note: everything here runs in the browser, and the lesson text ships
   with the app. Gating keeps the product coherent for honest people; it is not
   DRM, and Prism does not pretend otherwise. */
(function () {
  'use strict';

  var DAY = 24 * 60 * 60 * 1000;
  var GRACE = 3 * DAY;             // a subscription keeps working this long past its period end

  function cfg() { return window.PRICING || {}; }
  function provider() { return cfg().provider || 'none'; }
  function configured() { return provider() !== 'none'; }
  function verifyUrl() { return cfg().verifyUrl || 'api/verify'; }
  function entitlement() { return Store.state.pro || null; }

  function isPro() {
    var p = entitlement();
    if (!p) return false;
    if (p.until && p.until * 1000 + GRACE < Date.now()) return false;
    return true;
  }

  function plan() { var p = entitlement(); return p ? p.plan : null; }

  function freeCourse(cid) { return (cfg().freeCourses || []).indexOf(cid) >= 0; }

  function freePerCourse() {
    var n = cfg().freeLessonsPerCourse;
    return typeof n === 'number' ? n : 1;
  }

  /* The single question every gate asks. */
  function lessonLocked(course, lessonIndex) {
    if (isPro()) return false;
    if (freeCourse(course.id)) return false;
    return lessonIndex >= freePerCourse();
  }

  /* {free, total} lessons across the library at the current entitlement — for copy. */
  function lessonCounts(courses) {
    var free = 0, total = 0;
    for (var i = 0; i < courses.length; i++) {
      for (var j = 0; j < courses[i].lessons.length; j++) {
        total++;
        if (!lessonLocked(courses[i], j)) free++;
      }
    }
    return { free: free, total: total };
  }

  function freeCourseCount() { return (cfg().freeCourses || []).length; }

  function post(url, body) {
    return fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) {
      return r.json().then(function (j) { return j; }, function () { return { ok: false, reason: 'error' }; });
    });
  }

  function grant(fields) {
    var now = Date.now();
    Store.setPro({
      token: fields.token, plan: fields.plan || 'lifetime', until: fields.until || null,
      activatedAt: now, checkedAt: now
    });
  }

  /* Paste a license key (a token issued to another device). */
  function activateKey(key) {
    key = String(key || '').trim();
    if (!key) return Promise.resolve({ ok: false, reason: 'empty' });
    if (!configured()) {
      if (key.toUpperCase() === 'PRISM-DEMO') {
        grant({ token: 'demo', plan: 'demo' });
        return Promise.resolve({ ok: true, plan: 'demo' });
      }
      return Promise.resolve({ ok: false, reason: 'invalid' });
    }
    return post(verifyUrl(), { token: key }).then(function (j) {
      if (j && j.ok) { grant({ token: j.token || key, plan: j.plan, until: j.until }); return { ok: true, plan: j.plan }; }
      return { ok: false, reason: (j && j.reason) || 'invalid' };
    }, function () { return { ok: false, reason: 'network' }; });
  }

  /* After checkout, Stripe sends the buyer back with ?session_id=… */
  function claimSession(sessionId) {
    if (!configured()) return Promise.resolve({ ok: false, reason: 'unconfigured' });
    return post(verifyUrl(), { session_id: sessionId }).then(function (j) {
      if (j && j.ok) { grant({ token: j.token, plan: j.plan, until: j.until }); return { ok: true, plan: j.plan }; }
      return { ok: false, reason: (j && j.reason) || 'invalid' };
    }, function () { return { ok: false, reason: 'network' }; });
  }

  var REVOKES = { invalid: true, lapsed: true, refunded: true };

  /* Daily re-check. Resolves to null when nothing changed. */
  function refresh(force) {
    var p = entitlement();
    if (!p || p.plan === 'demo' || !configured()) return Promise.resolve(null);
    if (!force && p.checkedAt && Date.now() - p.checkedAt < DAY) return Promise.resolve(null);
    if (navigator.onLine === false) return Promise.resolve(null);
    return post(verifyUrl(), { token: p.token }).then(function (j) {
      if (j && j.ok) {
        Store.setPro({ token: j.token || p.token, plan: j.plan || p.plan, until: j.until || null,
          activatedAt: p.activatedAt, checkedAt: Date.now() });
        return { ok: true };
      }
      if (j && j.ok === false && REVOKES[j.reason]) { Store.clearPro(); return { ok: false, reason: j.reason }; }
      return null;
    }, function () { return null; });
  }

  function deactivate() { Store.clearPro(); }

  function checkoutUrl() { return cfg().checkoutUrl || ''; }

  /* Called once at boot. A checkout return claims its session; otherwise the
     daily re-check runs. Either way the promise resolves to a result or null. */
  function boot() {
    var m = location.search.match(/[?&]session_id=([^&]+)/);
    if (m) {
      var id = decodeURIComponent(m[1]);
      try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) { /* fine */ }
      return claimSession(id);
    }
    return refresh(false);
  }

  window.Pro = {
    isPro: isPro, plan: plan, configured: configured, provider: provider,
    lessonLocked: lessonLocked, lessonCounts: lessonCounts, freeCourseCount: freeCourseCount, freeCourse: freeCourse,
    activateKey: activateKey, claimSession: claimSession, refresh: refresh, deactivate: deactivate,
    checkoutUrl: checkoutUrl, boot: boot,
    price: function () { return cfg().price || { amount: '', term: '' }; }
  };
})();
