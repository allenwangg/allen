/* Prism — learning paths. Curated multi-course journeys over the library. */
(function () {
  'use strict';

  var PATHS = [
    { id: 'clear-thinking', title: 'Think Clearly', art: 'lens',
      blurb: 'Find the flaws in your own reasoning, then build the habits that catch them.',
      courses: ['cognitive-biases', 'logical-fallacies', 'probability-and-luck', 'art-of-strategy', 'world-in-data'] },
    { id: 'master-mind', title: 'Master Your Mind', art: 'brain',
      blurb: 'How memory, emotion, attention and habit actually work — and how to steer them.',
      courses: ['learning-how-to-learn', 'brain-on-emotions', 'attention-age', 'science-of-habits', 'psychology-of-happiness'] },
    { id: 'money-path', title: 'Money & Markets', art: 'coin',
      blurb: 'From your own behaviour with money to how whole economies move.',
      courses: ['psychology-of-money', 'how-economies-work', 'stock-market-explained', 'money-in-history', 'negotiation'] },
    { id: 'examined-life', title: 'The Examined Life', art: 'compass',
      blurb: 'Twenty-five centuries of arguments about how to live and what a mind is.',
      courses: ['stoicism', 'eastern-philosophy', 'ethics-big-three', 'consciousness'] },
    { id: 'your-body', title: 'Understand Your Body', art: 'shield',
      blurb: 'Sleep, food, immunity, microbes and aging — the evidence, minus the marketing.',
      courses: ['science-of-sleep', 'nutrition-without-nonsense', 'immune-system', 'microbiome', 'how-to-live-forever'] },
    { id: 'how-world-works', title: 'How the World Works', art: 'orbit',
      blurb: 'The physics, biology and history that produced everything around you.',
      courses: ['big-ideas-physics', 'story-of-evolution', 'climate-system', 'great-experiments', 'space-exploration', 'turning-points'] },
    { id: 'modern-tech', title: 'The Modern Frontier', art: 'network',
      blurb: 'The technologies rewriting this decade, explained without hype.',
      courses: ['how-internet-works', 'how-ai-works', 'genes-and-editing', 'how-things-spread'] },
    { id: 'world-traditions', title: 'The Wider World', art: 'map',
      blurb: 'Civilisations, ideas and art from beyond the usual syllabus.',
      courses: ['islamic-golden-age', 'imperial-china', 'african-kingdoms', 'india-legacy', 'indigenous-knowledge', 'latin-america'] },
    { id: 'how-things-work', title: 'How Things Actually Work', art: 'puzzle',
      blurb: 'The systems holding up the built and natural world.',
      courses: ['architecture', 'energy', 'ecology', 'astronomy', 'geology', 'computing'] },
    { id: 'evidence', title: 'Thinking With Evidence', art: 'graph',
      blurb: 'Reading studies, numbers and diagnoses the way professionals should.',
      courses: ['statistics', 'how-doctors-think', 'media-literacy', 'decisions', 'anthropology'] },
    { id: 'communicate', title: 'Communicate & Persuade', art: 'dialog',
      blurb: 'Move people with evidence, story and structure — ethically.',
      courses: ['persuasion', 'art-of-storytelling', 'genius-of-language', 'music-and-brain'] }
  ];

  function byId(id) {
    for (var i = 0; i < PATHS.length; i++) if (PATHS[i].id === id) return PATHS[i];
    return null;
  }

  /* The courses of a path that actually exist in the loaded library. A path may
     name a course that has not shipped yet, so every consumer resolves through
     here and a path never renders a row pointing at nothing. */
  function coursesOf(path, findCourse) {
    var out = [];
    for (var i = 0; i < path.courses.length; i++) {
      var c = findCourse(path.courses[i]);
      if (c) out.push(c);
    }
    return out;
  }

  /* {done, total, next} — totals count only courses present in the library. */
  function progress(path, findCourse, courseProgress) {
    var cs = coursesOf(path, findCourse), done = 0, next = null;
    for (var i = 0; i < cs.length; i++) {
      var p = courseProgress(cs[i]);
      if (p.total && p.done === p.total) done += 1;
      else if (!next) next = cs[i].id;
    }
    return { done: done, total: cs.length, next: next };
  }

  /* Paths worth showing: those with at least one course actually available. */
  function available(findCourse) {
    var out = [];
    for (var i = 0; i < PATHS.length; i++) {
      if (coursesOf(PATHS[i], findCourse).length) out.push(PATHS[i]);
    }
    return out;
  }

  window.Paths = { list: PATHS, byId: byId, progress: progress, coursesOf: coursesOf, available: available };
})();
