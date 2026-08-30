# VitalArc

A local-first healthspan tracker whose distinguishing feature is that **it
refuses to tell you things it cannot support.**

Log your habits, get a transparent score, and — once you have enough data — find
out which of those habits genuinely move your numbers, established by permutation
testing and false-discovery-rate correction rather than by eyeballing a chart.

On pure noise, the insight engine reports nothing. That is the point.

## Quick start

```bash
npm install      # only needed for the browser test
npm run serve    # http://localhost:8080/app/
npm test         # 104 unit tests, no dependencies
npm run e2e      # full browser walkthrough (needs the server running)
```

There is no build step. The app is ES modules served as-is.

One thing to run before deploying:

```bash
npm run stamp-sw   # writes a content hash of the app shell into app/sw.js
```

A service worker only installs a new cache when its own bytes change, so a
stale `VERSION` pins every existing installation to the old build forever.
CI fails if the stamp is out of date.

## What it does

- **Log 24 fields** — 20 daily habits across sleep, movement, nutrition,
  recovery and substances, plus 4 optional biomarkers. Sliders with sensible defaults; a normal day takes
  under a minute.
- **Healthspan Score**, six pillars, built from piecewise dose-response curves
  so non-monotonic relationships are expressed honestly. Every point is
  traceable. See [docs/SCORING.md](docs/SCORING.md).
- **Personal insights** — lagged correlations across your own log, filtered
  through detrending, a permutation test with a calibrated tail, and BH FDR
  control. See [docs/INSIGHTS.md](docs/INSIGHTS.md).
- **What-if simulator** — test a change against your own 28-day average day
  before committing to it. It will tell you when a change would not help.
- **Highest-leverage actions** — every candidate nudge simulated and ranked,
  rather than generic advice.
- **Sample mode** — one tap loads a 90-day synthetic tour with genuinely
  planted patterns, so every Pro view can be judged before logging a single
  real day. Labelled on every screen, blocked from mixing with real data.
- **Works offline**, installable as a PWA, and your data never leaves the device.

## Architecture

```
index.html              landing page
app/
  index.html            app shell
  css/app.css           design system, light + dark via CSS custom properties
  js/
    model.js            schema, validation, date handling
    engine.js           scoring curves, pillars, bio-age, simulator
    insights.js         correlation discovery + the statistics
    store.js            IndexedDB with localStorage fallback
    entitlements.js     free/Pro gating, trial and subscription state
    charts.js           dependency-free SVG charts
    ui.js               views (pure state -> HTML)
    app.js              state, routing, event delegation
    billing.js          Stripe Checkout, client half
api/                    four serverless billing endpoints
docs/                   scoring, insights, monetization
tests/                  104 unit tests + a browser walkthrough
```

No frameworks and no runtime dependencies. The only dev dependency is Playwright
for the browser test.

## The engineering worth reading

An adversarial audit (parallel finder agents per dimension, findings verified
by reproduction before fixing) later found and fixed a further class of
problems, the worst being **weekday confounding**: habits that each follow
their own day-of-week rhythm correlate through the shared weekday without any
causal link, and the engine reported ~12 such findings per rhythm-only
dataset. Day-of-week means are now conditionally removed exactly as the time
trend is; measured false positives on rhythm-only data went from 20/20
datasets to 0/20 with recall unchanged at 100%. The same audit surfaced a
billing-portal IDOR (fixed with HMAC proof-of-ownership tokens), a simulator
that averaged bedtimes across midnight to noon, and a save path that toasted
"Day saved" over a swallowed quota error. docs/INSIGHTS.md records the full
statistical history.

### The original three

Three bugs found during validation, all of the kind that ship silently:

1. **A boot hang with an empty console.** The IndexedDB helper resolved with the
   raw `IDBRequest` whenever a lookup returned `undefined`; awaiting it waited
   forever on an `onsuccess` that had already fired. A first-run profile lookup
   legitimately returns `undefined`, so the app hung on first load — and a
   pending promise throws nothing.

2. **A p-value floor that discarded overwhelming evidence.** Circular-shift
   permutation admits only *n−1* rotations, flooring the empirical p at 1/*n* —
   about 9× too coarse to survive FDR correction across 100 hypotheses. A
   planted Spearman of −0.91 was being thrown away by arithmetic.

3. **Spurious correlations from a shared time trend.** On data where every habit
   improved together over months, the engine produced twelve confident findings
   of which one was real. Detrending both series first leaves exactly the true
   one, essentially unattenuated.

4. **A correction that caused the opposite error.** That same detrending broke
   sparse variables: alcohol is zero on most days, those zeros are *ties*, and
   subtracting a fitted line gives each one a different residual ordered by
   date — manufacturing a calendar ranking in a variable that had none. A real
   effect fell from r = −0.75 to −0.46 and stopped clearing correction.

5. **An unstable null.** With only *n−1* circular shifts available, two datasets
   carrying the same planted effect (r = −0.745 and −0.734) returned p-values
   two orders of magnitude apart. Adding moving-block bootstrap surrogates took
   recall on realistic weekend-clustered data from 47% to 100%.

Each is documented at the site of the fix and covered by a regression test.

Measured across 82 independent 120-day datasets that contain no real effect —
40 pure noise, 30 where every habit improves together, 12 where every habit
follows its own weekly rhythm — the engine reports **nothing at all**. A
genuine planted effect is recovered **100%** of the time, with or without a
confounding trend and with or without weekly clustering. `npm test`
reproduces every one of those numbers.

## Status

Complete and working: all six views, the paywall, offline support, export and
import, and the full analysis pipeline, verified end to end in Chromium.

Billing runs in **demo mode** until you add `app/billing-config.json` and deploy
[the API](api/README.md) — the app says so plainly rather than pretending a
payment occurred.

## Disclaimer

VitalArc is a wellness and habit-tracking tool, **not a medical device.** It does
not diagnose, treat, cure or prevent any disease. Healthspan Age is an
illustrative estimate derived from self-reported habits, not a clinical
measurement. Correlations found in your log show what moves together; they cannot
prove causation. Consult a qualified clinician about your health.
