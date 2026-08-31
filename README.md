# VitalArc

A private notebook for working out what is actually affecting how you feel.

You track the symptoms you actually have — not somebody else's idea of
wellness — and it looks for what moves with them, lets you test a suspicion
properly, and prints one page you can hand to a doctor.

It cannot diagnose you, treat you, or cure anything, and it will never tell you
what condition you have or what to take for it. What it can do is stop you
guessing, and make the guessing that is left somebody qualified's job with
better information in front of them.

## Quick start

```bash
npm install       # only for the browser test
npm run serve     # http://localhost:8080/app/
npm test          # 128 unit tests + the copy guard, no dependencies
npm run e2e       # browser walkthrough (needs the server running)
npm run stamp-sw  # before deploying — see below
```

No build step. The app is ES modules served as they are.

## What it does

- **Your symptoms, named by you.** Migraine, bloating, joint pain, brain fog,
  low mood — whatever it actually is. Rated daily in one tap each.
- **Your suspicions, named by you.** Dairy, a stuffy bedroom, screens after ten,
  the days you drive to work. The twenty built-in habits are a guess at what
  matters for most people; these are for what you actually think is going on,
  and they enter the analysis exactly like the built-in ones.
- **Finds what moves with them.** Lagged rank correlations across your own log,
  with time trends and weekly rhythms removed first, permutation-based
  p-values, and multiple-comparison correction done *per symptom* so tracking a
  second one never costs accuracy on the first.
- **Tests a suspicion properly.** Block-randomised n-of-1 trials: pick one
  change — including one of your own factors, as "avoid it" versus "carry on" —
  pre-register what you are measuring, and get an exact randomisation test at
  the end. This is the only part of the app that can support the sentence
  "this helped".
- **Knows when to send you elsewhere.** Conservative flags for patterns worth
  raising with a doctor — never a diagnosis, never reassurance.
- **Prints for an appointment.** Chief complaint and timeline first, then
  measurements, then what you have already ruled out, then correlations last.
- **Works offline**, installs as a PWA, and never sends anything anywhere.

## Where your data goes

Nowhere. Everything lives in your browser on your device. No account, no
server, no analytics, nothing uploaded — which also means nobody is backing it
up for you, so the export button matters.

## Architecture

```
index.html              front door
app/
  index.html            app shell
  css/app.css           design system, light + dark
  js/
    model.js            day schema, symptoms, factors, validation
    engine.js           habit scoring from dose-response curves
    insights.js         correlation discovery and the statistics
    experiments.js      n-of-1 trial design, analysis and verdicts
    safety.js           when to stop logging and see someone
    store.js            IndexedDB with a localStorage fallback
    sample.js           example data so the app is judgeable on day one
    charts.js           dependency-free SVG charts
    ui.js               views (pure state -> HTML)
    app.js              state, routing, event delegation
docs/                   scoring and insights methodology
tests/                  128 unit tests, a copy guard, a browser walkthrough
```

No frameworks, no runtime dependencies. Playwright is the only dev dependency.

## The engineering worth reading

Most of this codebase's history is bugs found by trying to break it rather than
by reading it, and the pattern is consistent: the dangerous ones all looked
correct and had no failing test.

**The statistics kept being confidently wrong.** A p-value floored by the
number of circular shifts silently discarded a correlation of −0.91. A Gaussian
tail fitted to a 120-sample null invented findings on 20% of pure-noise
datasets. Naive detrending broke the tied zeros in sparse variables and
destroyed a real effect while trying to prevent false ones. Independent weekly
rhythms — the most ordinary structure in human habit data — manufactured twelve
confident findings per dataset until day-of-week means were removed too. Each
is documented at the site of the fix in `docs/INSIGHTS.md` and covered by a
regression test.

**The n-of-1 engine hit the same wall from the other side.** A trial's
reference set is the 2^K ways its coins could have landed, so a five-pair trial
cannot return a significant result however large the effect. The app refuses to
create one, and shows you the best p-value your chosen length could ever reach
before you commit five weeks to it.

**Silence is the feature.** On 82 datasets containing no real effect — pure
noise, habits all improving together, and independent weekly rhythms — the
engine reports nothing at all. On 20 null trials, zero positive verdicts. That
is the whole reason to believe it when it does say something.

## Disclaimer

VitalArc is a personal notebook, **not a medical device**. It does not
diagnose, treat, cure or prevent any disease, and nothing in it is medical
advice. The habit score summarises what you logged; it says nothing about
whether you are well. Patterns it finds show what moves together in your log
and cannot prove one thing caused another. If something about your health
worries you, or a symptom is severe, new, or getting worse, talk to a doctor
rather than to this app.
