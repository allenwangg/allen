# Repository guide

The main project is **Prism** (`prism/`), a zero-dependency visual learning web app
(vanilla HTML/CSS/JS, no build step needed to run). `that_was_easy/` and the root
`index.html` are unrelated leftovers — leave them alone.

## Prism quick reference

- Run: serve `prism/` statically (`python3 -m http.server`) or open `prism/index.html`.
- Single-file build: `node prism/build.mjs` → `prism/dist/prism.html` (dist/ is gitignored).
- Ship content: `node prism/ship.mjs` — merges staged courses, rebalances quiz answer
  positions, regenerates `js/data/index.js`, stamps `sw.js`, rewrites README counts, rebuilds.
- Validate: `node prism/validate.mjs` (structure, art keys, browse filters, pricing ids) and
  `node prism/audit.mjs --strict` (quiz design: position, length cue, true/false balance).
- Tests: `PLAYWRIGHT_CORE=<path to playwright-core> CHROMIUM=<chromium binary> node prism/test/<suite>.mjs`
  for smoke, features, polish, pwa, contrast, single, pro; `node prism/test/api.mjs` needs no browser.
  All must pass before committing app changes; CI (`.github/workflows/prism.yml`) runs them all.

## Architecture

| File | Role |
| --- | --- |
| `prism/js/app.js` | Hash router, all views, lesson player, Today, review/practice/match, search, settings, Pro surfaces |
| `prism/js/srs.js` | SM-2-derived spaced-repetition scheduler |
| `prism/js/store.js` | Persistent state (localStorage `prism.v1`): XP, streaks, deck, settings |
| `prism/js/art.js` | 62-glyph SVG illustration library (keys referenced by content) |
| `prism/js/pricing.js` | Pricing config: provider, Payment Link, price, free tier |
| `prism/js/pro.js` | Pro entitlement: locking, license keys, daily re-check |
| `prism/api/verify.js` | The backend (one Vercel function): confirms Stripe sessions, signs/validates tokens |
| `prism/js/paths.js` | 22 learning paths |
| `prism/js/achieve.js` | Achievement definitions + evaluation |
| `prism/js/sfx.js` | WebAudio sound effects |
| `prism/js/data/courses.js` | All course content (`window.COURSES_FULL`): 114 courses × 4 lessons, loaded lazily |
| `prism/js/data/index.js` | Generated metadata (`window.COURSES`) the browse views render from |
| `prism/css/app.css` | Design system — light tokens on `:root`, dark via media query AND `[data-theme]` |

## Conventions

- Plain ES5-ish scripts loaded via `<script src>` (order matters: art, sfx, achieve, paths, tts,
  srs, store, pricing, pro, data/index, app). No modules, no npm dependencies — keep it that way.
  `js/data/courses.js` is fetched after first paint; anything reading a card goes through `withData()`.
- Every color must be a token defined in all three theme blocks in `app.css`
  (`:root`, the `prefers-color-scheme` block, `[data-theme="dark"]`); `test/contrast.mjs` holds WCAG AA.
- Never edit `js/data/courses.js` by hand for content: stage a course JSON and run `ship.mjs`.
- Gating: `Pro.lessonLocked(course, index)` is the only question a gate asks; card text must
  never reach the DOM on a locked page.
- Content cards: `intro|concept|example|quote|mcq|truefalse|reveal|recap`; art keys must
  exist in `art.js`; run `validate.mjs` after touching content.
- All user-visible strings flow through `esc()` before `innerHTML`.
