/* Prism — course content. PLACEHOLDER: replaced by generated content. */
window.COURSES = [
  {
    id: 'sample', title: 'Sample Course', tagline: 'Placeholder while content generates.',
    category: 'Demo', description: 'A tiny placeholder course used for engine testing.',
    lessons: [
      {
        id: 'demo', title: 'Demo Lesson', summary: 'Exercises every card type.',
        cards: [
          { type: 'intro', title: 'Welcome to Prism', body: 'This placeholder lesson exists to exercise the lesson player: content cards, quizzes, reveals, quotes and recaps.', art: 'lightbulb' },
          { type: 'concept', title: 'A concept card', body: 'Concept cards teach one idea at a time, paired with an illustration that gives the idea a visual anchor.', art: 'anchor' },
          { type: 'mcq', prompt: 'What does a concept card teach?', choices: ['Everything at once', 'One idea at a time', 'Nothing'], answer: 1, explain: 'One idea per card keeps cognitive load low.' },
          { type: 'truefalse', statement: 'Prism schedules reviews with spaced repetition.', answer: true, explain: 'Completed lessons feed a spaced-repetition deck.' },
          { type: 'reveal', prompt: 'What happens when you finish a lesson?', answer: 'Its key ideas become flashcards, scheduled just before you would forget them.' },
          { type: 'quote', text: 'Learning is not attained by chance. It must be sought for with ardor.', by: 'Abigail Adams' },
          { type: 'recap', points: ['Cards teach one idea each', 'Quizzes give instant feedback', 'Reviews are spaced over time'] }
        ],
        review: [
          { front: 'What scheduling technique does Prism use for review?', back: 'Spaced repetition — increasing intervals timed just before forgetting.' },
          { front: 'Why one idea per card?', back: 'It keeps cognitive load low, so each idea gets encoded properly.' },
          { front: 'What do completed lessons feed?', back: 'Your spaced-repetition review deck.' },
          { front: 'What makes retrieval practice effective?', back: 'Actively recalling strengthens memory more than rereading.' }
        ]
      }
    ]
  }
];
