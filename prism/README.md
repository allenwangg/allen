# Prism — learn visually, remember forever

Prism is a visual micro-learning app in the spirit of [Imprint](https://imprintapp.com), built to beat it where it counts: every lesson you finish feeds a real **spaced-repetition system**, so the ideas don't evaporate a week later.

## What's inside

- **114 courses, 456 lessons, 5,820 cards** of original, fact-checked content spanning psychology, philosophy, science, history, economics, health, technology, business, world cultures and the arts:
  Cognitive Biases, Stoicism in Practice, The Psychology of Money, Learning How to Learn, The Art of Persuasion, Logical Fallacies, Big Ideas in Physics, The Science of Habits, The Art of Strategy, Your Brain on Emotions, Ancient Wisdom of the East, Experiments That Changed Everything, How Economies Work, Negotiation, Probability and Luck, The Science of Happiness, The Science of Sleep, The Story of Evolution, The Art of Storytelling, The Climate System, Ethics: The Big Three, The Genius of Language, How the Internet Works, The Immune System, Money in History, Music and the Brain, Nutrition Without Nonsense, Space Exploration, The Stock Market, Explained, Turning Points of History, Attention in the Age of Distraction, The Riddle of Consciousness, Genes and Gene Editing, How AI Actually Works, How Things Spread, How to Live Forever, The Microbiome, The World in Data, Where Ideas Come From, The Science of Exercise, Writing Well, Why Things Look Good, Emotional Intelligence, What Makes a Leader, World Mythology, Personal Finance Basics, Reading the News, Speaking in Public, Everyday Chemistry, How to Look at Art, How Computers Think, Handling Conflict, Making Better Decisions, The Restless Earth, African Kingdoms, The Biology of Aging, China: Three Thousand Years, India's Intellectual Legacy, The Islamic Golden Age, What Actually Extends Life, How Minds Grow Up, Should You Live Forever?, Your Healthspan Playbook, Animals That Barely Age, Indigenous Knowledge, Japanese Aesthetics, The Americas Before and After, How Memory Works, How Life Began, The Secret Life of Plants, Radical Life Extension, The Russian Novel, Why Weather Happens, The Materials That Made Us, Music Theory Without Tears, The Ocean, How Your Senses Work, Building a Career, Why Humans Dance, How Film Works, How to Read a Poem, The Story of Western Music, Music of the World, Existentialism, What Makes Science Work, Seeing Photographically, Digging Up the Past, How Buildings Work, How New Things Get Built, How Do We Know Anything?, Do You Have Free Will?, The History of Medicine, How Doctors Think, Thinking in Logic, Political Philosophy, Understanding Risk, Statistics That Hold Up, Seeing Systems, What Animals Know, The World's Religions, How Nature Holds Together, The Fungal Kingdom, What Anthropology Sees, Reading the Night Sky, The Energy System, The Idea of Infinity, Law and Justice, The Meaning of Life, Codes and Secrets, Understanding Mental Health, How Cities Work, The Story of Population, Pain and the Placebo Effect, The Art of Theatre.
- **Fact-checked end to end** — all 5,820 cards were verified against sources: names, dates, figures, study attributions and quote wording. 81 corrections landed across 51 courses, including a Wason selection task printed with the wrong cards, Köhler's 1929 word given as its 1947 revision, antimicrobial-resistance deaths double-counted, and popular-but-wrong versions of famous studies.
- **Quizzes that actually test you** — measured and fixed three ways the answers used to leak: the correct option sat at position B 55% of the time, was the longest option 79% of the time (chance: 26%), and only 13% of true/false statements were true. All three now sit near chance, and `audit.mjs` keeps them there.
- **Interactive lesson player** — concept/example cards with custom illustrations, multiple-choice and true/false quizzes with instant feedback and explanations, think-first reveal cards, quotes, and recaps.
- **Spaced repetition built in** — completing a lesson adds its key ideas to a review deck scheduled with an SM-2-derived algorithm (Again / Hard / Good / Easy, expanding intervals, lapse handling).
- **Gamification that serves learning** — XP, levels with titles, a daily goal ring, and a streak that survives until midnight, plus a 12-week activity heatmap.
- **Ranked full-text search** across every card (`/` to open) — every query word must appear, matches on a word boundary outrank matches inside a word, and the whole phrase outranks the words scattered, **13 achievements** with unlock toasts, synthesized **sound effects**, a **7-day review forecast**, a trickiest-cards list, and a missed-questions recap after each lesson.
- **Today — one-tap smart sessions** that assemble due reviews, the right next lesson and a practice round into a single 5-minute plan, then run them back to back.
- **22 learning paths** — curated journeys through the library, each marking your next course; a path stays hidden until at least one of its courses ships, so content and configuration can drift without breaking the UI.
- **Read-aloud narration** at a natural pace (browser speech, no audio files, neural voices preferred) with optional hands-free auto-read; **bookmarked cards** kept in a Saved collection; **streak freezes** that cover a missed day automatically.
- **Adaptive practice** — quick-fire quiz remixes drawn from lessons you've completed, weighted toward the lessons your review history marks as shakiest, per course or across the library; a **match-the-pairs bonus round** after every lesson; **mid-lesson resume** so leaving never loses your place; a 30-day XP history and a first-visit tour.
- **62 hand-drawn SVG illustrations** set in soft pastel scenes and tinted per course; four themes (system / light / **pastel** / dark), every one of them audited so no text falls below WCAG AA; full keyboard controls (1–4 to answer, Enter to continue, Esc to exit).
- **Swipe to advance** — cards follow your finger, tilt, and fly out past the threshold or spring back; **a mastery map** on every course page shows what you have actually retained (Solid / Growing / Shaky) from how your review cards are holding up, not merely what you have visited.
- **Installs like an app, works with no signal** — a web app manifest and a service worker put Prism on your home screen, full-screen and offline: the whole library, your progress and every review are available on a plane. The home-screen icon carries a badge with the number of reviews you owe. The worker precaches the app shell as one atomic set and is stamped with a content hash at ship time, so new content never serves stale code.
- **Mobile-first ergonomics** — safe-area insets, touch-action tuning, and layouts audited at phone widths; **backup & restore** moves progress between devices via the clipboard.
- **Loads like a small app, not a 3 MB one** — browse, paths and course pages render from a 181 KB metadata index while the card text streams in behind first paint. On a throttled Fast 3G connection that took the library from 11.3s to 2.1s, and Slow 4G from 5.4s to 1.1s, with more content than before.
- **Zero dependencies, no build step required** — plain HTML/CSS/JS. Progress persists in `localStorage`.

## Making money

Prism has a free tier and a Pro tier, and the whole payment backend is one file.

**Free, always:** the first lesson of every course, twelve courses end to end,
reviews on anything you have learned, search, paths, practice, backup. That is
150 of 456 lessons. **Pro** opens the other 306 — $29 once, on every device.

The free tier is deliberately real: a free user can finish a course, earn a
certificate, build a review deck, and hit a streak. What they cannot do is get
past lesson one of the other 102 courses, and every one of those lessons sells
itself on its own locked page — the lesson's title and summary, the price, and
a button — with none of the card text in the page.

### Setup — about ten minutes

1. **Stripe:** create a Payment Link for the price you want. Under *After
   payment*, choose *Don't show confirmation page* and redirect to your app URL
   with the session id appended, exactly like this:
   `https://your-app.example/?session_id={CHECKOUT_SESSION_ID}`
2. **Vercel:** deploy this `prism/` directory as a project and set one
   environment variable, `STRIPE_SECRET_KEY`. `api/verify.js` is the entire
   backend. Optionally set `LICENSE_SECRET` so you can rotate the Stripe key
   later without retiring every license.
3. **This repo:** in `js/pricing.js` set `provider: 'stripe'` and paste the
   Payment Link into `checkoutUrl`. Adjust `price`, `freeCourses` and
   `freeLessonsPerCourse` to taste — `validate.mjs` checks the ids.

### How entitlement works — no database

Stripe is the ledger and the license token is the receipt. When a buyer comes
back from checkout, the app posts the session id to `api/verify`, which
confirms with Stripe that the session was paid and issues a small HMAC-signed
token: a session id, a plan, and a period end. No email, no name. The app keeps
that token and is Pro from then on, offline included — it is re-checked at
most once a day when online, and only an explicit *refunded* or *lapsed* from
Stripe revokes it. A network failure never does. Settings shows the token as a
license key so a buyer can restore Pro on another device by pasting it.
Subscriptions work the same way, with the period end refreshed on each check.

Until `provider` is set, the app runs as a free preview, and the key
`PRISM-DEMO` unlocks Pro locally so the whole flow can be tried. It stops
working the moment a real provider is configured.

An honest note: the lesson text ships with the app, and everything gates in
the browser. This keeps the product coherent for honest people; it is not DRM.

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
node validate.mjs        # structural checks on course content
node audit.mjs --strict  # quiz-design gate: answer position, length cue, true/false balance
node test/smoke.mjs      # 25 end-to-end checks (needs playwright-core + Chromium)
node test/features.mjs   # 24 checks: Today sessions, paths, saved cards, freezes, lazy data
node test/polish.mjs     # 13 checks: swipe gestures, mastery map, announcements
node test/single.mjs     # 9 checks: the shareable bundle, driven over file://
node test/pro.mjs        # 32 checks: free tier, paywall, license keys, Stripe return, refunds
node test/api.mjs        # 21 checks: api/verify.js against a mock Stripe (no browser)
node test/perf.mjs       # timings at full library size (load, search, stats, memory)
```

Every suite is path-independent, so it runs from any checkout. CI
(`.github/workflows/prism.yml`) validates content, runs all four suites in
headless Chromium and rebuilds the single-file bundle on every change under
`prism/`.

## Architecture

| File | Role |
| --- | --- |
| `js/app.js` | Hash router, all views, lesson player, Today sessions, review/practice/match |
| `js/srs.js` | SM-2-derived scheduler (grading, intervals, due queue) |
| `js/store.js` | Persistent state: XP, streaks, freezes, saved cards, deck, settings |
| `js/art.js` | 32-glyph SVG illustration library with pastel scene layer |
| `js/paths.js` | Learning-path definitions and per-path progress |
| `js/tts.js` | Narration: voice selection, pacing, text humanising |
| `js/achieve.js` | Achievement definitions and evaluation |
| `js/sfx.js` | Synthesized WebAudio sound effects |
| `js/pricing.js` | The one file to edit to start charging: provider, Payment Link, price, free tier |
| `js/pro.js` | Entitlement: what is locked, license keys, the daily re-check |
| `api/verify.js` | The entire backend: confirms a Stripe session, issues and validates license tokens |
| `js/data/index.js` | Course metadata, generated by `ship.mjs` — what browse needs |
| `js/data/courses.js` | All course content (structured card data), loaded lazily |
| `css/app.css` | Design system: tokens for all four themes, every component |
| `sw.js` | Service worker: precached shell, offline routing, versioned caches |
| `manifest.webmanifest` | Install metadata: icons, shortcuts, standalone display |

Keyboard shortcuts: `1–4` answer/grade · `Enter`/`Space` continue/flip · `Esc` exit · `/` search · `?` shortcut list.
