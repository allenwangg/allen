/* Prism — achievements. Definitions + evaluation; earned set persists in Store.state.badges. */
(function () {
  'use strict';

  /* ctx: {xp, streak, lessonsDone, coursesDone, totalCourses, reviewsTotal, perfect, hour, deckSize} */
  var LIST = [
    { id: 'first-light', art: 'seed', title: 'First Light', desc: 'Complete your first lesson', test: function (c) { return c.lessonsDone >= 1; } },
    { id: 'five-deep', art: 'ladder', title: 'Five Deep', desc: 'Complete 5 lessons', test: function (c) { return c.lessonsDone >= 5; } },
    { id: 'course-closed', art: 'flame', title: 'Course Closed', desc: 'Finish every lesson in a course', test: function (c) { return c.coursesDone >= 1; } },
    { id: 'polymath', art: 'mountain', title: 'Polymath', desc: 'Finish every course in the library', test: function (c) { return c.totalCourses > 0 && c.coursesDone >= c.totalCourses; } },
    { id: 'week-flame', art: 'clock', title: 'Week of Fire', desc: 'Keep a 7-day streak', test: function (c) { return c.streak >= 7; } },
    { id: 'fortnight', art: 'hourglass', title: 'Fortnight', desc: 'Keep a 14-day streak', test: function (c) { return c.streak >= 14; } },
    { id: 'scholar', art: 'book', title: 'Scholar', desc: 'Earn 500 XP', test: function (c) { return c.xp >= 500; } },
    { id: 'sage', art: 'pyramid', title: 'Sage', desc: 'Earn 2,000 XP', test: function (c) { return c.xp >= 2000; } },
    { id: 'perfectionist', art: 'target', title: 'Perfectionist', desc: 'Finish a lesson at 100% accuracy', test: function (c) { return c.perfect >= 1; } },
    { id: 'deck-builder', art: 'layers', title: 'Deck Builder', desc: 'Grow your review deck to 40 cards', test: function (c) { return c.deckSize >= 40; } },
    { id: 'memory-smith', art: 'key', title: 'Memory Smith', desc: 'Review 50 flashcards', test: function (c) { return c.reviewsTotal >= 50; } },
    { id: 'mind-palace', art: 'network', title: 'Mind Palace', desc: 'Review 250 flashcards', test: function (c) { return c.reviewsTotal >= 250; } },
    { id: 'night-owl', art: 'eye', title: 'Night Owl', desc: 'Finish a session after midnight', test: function (c) { return c.hour >= 0 && c.hour < 5 && (c.lessonsDone >= 1 || c.reviewsTotal >= 1); } }
  ];

  /* Evaluate all badges; persist and return newly earned ones. */
  function check(ctx) {
    var fresh = [];
    var badges = Store.state.badges;
    for (var i = 0; i < LIST.length; i++) {
      var b = LIST[i];
      if (!badges[b.id] && b.test(ctx)) {
        badges[b.id] = Date.now();
        fresh.push(b);
      }
    }
    if (fresh.length) Store.save();
    return fresh;
  }

  window.Achieve = { list: LIST, check: check };
})();
