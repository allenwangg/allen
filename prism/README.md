# Prism — learn visually, remember forever

Prism is a visual micro-learning app in the spirit of [Imprint](https://imprintapp.com), built to beat it where it counts: every lesson you finish feeds a real **spaced-repetition system**, so the ideas don't evaporate a week later.

## What's inside

- **6 courses, 24 lessons, ~290 cards** of original, fact-checked content: Cognitive Biases, Stoicism in Practice, The Psychology of Money, Learning How to Learn, The Art of Persuasion, and Logical Fallacies.
- **Interactive lesson player** — concept/example cards with custom illustrations, multiple-choice and true/false quizzes with instant feedback and explanations, think-first reveal cards, quotes, and recaps.
- **Spaced repetition built in** — completing a lesson adds its key ideas to a review deck scheduled with an SM-2-derived algorithm (Again / Hard / Good / Easy, expanding intervals, lapse handling).
- **Gamification that serves learning** — XP, levels with titles, a daily goal ring, and a streak that survives until midnight, plus a 12-week activity heatmap.
- **32 hand-drawn geometric SVG illustrations**, tinted per course; light/dark/system themes; full keyboard controls (1–4 to answer, Enter to continue, Esc to exit).
- **Zero dependencies, no build step required** — plain HTML/CSS/JS. Progress persists in `localStorage`.

## Run it

```bash
cd prism
python3 -m http.server 8000    # or any static server
# open http://localhost:8000
```

Opening `index.html` directly from disk also works.

## Single-file build

```bash
node build.mjs        # → dist/prism.html (self-contained, shareable)
```

## Development

```bash
node validate.mjs     # structural checks on course content
node test/smoke.mjs   # end-to-end Playwright smoke test (needs playwright-core + Chromium)
```

## Architecture

| File | Role |
| --- | --- |
| `js/app.js` | Hash router, all views, lesson player state machine, review session |
| `js/srs.js` | SM-2-derived scheduler (grading, intervals, due queue) |
| `js/store.js` | Persistent state: XP, streaks, lesson records, review deck, settings |
| `js/art.js` | 32-glyph SVG illustration library, styled via CSS custom properties |
| `js/data/courses.js` | All course content (structured card data) |
| `css/app.css` | Design system: tokens, both themes, every component |

Keyboard shortcuts: `1–4` answer/grade · `Enter`/`Space` continue/flip · `Esc` exit.
