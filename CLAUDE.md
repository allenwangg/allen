# Repository guide

The main project is **Prism** (`prism/`), a zero-dependency visual learning web app
(vanilla HTML/CSS/JS, no build step needed to run). `that_was_easy/` and the root
`index.html` are unrelated leftovers — leave them alone.

## Prism quick reference

- Run: serve `prism/` statically (`python3 -m http.server`) or open `prism/index.html`.
- Single-file build: `node prism/build.mjs` → `prism/dist/prism.html` (dist/ is gitignored).
- Validate content: `node prism/validate.mjs` — structural checks on `js/data/courses.js`.
- E2E test: `PLAYWRIGHT_CORE=<path to playwright-core> CHROMIUM=<chromium binary> node prism/test/smoke.mjs`
  (18 checks; must pass before committing app changes).

## Architecture

| File | Role |
| --- | --- |
| `prism/js/app.js` | Hash router, all views, lesson player, review session, search, settings |
| `prism/js/srs.js` | SM-2-derived spaced-repetition scheduler |
| `prism/js/store.js` | Persistent state (localStorage `prism.v1`): XP, streaks, deck, settings |
| `prism/js/art.js` | 32-glyph SVG illustration library (keys referenced by content) |
| `prism/js/achieve.js` | Achievement definitions + evaluation |
| `prism/js/sfx.js` | WebAudio sound effects |
| `prism/js/data/courses.js` | All course content: 6 courses × 4 lessons, strict card schema |
| `prism/css/app.css` | Design system — light tokens on `:root`, dark via media query AND `[data-theme]` |

## Conventions

- Plain ES5-ish scripts loaded via `<script src>` (order matters: art, sfx, achieve, srs,
  store, courses, app). No modules, no npm dependencies — keep it that way.
- Every color must be a token defined in all three theme blocks in `app.css`
  (`:root`, the `prefers-color-scheme` block, `[data-theme="dark"]`).
- Content cards: `intro|concept|example|quote|mcq|truefalse|reveal|recap`; art keys must
  exist in `art.js`; run `validate.mjs` after touching content.
- All user-visible strings flow through `esc()` before `innerHTML`.
