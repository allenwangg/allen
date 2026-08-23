/* Prism — application: router, views, lesson player, review session, stats. */
(function () {
  'use strict';

  var $app = null;
  var HUES = [262, 205, 160, 25, 340, 48, 190, 300]; // per-course accent hues, by index

  /* ---------------- helpers ---------------- */

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function courseHue(cid) {
    for (var i = 0; i < COURSES.length; i++) if (COURSES[i].id === cid) return HUES[i % HUES.length];
    return HUES[0];
  }

  function findCourse(cid) {
    for (var i = 0; i < COURSES.length; i++) if (COURSES[i].id === cid) return COURSES[i];
    return null;
  }

  function findLesson(course, lid) {
    for (var i = 0; i < course.lessons.length; i++) if (course.lessons[i].id === lid) return { lesson: course.lessons[i], index: i };
    return null;
  }

  function fmtDue(t) {
    var d = t - Date.now();
    if (d <= 0) return 'now';
    var m = Math.round(d / 60000);
    if (m < 60) return 'in ' + m + 'm';
    var h = Math.round(m / 60);
    if (h < 24) return 'in ' + h + 'h';
    return 'in ' + Math.round(h / 24) + 'd';
  }

  function greeting() {
    var h = new Date().getHours();
    var g = h < 5 ? 'Up late' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
    var name = (Store.state.settings.name || '').trim();
    return g + (name ? ', ' + esc(name) : '');
  }

  function isInteractive(card) { return card.type === 'mcq' || card.type === 'truefalse' || card.type === 'reveal'; }

  function xpFloat(n, anchor) {
    var el = document.createElement('div');
    el.className = 'xp-float';
    el.textContent = '+' + n + ' XP';
    var r = anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : null;
    if (r) { el.style.left = (r.left + r.width / 2) + 'px'; el.style.top = (r.top - 6) + 'px'; }
    else { el.style.right = '28px'; el.style.bottom = '96px'; }
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 1400);
  }

  /* ---------------- confetti ---------------- */

  function confetti() {
    var cv = document.createElement('canvas');
    cv.className = 'confetti';
    cv.width = innerWidth; cv.height = innerHeight;
    document.body.appendChild(cv);
    var ctx = cv.getContext('2d');
    var parts = [];
    for (var i = 0; i < 140; i++) {
      parts.push({
        x: innerWidth / 2 + (Math.random() - 0.5) * 240,
        y: innerHeight * 0.38,
        vx: (Math.random() - 0.5) * 11,
        vy: -(4 + Math.random() * 9),
        s: 4 + Math.random() * 5,
        h: HUES[i % HUES.length] + Math.random() * 30 - 15,
        r: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.3
      });
    }
    var t0 = performance.now();
    (function tick(t) {
      var dt = Math.min((t - t0) / 1000, 2.2);
      ctx.clearRect(0, 0, cv.width, cv.height);
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        p.x += p.vx; p.y += p.vy; p.vy += 0.32; p.r += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y); ctx.rotate(p.r);
        ctx.globalAlpha = Math.max(0, 1 - dt / 2.1);
        ctx.fillStyle = 'hsl(' + p.h + ' 85% 60%)';
        ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.62);
        ctx.restore();
      }
      if (dt < 2.15) requestAnimationFrame(tick); else cv.remove();
    })(t0);
  }

  /* ---------------- shared chrome ---------------- */

  function headerHTML(opts) {
    var st = Store.streak();
    var lvl = Store.level();
    var flameOn = Store.streakIncludesToday();
    return '' +
      '<header class="topbar">' +
        '<a class="brand" href="#/">' +
          '<svg class="brand-mark" viewBox="0 0 32 32"><path d="M16 3L30 27H2z" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"/><path d="M16 3v24M16 14l-9.5 13M16 14l9.5 13" stroke="currentColor" stroke-width="1.4" opacity=".55"/></svg>' +
          '<span>Prism</span>' +
        '</a>' +
        '<div class="topbar-right">' +
          '<span class="chip streak' + (flameOn ? ' lit' : '') + '" title="Daily streak — hit your goal to keep it alive">' +
            '<svg viewBox="0 0 24 24"><path d="M12 2c1 4.5 6 6.5 6 12a6 6 0 0 1-12 0c0-3 1.6-4.9 3.2-6.7.3 1.9 1 3 2.1 3.6C10.9 8.5 11 5.2 12 2z" fill="currentColor"/></svg>' +
            Store.streak() + '</span>' +
          '<a class="chip xp" href="#/stats" title="Level ' + lvl.n + ' · ' + esc(lvl.title) + '">' +
            '<svg viewBox="0 0 24 24"><path d="M12 2l2.6 6.9L22 9.5l-5.4 4.6L18.3 22 12 17.8 5.7 22l1.7-7.9L2 9.5l7.4-.6z" fill="currentColor"/></svg>' +
            Store.state.xp + ' XP</a>' +
          '<button class="iconbtn" id="btn-settings" aria-label="Settings" title="Settings">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3.2"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.5-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.5 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.5 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.5-2-1.5c.06-.4.1-.8.1-1.2z"/></svg>' +
          '</button>' +
        '</div>' +
      '</header>';
  }

  function ringHTML(pct, size, label) {
    var r = 34, c = 2 * Math.PI * r;
    var off = c * (1 - Math.min(1, pct));
    return '<svg class="ring" width="' + size + '" height="' + size + '" viewBox="0 0 80 80">' +
      '<circle cx="40" cy="40" r="' + r + '" class="ring-bg"/>' +
      '<circle cx="40" cy="40" r="' + r + '" class="ring-fg" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '"/>' +
      '<text x="40" y="45" text-anchor="middle" class="ring-label">' + label + '</text></svg>';
  }

  /* ---------------- home view ---------------- */

  function renderHome() {
    var goal = Store.state.settings.dailyGoal;
    var today = Store.todayXP();
    var pct = Math.min(1, today / goal);
    var due = SRS.dueItems(Store.state.srs, Date.now());
    var totalItems = Store.srsCount();
    var next = SRS.nextDue(Store.state.srs);

    // continue target: last lesson's course → first incomplete lesson
    var cont = null;
    var last = Store.state.lastLesson;
    if (last) {
      var lc = findCourse(last.courseId);
      if (lc) {
        for (var i = 0; i < lc.lessons.length; i++) {
          if (!Store.lessonRecord(lc.id, lc.lessons[i].id)) { cont = { course: lc, lesson: lc.lessons[i], index: i }; break; }
        }
      }
    }
    if (!cont) {
      outer:
      for (var ci = 0; ci < COURSES.length; ci++) {
        var p = Store.courseProgress(COURSES[ci]);
        if (p.done > 0 && p.done < p.total) {
          for (var li = 0; li < COURSES[ci].lessons.length; li++) {
            if (!Store.lessonRecord(COURSES[ci].id, COURSES[ci].lessons[li].id)) {
              cont = { course: COURSES[ci], lesson: COURSES[ci].lessons[li], index: li };
              break outer;
            }
          }
        }
      }
    }

    var fresh = Store.state.xp === 0;
    var goalDone = today >= goal;

    var h = headerHTML() + '<main class="page">';

    h += '<section class="hero">' +
      '<div class="hero-text">' +
        '<h1>' + (fresh ? 'Learn something that sticks.' : greeting() + '.') + '</h1>' +
        '<p class="sub">' + (fresh
          ? 'Visual, bite-sized lessons in psychology, philosophy, money and more — with built-in spaced repetition so you actually remember them.'
          : (goalDone ? 'Daily goal complete — the streak lives another day.' :
             'You’re ' + (goal - today) + ' XP from today’s goal.')) + '</p>' +
      '</div>' +
      '<div class="hero-ring" title="Today’s XP">' + ringHTML(pct, 96, today + '<tspan class="ring-sub"> / ' + goal + '</tspan>') + '</div>' +
    '</section>';

    // action row: review + continue
    h += '<section class="actions">';
    h += '<a class="action-card review-card' + (due.length ? '' : ' calm') + '" href="#/review">' +
      '<div class="action-art">' + Art.svg('orbit') + '</div>' +
      '<div class="action-body"><h3>' + (due.length ? 'Review ' + due.length + ' card' + (due.length === 1 ? '' : 's') : 'Review') + '</h3>' +
      '<p>' + (totalItems === 0 ? 'Finish a lesson to start your review deck.' :
               due.length ? 'Spaced repetition keeps it in long-term memory.' :
               'All caught up' + (next ? ' — next card ' + fmtDue(next) : '') + '.') + '</p></div>' +
      (due.length ? '<span class="badge">' + due.length + '</span>' : '') + '</a>';
    if (cont) {
      h += '<a class="action-card continue-card" style="--ah:' + courseHue(cont.course.id) + '" href="#/lesson/' + esc(cont.course.id) + '/' + esc(cont.lesson.id) + '">' +
        '<div class="action-art accent">' + Art.svg(cont.lesson.cards[0].art || 'lightbulb') + '</div>' +
        '<div class="action-body"><h3>Continue: ' + esc(cont.lesson.title) + '</h3>' +
        '<p>' + esc(cont.course.title) + ' · Lesson ' + (cont.index + 1) + '</p></div>' +
        '<span class="go">›</span></a>';
    }
    h += '</section>';

    h += '<h2 class="section-title">Courses</h2><section class="grid">';
    for (var k = 0; k < COURSES.length; k++) {
      var c = COURSES[k];
      var pr = Store.courseProgress(c);
      var pctc = pr.total ? pr.done / pr.total : 0;
      h += '<a class="cover" style="--ah:' + HUES[k % HUES.length] + '" href="#/course/' + esc(c.id) + '">' +
        '<div class="cover-top">' +
          '<span class="cat">' + esc(c.category) + '</span>' +
          '<div class="cover-art">' + Art.svg(c.lessons[0].cards[0].art || 'lightbulb') + '</div>' +
        '</div>' +
        '<div class="cover-body">' +
          '<h3>' + esc(c.title) + '</h3>' +
          '<p>' + esc(c.tagline) + '</p>' +
          '<div class="cover-meta"><div class="bar"><i style="width:' + Math.round(pctc * 100) + '%"></i></div>' +
          '<span>' + (pr.done ? pr.done + '/' + pr.total : c.lessons.length + ' lessons') + '</span></div>' +
        '</div></a>';
    }
    h += '</section></main>';
    $app.innerHTML = h;
    bindChrome();
  }

  /* ---------------- course view ---------------- */

  function renderCourse(cid) {
    var c = findCourse(cid);
    if (!c) return nav('#/');
    var hue = courseHue(cid);
    var pr = Store.courseProgress(c);

    var h = headerHTML() + '<main class="page" style="--ah:' + hue + '">';
    h += '<a class="back" href="#/">‹ Library</a>';
    h += '<section class="course-hero">' +
      '<div class="course-hero-art">' + Art.svg(c.lessons[0].cards[0].art || 'lightbulb') + '</div>' +
      '<div class="course-hero-text">' +
        '<span class="cat">' + esc(c.category) + '</span>' +
        '<h1>' + esc(c.title) + '</h1>' +
        '<p class="tagline">' + esc(c.tagline) + '</p>' +
        '<p class="desc">' + esc(c.description) + '</p>' +
        '<div class="cover-meta wide"><div class="bar"><i style="width:' + (pr.total ? Math.round(100 * pr.done / pr.total) : 0) + '%"></i></div>' +
        '<span>' + pr.done + ' of ' + pr.total + ' complete</span></div>' +
      '</div></section>';

    h += '<section class="lessons">';
    for (var i = 0; i < c.lessons.length; i++) {
      var l = c.lessons[i];
      var rec = Store.lessonRecord(c.id, l.id);
      var quizN = 0;
      for (var q = 0; q < l.cards.length; q++) if (isInteractive(l.cards[q])) quizN++;
      h += '<a class="lesson-row' + (rec ? ' done' : '') + '" href="#/lesson/' + esc(c.id) + '/' + esc(l.id) + '">' +
        '<span class="lesson-n">' + (rec
          ? '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'
          : (i + 1)) + '</span>' +
        '<span class="lesson-txt"><b>' + esc(l.title) + '</b><small>' + esc(l.summary) + '</small></span>' +
        '<span class="lesson-side">' + (rec ? '<em>' + rec.best + '%</em>' : '<em class="mut">' + l.cards.length + ' cards · ' + quizN + ' quizzes</em>') + '<span class="go">›</span></span>' +
      '</a>';
    }
    h += '</section></main>';
    $app.innerHTML = h;
    bindChrome();
  }

  /* ---------------- lesson player ---------------- */

  var session = null;

  function startLesson(cid, lid) {
    var c = findCourse(cid);
    if (!c) return nav('#/');
    var f = findLesson(c, lid);
    if (!f) return nav('#/course/' + cid);
    session = {
      course: c, lesson: f.lesson, lessonIndex: f.index,
      idx: 0, xp: 0, attempted: 0, correct: 0, finished: false
    };
    Store.setLastLesson(cid, lid);
    renderCard();
  }

  function segmentsHTML() {
    var n = session.lesson.cards.length;
    var h = '<div class="segments">';
    for (var i = 0; i < n; i++) {
      h += '<i class="' + (i < session.idx ? 'past' : i === session.idx ? 'now' : '') + '"></i>';
    }
    return h + '</div>';
  }

  function playerShell(inner, footer) {
    return '<main class="player" style="--ah:' + courseHue(session.course.id) + '">' +
      '<div class="player-top">' +
        '<button class="iconbtn" id="btn-exit" aria-label="Exit lesson"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>' +
        segmentsHTML() +
        '<span class="player-xp">+' + session.xp + '</span>' +
      '</div>' +
      '<div class="card-stage"><div class="card" id="card">' + inner + '</div></div>' +
      '<div class="player-foot" id="foot">' + footer + '</div>' +
    '</main>';
  }

  function continueBtn(label) {
    return '<button class="btn primary" id="btn-next">' + (label || 'Continue') + '</button>';
  }

  function renderCard() {
    var cards = session.lesson.cards;
    if (session.idx >= cards.length) return renderComplete();
    var card = cards[session.idx];
    var inner = '', footer = '';

    if (card.type === 'intro' || card.type === 'concept' || card.type === 'example') {
      var kicker = card.type === 'intro' ? 'Lesson ' + (session.lessonIndex + 1) + ' · ' + esc(session.lesson.title)
        : card.type === 'example' ? 'Example' : '';
      inner = '<div class="card-art">' + Art.svg(card.art || 'lightbulb') + '</div>' +
        (kicker ? '<span class="kicker">' + kicker + '</span>' : '') +
        '<h2>' + esc(card.title) + '</h2>' +
        '<p class="body">' + esc(card.body) + '</p>';
      footer = continueBtn(session.idx === 0 ? 'Start' : 'Continue');
    } else if (card.type === 'quote') {
      inner = '<div class="quote-mark">“</div>' +
        '<blockquote>' + esc(card.text) + '</blockquote>' +
        '<cite>— ' + esc(card.by) + '</cite>';
      footer = continueBtn();
    } else if (card.type === 'recap') {
      inner = '<div class="card-art small">' + Art.svg('layers') + '</div><h2>Key takeaways</h2><ul class="recap">';
      for (var i = 0; i < card.points.length; i++) {
        inner += '<li style="animation-delay:' + (i * 120) + 'ms"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg><span>' + esc(card.points[i]) + '</span></li>';
      }
      inner += '</ul>';
      footer = continueBtn('Finish lesson');
    } else if (card.type === 'mcq') {
      inner = '<span class="kicker quiz">Quiz</span><h2 class="prompt">' + esc(card.prompt) + '</h2><div class="choices">';
      for (var j = 0; j < card.choices.length; j++) {
        inner += '<button class="choice" data-i="' + j + '"><span class="key">' + (j + 1) + '</span>' + esc(card.choices[j]) + '</button>';
      }
      inner += '</div><div class="explain" id="explain" hidden></div>';
      footer = '<span class="hint">Pick an answer — keys 1–' + card.choices.length + '</span>';
    } else if (card.type === 'truefalse') {
      inner = '<span class="kicker quiz">True or false?</span><h2 class="prompt">' + esc(card.statement) + '</h2>' +
        '<div class="choices tf">' +
          '<button class="choice" data-tf="true"><span class="key">1</span>True</button>' +
          '<button class="choice" data-tf="false"><span class="key">2</span>False</button>' +
        '</div><div class="explain" id="explain" hidden></div>';
      footer = '<span class="hint">Keys 1 · 2</span>';
    } else if (card.type === 'reveal') {
      inner = '<span class="kicker think">Think first</span><h2 class="prompt">' + esc(card.prompt) + '</h2>' +
        '<div class="reveal-slot" id="reveal-slot"><button class="btn ghost" id="btn-reveal">Reveal answer</button></div>';
      footer = '<span class="hint">Guess before you peek — it makes it stick</span>';
    } else {
      footer = continueBtn();
    }

    $app.innerHTML = playerShell(inner, footer);
    bindCard(card);
  }

  function award(n, anchor) { session.xp += n; Store.addXP(n); xpFloat(n, anchor); var el = document.querySelector('.player-xp'); if (el) el.textContent = '+' + session.xp; }

  function bindCard(card) {
    var exit = document.getElementById('btn-exit');
    if (exit) exit.onclick = function () { nav('#/course/' + session.course.id); };

    var next = document.getElementById('btn-next');
    if (next) next.onclick = advance;

    var cardEl = document.getElementById('card');

    if (card.type === 'intro' || card.type === 'concept' || card.type === 'example' || card.type === 'quote' || card.type === 'recap') {
      onkey = function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); advance(); }
        if (e.key === 'Escape') nav('#/course/' + session.course.id);
      };
      if (card.type !== 'recap' && card.type !== 'quote') award(2, null);
      return;
    }

    if (card.type === 'mcq' || card.type === 'truefalse') {
      var answered = false;
      var choices = cardEl.querySelectorAll('.choice');
      function pick(btn) {
        if (answered) return;
        answered = true;
        session.attempted += 1;
        var ok;
        if (card.type === 'mcq') ok = Number(btn.getAttribute('data-i')) === card.answer;
        else ok = (btn.getAttribute('data-tf') === 'true') === card.answer;
        for (var i = 0; i < choices.length; i++) {
          choices[i].disabled = true;
          var isRight = card.type === 'mcq'
            ? Number(choices[i].getAttribute('data-i')) === card.answer
            : (choices[i].getAttribute('data-tf') === 'true') === card.answer;
          if (isRight) choices[i].classList.add('right');
        }
        btn.classList.add(ok ? 'right' : 'wrong');
        if (ok) { session.correct += 1; award(10, btn); } else { award(3, btn); }
        var ex = document.getElementById('explain');
        ex.innerHTML = '<b>' + (ok ? 'Correct.' : 'Not quite.') + '</b> ' + esc(card.explain || '');
        ex.hidden = false;
        ex.className = 'explain show ' + (ok ? 'good' : 'bad');
        document.getElementById('foot').innerHTML = continueBtn();
        document.getElementById('btn-next').onclick = advance;
        document.getElementById('btn-next').focus();
      }
      for (var i = 0; i < choices.length; i++) {
        (function (btn) { btn.onclick = function () { pick(btn); }; })(choices[i]);
      }
      onkey = function (e) {
        if (e.key === 'Escape') return nav('#/course/' + session.course.id);
        if (!answered) {
          var n = Number(e.key);
          if (n >= 1 && n <= choices.length) pick(choices[n - 1]);
        } else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); advance(); }
      };
      return;
    }

    if (card.type === 'reveal') {
      var revealed = false;
      var rb = document.getElementById('btn-reveal');
      function doReveal() {
        if (revealed) return;
        revealed = true;
        var slot = document.getElementById('reveal-slot');
        slot.innerHTML = '<div class="reveal-answer">' + esc(card.answer) + '</div>';
        award(5, slot);
        document.getElementById('foot').innerHTML = continueBtn();
        document.getElementById('btn-next').onclick = advance;
        document.getElementById('btn-next').focus();
      }
      rb.onclick = doReveal;
      onkey = function (e) {
        if (e.key === 'Escape') return nav('#/course/' + session.course.id);
        if (!revealed && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); doReveal(); }
        else if (revealed && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); advance(); }
      };
    }
  }

  function advance() {
    session.idx += 1;
    renderCard();
  }

  function renderComplete() {
    var acc = session.attempted ? Math.round(100 * session.correct / session.attempted) : 100;
    var first = !Store.lessonRecord(session.course.id, session.lesson.id);
    var bonus = first ? 25 : 10;
    Store.addXP(bonus);
    session.xp += bonus;
    Store.completeLesson(session.course.id, session.lesson.id, acc);
    var added = Store.addReviewItems(session.course, session.lesson);

    var nextLesson = session.course.lessons[session.lessonIndex + 1] || null;
    var goalNow = Store.todayXP() >= Store.state.settings.dailyGoal;

    var h = '<main class="player complete" style="--ah:' + courseHue(session.course.id) + '">' +
      '<div class="card-stage"><div class="card done-card">' +
      '<div class="card-art">' + Art.svg('mountain') + '</div>' +
      '<span class="kicker">Lesson complete</span>' +
      '<h2>' + esc(session.lesson.title) + '</h2>' +
      '<div class="done-stats">' +
        '<div class="stat"><b>+' + session.xp + '</b><span>XP earned</span></div>' +
        '<div class="stat"><b>' + acc + '%</b><span>accuracy</span></div>' +
        '<div class="stat"><b>' + (added ? '+' + added : '✓') + '</b><span>' + (added ? 'review cards' : 'in your deck') + '</span></div>' +
      '</div>' +
      (goalNow ? '<p class="goal-note">Daily goal hit — streak: ' + Store.streak() + ' 🔥</p>'
               : '<p class="goal-note dim">' + (Store.state.settings.dailyGoal - Store.todayXP()) + ' XP to today’s goal</p>') +
      '</div></div>' +
      '<div class="player-foot col">' +
        (nextLesson ? '<button class="btn primary" id="btn-next-lesson">Next: ' + esc(nextLesson.title) + '</button>' : '') +
        '<button class="btn ' + (nextLesson ? 'ghost' : 'primary') + '" id="btn-back-course">' + (nextLesson ? 'Back to course' : 'Done') + '</button>' +
      '</div></main>';
    $app.innerHTML = h;
    confetti();

    var nl = document.getElementById('btn-next-lesson');
    if (nl) nl.onclick = function () { nav('#/lesson/' + session.course.id + '/' + nextLesson.id); };
    document.getElementById('btn-back-course').onclick = function () { nav('#/course/' + session.course.id); };
    onkey = function (e) {
      if (e.key === 'Enter') { (nl || document.getElementById('btn-back-course')).click(); }
      if (e.key === 'Escape') nav('#/course/' + session.course.id);
    };
  }

  /* ---------------- review session ---------------- */

  var rev = null;

  function startReview() {
    var due = SRS.dueItems(Store.state.srs, Date.now()).slice(0, 30);
    if (!due.length) return renderReviewEmpty();
    rev = { queue: due, i: 0, graded: 0, again: 0, xp: 0, flipped: false };
    renderReviewCard();
  }

  function renderReviewEmpty() {
    var next = SRS.nextDue(Store.state.srs);
    var total = Store.srsCount();
    $app.innerHTML = headerHTML() + '<main class="page center">' +
      '<div class="empty">' + Art.svg(total ? 'clock' : 'seed') +
      '<h2>' + (total ? 'All caught up' : 'Your deck is empty') + '</h2>' +
      '<p>' + (total
        ? 'Nothing due right now' + (next ? ' — next card ' + fmtDue(next) : '') + '. Spacing out reviews is exactly what makes them work.'
        : 'Complete any lesson and its key ideas become flashcards, scheduled just before you’d forget them.') + '</p>' +
      '<a class="btn primary" href="#/">' + (total ? 'Back home' : 'Pick a course') + '</a></div></main>';
    bindChrome();
  }

  function renderReviewCard() {
    if (rev.i >= rev.queue.length) return renderReviewDone();
    var item = rev.queue[rev.i];
    var course = findCourse(item.courseId);
    var hue = courseHue(item.courseId);
    var iv = SRS.previewIntervals(item);
    var h = '<main class="player" style="--ah:' + hue + '">' +
      '<div class="player-top">' +
        '<button class="iconbtn" id="btn-exit" aria-label="Exit review"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>' +
        '<span class="review-count">' + (rev.i + 1) + ' / ' + rev.queue.length + '</span>' +
        '<span class="player-xp">+' + rev.xp + '</span>' +
      '</div>' +
      '<div class="card-stage"><div class="card flash' + (rev.flipped ? ' flipped' : '') + '" id="card">' +
        '<span class="kicker">' + esc(course ? course.title : 'Review') + '</span>' +
        '<h2 class="prompt">' + esc(item.front) + '</h2>' +
        (rev.flipped ? '<div class="flash-back">' + esc(item.back) + '</div>' : '') +
      '</div></div>' +
      '<div class="player-foot" id="foot">' +
      (rev.flipped
        ? '<div class="grades">' +
          '<button class="grade g0" data-g="0"><b>Again</b><span>' + iv[0] + '</span></button>' +
          '<button class="grade g1" data-g="1"><b>Hard</b><span>' + iv[1] + '</span></button>' +
          '<button class="grade g2" data-g="2"><b>Good</b><span>' + iv[2] + '</span></button>' +
          '<button class="grade g3" data-g="3"><b>Easy</b><span>' + iv[3] + '</span></button>' +
          '</div>'
        : '<button class="btn primary" id="btn-flip">Show answer</button>') +
      '</div></main>';
    $app.innerHTML = h;

    document.getElementById('btn-exit').onclick = function () { nav('#/'); };
    if (!rev.flipped) {
      document.getElementById('btn-flip').onclick = function () { rev.flipped = true; renderReviewCard(); };
      onkey = function (e) {
        if (e.key === 'Escape') return nav('#/');
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); rev.flipped = true; renderReviewCard(); }
      };
    } else {
      var gs = document.querySelectorAll('.grade');
      function doGrade(g) {
        var xp = [1, 3, 5, 5][g];
        Store.gradeReview(item, g);
        Store.addXP(xp);
        rev.xp += xp; rev.graded += 1;
        if (g === 0) { rev.again += 1; rev.queue.push(item); } // see it again this session
        rev.i += 1; rev.flipped = false;
        renderReviewCard();
      }
      for (var i = 0; i < gs.length; i++) {
        (function (b) { b.onclick = function () { doGrade(Number(b.getAttribute('data-g'))); }; })(gs[i]);
      }
      onkey = function (e) {
        if (e.key === 'Escape') return nav('#/');
        var n = Number(e.key);
        if (n >= 1 && n <= 4) doGrade(n - 1);
      };
    }
  }

  function renderReviewDone() {
    var h = '<main class="player complete">' +
      '<div class="card-stage"><div class="card done-card">' +
      '<div class="card-art">' + Art.svg('target') + '</div>' +
      '<span class="kicker">Review complete</span><h2>Memory, upgraded</h2>' +
      '<div class="done-stats">' +
        '<div class="stat"><b>' + rev.graded + '</b><span>cards</span></div>' +
        '<div class="stat"><b>+' + rev.xp + '</b><span>XP</span></div>' +
        '<div class="stat"><b>' + (rev.graded ? Math.round(100 * (rev.graded - rev.again) / rev.graded) : 100) + '%</b><span>recalled</span></div>' +
      '</div></div></div>' +
      '<div class="player-foot"><a class="btn primary" href="#/">Done</a></div></main>';
    $app.innerHTML = h;
    confetti();
    onkey = function (e) { if (e.key === 'Enter' || e.key === 'Escape') nav('#/'); };
  }

  /* ---------------- stats view ---------------- */

  function renderStats() {
    var lvl = Store.level();
    var st = Store.streak();
    var totalLessons = 0, doneLessons = 0;
    for (var i = 0; i < COURSES.length; i++) {
      var p = Store.courseProgress(COURSES[i]);
      totalLessons += p.total; doneLessons += p.done;
    }
    var due = SRS.dueItems(Store.state.srs, Date.now()).length;

    // best streak from history
    var days = Object.keys(Store.state.xpByDay).sort();
    var best = 0, run = 0, prev = null;
    for (var d = 0; d < days.length; d++) {
      if (Store.state.xpByDay[days[d]] >= Store.state.settings.dailyGoal) {
        if (prev && (new Date(days[d]) - new Date(prev)) === 86400000) run += 1; else run = 1;
        best = Math.max(best, run); prev = days[d];
      } else { run = 0; prev = null; }
    }
    best = Math.max(best, st);

    // 12-week heatmap, columns = weeks, rows = weekday
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var start = new Date(today.getTime() - (7 * 11 + today.getDay()) * 86400000);
    var heat = '<div class="heat">';
    for (var w = 0; w < 12; w++) {
      heat += '<div class="heat-col">';
      for (var dow = 0; dow < 7; dow++) {
        var dt = new Date(start.getTime() + (w * 7 + dow) * 86400000);
        if (dt > today) { heat += '<i class="future"></i>'; continue; }
        var xp = Store.state.xpByDay[Store.dayKey(dt.getTime())] || 0;
        var cls = xp === 0 ? '' : xp < Store.state.settings.dailyGoal / 2 ? 'l1' : xp < Store.state.settings.dailyGoal ? 'l2' : 'l3';
        heat += '<i class="' + cls + '" title="' + Store.dayKey(dt.getTime()) + ': ' + xp + ' XP"></i>';
      }
      heat += '</div>';
    }
    heat += '</div>';

    var h = headerHTML() + '<main class="page">';
    h += '<a class="back" href="#/">‹ Home</a><h1 class="page-title">Your progress</h1>';
    h += '<section class="stat-grid">' +
      '<div class="panel"><span class="panel-label">Level ' + lvl.n + '</span><b class="big">' + esc(lvl.title) + '</b>' +
        '<div class="bar tall"><i style="width:' + Math.round(100 * lvl.into / lvl.span) + '%"></i></div>' +
        '<small>' + lvl.into + ' / ' + lvl.span + ' XP to level ' + (lvl.n + 1) + '</small></div>' +
      '<div class="panel"><span class="panel-label">Streak</span><b class="big">' + st + ' day' + (st === 1 ? '' : 's') + '</b>' +
        '<small>best: ' + best + ' · goal: ' + Store.state.settings.dailyGoal + ' XP/day</small></div>' +
      '<div class="panel"><span class="panel-label">Lessons</span><b class="big">' + doneLessons + ' / ' + totalLessons + '</b><small>completed</small></div>' +
      '<div class="panel"><span class="panel-label">Review deck</span><b class="big">' + Store.srsCount() + '</b><small>' + due + ' due now</small></div>' +
    '</section>';

    h += '<h2 class="section-title">Last 12 weeks</h2><section class="panel">' + heat + '</section>';

    h += '<h2 class="section-title">Courses</h2><section class="course-bars">';
    for (var k = 0; k < COURSES.length; k++) {
      var c = COURSES[k], pr2 = Store.courseProgress(c);
      h += '<a href="#/course/' + esc(c.id) + '" class="course-bar" style="--ah:' + HUES[k % HUES.length] + '">' +
        '<span>' + esc(c.title) + '</span>' +
        '<div class="bar"><i style="width:' + (pr2.total ? Math.round(100 * pr2.done / pr2.total) : 0) + '%"></i></div>' +
        '<small>' + pr2.done + '/' + pr2.total + '</small></a>';
    }
    h += '</section></main>';
    $app.innerHTML = h;
    bindChrome();
  }

  /* ---------------- settings ---------------- */

  function openSettings() {
    var s = Store.state.settings;
    var wrap = document.createElement('div');
    wrap.className = 'modal-wrap';
    wrap.innerHTML = '<div class="modal">' +
      '<h2>Settings</h2>' +
      '<label class="field">Name<input id="set-name" maxlength="24" placeholder="optional" value="' + esc(s.name) + '"></label>' +
      '<label class="field">Theme<select id="set-theme">' +
        '<option value="system"' + (s.theme === 'system' ? ' selected' : '') + '>System</option>' +
        '<option value="light"' + (s.theme === 'light' ? ' selected' : '') + '>Light</option>' +
        '<option value="dark"' + (s.theme === 'dark' ? ' selected' : '') + '>Dark</option></select></label>' +
      '<label class="field">Daily goal<select id="set-goal">' +
        [30, 50, 100, 200].map(function (g) { return '<option value="' + g + '"' + (s.dailyGoal === g ? ' selected' : '') + '>' + g + ' XP — ' + { 30: 'casual', 50: 'steady', 100: 'serious', 200: 'obsessed' }[g] + '</option>'; }).join('') +
      '</select></label>' +
      '<div class="modal-row"><button class="btn primary" id="set-save">Save</button><button class="btn ghost" id="set-close">Cancel</button></div>' +
      '<button class="danger-link" id="set-reset">Reset all progress…</button>' +
    '</div>';
    document.body.appendChild(wrap);
    wrap.addEventListener('click', function (e) { if (e.target === wrap) wrap.remove(); });
    document.getElementById('set-close').onclick = function () { wrap.remove(); };
    document.getElementById('set-save').onclick = function () {
      Store.setSetting('name', document.getElementById('set-name').value.trim());
      Store.setSetting('theme', document.getElementById('set-theme').value);
      Store.setSetting('dailyGoal', Number(document.getElementById('set-goal').value));
      applyTheme();
      wrap.remove();
      route();
    };
    document.getElementById('set-reset').onclick = function () {
      if (confirm('Erase all XP, streaks, lesson progress and your review deck? This cannot be undone.')) {
        Store.resetAll(); applyTheme(); wrap.remove(); route();
      }
    };
  }

  function applyTheme() {
    var t = Store.state.settings.theme;
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
  }

  function bindChrome() {
    var b = document.getElementById('btn-settings');
    if (b) b.onclick = openSettings;
    onkey = null;
  }

  /* ---------------- router ---------------- */

  var onkey = null;
  document.addEventListener('keydown', function (e) {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA')) return;
    if (onkey) onkey(e);
  });

  function nav(hash) { location.hash = hash; }

  function route() {
    var h = location.hash || '#/';
    var parts = h.replace(/^#\//, '').split('/');
    onkey = null;
    window.scrollTo(0, 0);
    if (parts[0] === 'course' && parts[1]) renderCourse(parts[1]);
    else if (parts[0] === 'lesson' && parts[1] && parts[2]) startLesson(parts[1], parts[2]);
    else if (parts[0] === 'review') startReview();
    else if (parts[0] === 'stats') renderStats();
    else renderHome();
  }

  window.addEventListener('hashchange', route);
  window.addEventListener('DOMContentLoaded', function () {
    $app = document.getElementById('app');
    applyTheme();
    route();
  });
})();
