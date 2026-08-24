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
    { id: 'communicate', title: 'Communicate & Persuade', art: 'dialog',
      blurb: 'Move people with evidence, story and structure — ethically.',
      courses: ['persuasion', 'art-of-storytelling', 'genius-of-language', 'music-and-brain'] }
  ];

  function byId(id) {
    for (var i = 0; i < PATHS.length; i++) if (PATHS[i].id === id) return PATHS[i];
    return null;
  }

  /* {done, total, next} — next is the first course id not yet complete. */
  function progress(path, findCourse, courseProgress) {
    var done = 0, next = null;
    for (var i = 0; i < path.courses.length; i++) {
      var c = findCourse(path.courses[i]);
      if (!c) continue;
      var p = courseProgress(c);
      if (p.total && p.done === p.total) done += 1;
      else if (!next) next = c.id;
    }
    return { done: done, total: path.courses.length, next: next };
  }

  window.Paths = { list: PATHS, byId: byId, progress: progress };
})();
