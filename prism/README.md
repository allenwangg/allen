# Prism — learn visually, remember forever

Prism is a visual micro-learning app in the spirit of [Imprint](https://imprintapp.com), built to beat it where it counts: every lesson you finish feeds a real **spaced-repetition system**, so the ideas don't evaporate a week later.

## What's inside

- **6 courses, 24 lessons, ~290 cards** of original, fact-checked content: Cognitive Biases, Stoicism in Practice, The Psychology of Money, Learning How to Learn, The Art of Persuasion, and Logical Fallacies.
- **Interactive lesson player** — concept/example cards with custom illustrations, multiple-choice and true/false quizzes with instant feedback and explanations, think-first reveal cards, quotes, and recaps.
- **Spaced repetition built in** — completing a lesson adds its key ideas to a review deck scheduled with an SM-2-derived algorithm (Again / Hard / Good / Easy, expanding intervals, lapse handling).
- **Gamification that serves learning** — XP, levels with titles, a daily goal ring, and a streak that survives until midnight, plus a 12-week activity heatmap.
- **Full-text search** across every card (`/` to open), **13 achievements** with unlock toasts, synthesized **sound effects**, a **7-day review forecast**, a trickiest-cards list, and a missed-questions recap after each lesson.
- **Practice mode** — quick-fire quiz remixes drawn from lessons you've completed, per course or across the library; a **match-the-pairs bonus round** after every lesson; **mid-lesson resume** so leaving never loses your place; a 30-day XP history and a first-visit tour.
- **32 hand-drawn geometric SVG illustrations**, tinted per course; light/dark/system themes; full keyboard controls (1–4 to answer, Enter to continue, Esc to exit).
- **Mobile-first ergonomics** — safe-area insets, touch-action tuning, and layouts audited at phone widths; **backup & restore** moves progress between devices via the clipboard.
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
