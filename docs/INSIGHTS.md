# The insight engine

Finding real signal in one person's noisy daily log is the hard part of this
product, and getting it wrong is worse than not shipping it. An app that tells
someone "your fiber intake is raising your heart rate" on the strength of noise
has actively harmed them.

This document records what the engine does and — more usefully — the two bugs
found while validating it, because both are the kind that ship silently.

## The pipeline

Drivers are the twenty built-in habits **plus any factors the user has named**
— dairy, late screens, a long commute. Without those, the engine can only ever
answer questions it thought of, which is no use to someone whose actual
suspicion is not on the list.

Outcomes are the things you want explained: the symptoms you named, plus mood,
energy, sleep quality, stress and the two heart measures. **One
Benjamini–Hochberg correction covers all of them.**

An earlier version corrected within each symptom separately, reasoning that
pooling would mean tracking a second symptom made the app worse at explaining
the first. That reasoning was about thresholds on paper and did not survive
measurement — see Guard 8.

For every (driver, outcome, lag) combination, where lag ∈ {0, 1, 2} days:

1. **Pair the days.** Driver on day *d*, outcome on day *d+lag*. Missing days
   break the chain rather than being interpolated — inventing data in order to
   find correlations in it is the cardinal sin of this category.
2. **Detrend both series** against elapsed time, and **remove day-of-week
   means** — each only where that structure actually exists (see below).
3. **Spearman rank correlation.** Self-reported 1–5 scales are ordinal and
   lumpy; Pearson overstates linear structure in them.
4. **Permutation test** against a null built from circular shifts *and*
   moving-block bootstrap surrogates, with a Student-t calibrated tail.
5. **Benjamini–Hochberg FDR** across the entire hypothesis grid at q = 0.10.
6. Report survivors with |r| ≥ 0.20, best lag only, phrased in the units the
   user logged in, alongside a scatter plot of the actual evidence.

Same-day pairs between two self-reported fields (stress and mood, say) are
excluded outright. A bad day makes you rate stress high and mood low in the same
sitting; that is a tautology, not a finding.

## Guard 1 — the p-value floor

Circular shifts preserve each series' autocorrelation while destroying the
cross-series alignment, which is the null hypothesis we actually mean. A plain
shuffle would destroy the autocorrelation too, understating the null variance
and manufacturing significance.

But a length-*n* series has only *n−1* rotations, so an empirical p-value cannot
go below 1/*n*. With ~100 hypotheses under FDR correction, the top-ranked test
must clear roughly q/m ≈ 0.001 — and a 120-day series floors at 0.0083.

**A planted Spearman of −0.91 was silently discarded by arithmetic.** Not
conservatism; a broken instrument.

The fix is to use the surrogates to *estimate the null distribution* rather than
merely count exceedances: Fisher-z transform the null correlations, fit a
location-scale family, read the tail. Empirical counting is still used whenever
there are ≥ 10 exceedances to count.

## Guard 2 — the tail that was too thin

Fitting that null with a **Gaussian** then claimed p = 2 × 10⁻⁹ from a
120-sample null — indefensible, and it produced findings on pure noise in 20% of
datasets.

Replaced with a **Student-t** fit. Degrees of freedom chosen by sweep against 40
noise datasets and 120 planted-signal datasets:

| df | False positives | Recall (moderate) | Recall (weak) | Recall (strong) |
|---|---|---|---|---|
| 6 | 0% | 65% | 5% | 98% |
| **14** | **0%** | **98%** | **78%** | **100%** |
| 20 | 3% | 100% | 88% | 100% |
| 30 | 8% | 100% | 90% | 100% |

df = 14 is the knee. Past it we buy weak-signal recall with fabricated findings,
which is the wrong trade: a user acting on an invented correlation is worse off
than one told nothing.

## Guard 3 — an unstable null

Circular shifts are the exact null for a stationary series, but there are only
*n−1* of them. Estimating a distribution's tail from ~119 samples turns out to
be badly unstable in practice: two datasets carrying the same planted effect,
with correlations of −0.745 and −0.734, produced p-values two orders of
magnitude apart. The second failed correction; the first sailed through.

That is not a threshold problem, it is estimator variance. Recall on realistic
weekend-clustered drinking data sat at **47%** — the engine was finding a real,
strong effect and then throwing it away on a coin flip.

Adding **moving-block bootstrap** surrogates fixes it. Blocks of seven days
preserve autocorrelation — and the weekly rhythm that dominates real habit data,
since drinking, training and eating out all follow one — while destroying
alignment with the other series. Unlike shifts, there is no limit on how many
can be drawn, so the null's spread is estimated from a sample large enough to be
stable. Recall on that scenario went to **100%**.

## Guard 4 — detrending sparse variables

Detrending has a failure mode of its own, and it is not obvious.

Alcohol in a realistic log is **zero on most days**. Those zeros are *ties*, and
Spearman depends on them staying tied. Subtracting a fitted line gives every one
of them a slightly different residual, ordered by date — so a variable with no
time structure whatsoever acquires a complete monotone ranking derived from the
calendar.

Measured effect: the true alcohol → next-day-energy correlation fell from −0.75
to −0.46 and stopped clearing correction. **The correction meant to prevent
false positives was causing false negatives instead.**

Detrending is a correction for a confound, so applying it where no confound
exists can only add noise. A series is now detrended only when a linear time
trend explains at least 5% of its variance.

## Guard 5 — the weekday is a lurking variable

Habits follow weekly rhythms: weekend drinking, Monday stress, Sunday lie-ins.
Any two rhythmic series correlate through the shared weekday without one
influencing the other at all. Measured: 20 of 20 synthetic users with
INDEPENDENT weekday profiles and zero cross-effects received ~12 confident
findings each — "on your higher-caffeine days, resting HR runs lower two days
later, r = −0.74" — every one of them the calendar.

The null cannot be patched around this: circular shifts at multiples of seven
re-align the rhythms (fat tail) while block-bootstrap surrogates with random
phase destroy them (thin tail), so any pooling of the two families mis-states
the spread. The fix removes the confound at the source, exactly as detrending
does for the slow drift: day-of-week group means are subtracted from both
series — conditionally, only when the weekday explains at least 15% of a
series' variance (fitting seven group means to 120 random points soaks up ~5%
by chance), so sparse tied variables keep their ties.

After the fix: 0 of 12 rhythm-only datasets produce anything in the suite (0 of
20 in the wider sweep it was tuned against), and recall on a
genuine effect planted *inside* a weekend drinking rhythm is still 100%.

## Guard 6 — honest uncertainty, honest magnitudes

Three smaller corrections in the same spirit:

- **Confidence intervals use an effective sample size.** Two smooth 120-day
  series carry far fewer than 120 independent observations; the nominal-n
  interval covered the true value only 78.8% of the time on AR(0.7) pairs.
  With the Bartlett correction from the two series' lag-1 autocorrelations,
  measured coverage is 96.2% at nominal 95%.
- **The surrogate seed hashes the data, never the observed statistic** — a
  seed that moves with the effect size makes the p-value non-monotone in it.
- **Practical effects split at a value threshold, not an array position.**
  A positional median split dilutes zero-inflated drivers (alcohol is zero on
  most days) with the same zeros on both sides; the threshold split lands on
  "days you did vs days you didn't", which is also the honest sentence.

## Guard 7 — spurious time trends

This is the failure mode most likely to reach a real user. Someone who starts
taking their health seriously improves many habits at once: protein up, fiber
up, ultra-processed down, resting heart rate drifting down over the same months.
Every pair correlates strongly, and every correlation is the calendar.

On 120 days of synthetic data with exactly that structure plus one genuine
day-to-day effect, the raw analysis produced **twelve confident findings, of
which one was real.**

Removing the least-squares line in time from both series before correlating
leaves the day-to-day covariation — the part the user can act on. After
detrending: **one finding, the real one, essentially unattenuated** (r = −0.74,
unchanged).

This is the spurious-regression problem (Yule, 1926). It is old, well
understood, and almost universally ignored in consumer health apps.

## Measured behaviour

Independent 120-day datasets per scenario:

| Scenario | Findings/dataset | Planted effect recovered |
|---|---|---|
| Pure iid noise, no real effect | 0.00 | n/a — **0 of 40 datasets produced anything** |
| Habits all trending, no real effect | 0.00 | n/a — **0 of 30 datasets produced anything** |
| Independent weekly rhythms, no real effect | 0.00 | n/a — **0 of 12 datasets produced anything** |
| Planted effect, no trend | 1.00 | **100%** |
| Planted effect + confounding trend | 1.00 | **100%** |
| Planted effect, weekend-clustered driver | 1.00 | **100%** |
| Planted effect, trend *and* weekend-clustered | 1.03 | **100%** |
| AR(1) noise, φ ∈ {0, .5, .8} | — | P(p ≤ .01) at or under nominal |

The rows that matter most are the no-effect ones: on data containing no real
day-to-day relationship the engine reports nothing at all — including when
every habit improves together over months, and when every habit follows its
own weekly rhythm, the two cases that fool naive analysis (and, before these
guards existed, fooled this engine).

## What it still cannot do

- **Correlation is not causation.** A third factor may drive both. The UI says
  this every time findings are shown, not once in the footer.
- **Self-report is biased.** People misremember portions and round their sleep.
- **Detrending removes real slow effects too.** Where a genuine trend exists,
  a habit that helps only over months will not appear. That is the accepted cost
  of not reporting eleven false things in order to catch one slow true one.
- **Three lags only.** Effects with a longer delay are invisible.

## Guard 8 — one error budget, not six

Splitting the correction per symptom gave each symptom its own 10% false-
discovery budget, and the person sees the union of those budgets. Measured over
40 datasets containing no real effect:

| scheme | noise datasets leaking a finding | recall on a planted effect |
|---|---|---|
| per-symptom families | 3–4 of 40 | 100% |
| one global correction | **0 of 40** | 98–100% |

Holding the effect fixed while growing the symptom count from 1 to 10 — 288 to
666 hypotheses — the global correction kept **100% recall at every count with
zero leaks**, while the family split leaked at every count above one.

The dilution the split was designed to prevent does not happen, because the
permutation tail gives a genuine effect a p-value around 1e-8, which clears
q/m with enormous margin even at 666 tests. The split was solving a problem
that only exists for effects too weak to be worth reporting, and paying for it
with fabricated findings.

The symptom groups survive in the UI, but only as reporting ("48 relationships
tested for your migraine, none held up"). They are not correction boundaries.

## What "nothing held up" is worth

This is the app's most common output, so presenting it as a settled negative
would be the most frequent overclaim it makes. Measured recall of a genuine
planted effect, by history length and true correlation strength:

| | \|r\| = 0.32 | \|r\| = 0.55 | \|r\| = 0.71 |
|---|---|---|---|
| 90 days | 8% | 84% | 100% |
| 120 days | 12% | 100% | 100% |
| 180 days | 56% | 100% | 100% |

An empty result therefore rules out a *strong* day-to-day driver among the ones
tested. It says little about a moderate one, and nothing at all about causes
the app cannot see — which is most of medicine. `sensitivityNote()` turns the
user's actual history length into a sentence saying so, and it is shown
wherever an empty result appears.

## Effects that build up over a week

Some things do not act in a day. Sleep debt, accumulated stress and a slow
dietary drift build, and a symptom that follows a bad *week* is invisible to a
single-day correlation. Measured, for an effect driven by the previous n
nights of sleep:

| accumulation window | detected (single-day drivers only) | with weekly windows |
|---|---|---|
| 1 night | 20/20 | 20/20 |
| 4 nights | 19/20 | 20/20 |
| 7 nights | **0/20** | **18/20** |
| 10 nights | 0/20 | 3/20 |

So the grid also tests trailing seven-day means, for the ten fields where "a
bad week" is a real thing. Two details keep that honest:

- **A window is never compared against its own outcome.** A window ending on
  day *d* contains day *d*, so "your stress over the past week" against "your
  stress today" is partly a variable correlated with itself. That tautology was
  the only thing leaking when windows were added — 2 of 25 noise datasets, both
  of exactly that shape. Excluded, the leak returns to 0 of 25.
- **The bootstrap block length scales with the series' own smoothness.** A
  block has to outlast the dependence it is breaking, and a seven-day mean is
  smooth by construction — consecutive values share six of seven terms. Blocks
  are now sized from the measured lag-1 autocorrelation.

Cost: the grid grows about 44% (372 to 533 hypotheses on a three-symptom log),
with single-day recall unchanged at 100% and the no-effect leak still 0 of 25.

## Where correlation stops

Everything above can only ever generate hypotheses. If you want to know whether
something actually helps *you*, `app/js/experiments.js` runs block-randomised
n-of-1 trials — the only part of this app that can support a causal sentence.
Its own hard constraint is worth knowing: the reference set is the 2^K ways the
trial's coins could have landed, so fewer than six block-pairs cannot produce a
significant result however large the effect, and the app refuses to create one.

Run `npm test` to reproduce every number in this document.

## The weekday, reported instead of only removed

Guard 5 measures each series' day-of-week effect and subtracts it where it is
strong enough, so that two habits sharing a weekly rhythm do not correlate
through the calendar. For a long time that measurement was used to clean the
data and then discarded — which threw away one of the most useful things a log
can say. "Your migraines are a weekend thing" does not point at a habit; it
points at something structural about those days, and it is worth an appointment.

The app now reports it, per symptom, with a test attached.

**What it replaced.** The old version scored the composite health score by
weekday and told everybody their worst day, with no significance test at all —
best-mean-minus-worst-mean, which noise produces every time. It also carried
the line "most people find one specific day is quietly costing them", which was
never measured and is not the kind of claim this app makes.

**Why a plain shuffle, when the correlation engine next door uses circular
shifts.** Circular shifts are right there because they preserve each series'
own structure while destroying the alignment *between* two series. Here there
is one series, and its 7-day periodicity *is* the hypothesis — and a circular
shift preserves periodicity. Shifting a series whose Mondays are bad simply
makes some other weekday the bad one, with almost the same η², so the null is
nearly invariant under the alternative it is meant to detect.

Measured over 200 datasets of 120 days with a real 1-point Monday effect:

| lag-1 autocorrelation | circular shift | free shuffle |
|---|---|---|
| 0.0 | 0.46 | 0.99 |
| 0.4 | 0.50 | 0.99 |
| 0.6 | 0.57 | 0.99 |
| 0.8 | 0.62 | 0.99 |

**The cost of the shuffle, measured rather than assumed.** A free shuffle
destroys the series' autocorrelation, which is normally the reason to avoid
one. Here the error runs in the safe direction: runs of bad days land across
all seven weekday buckets, because consecutive days are always in different
buckets, so the observed η² is if anything suppressed relative to the shuffled
null. False-positive rate at p ≤ .05, 1000 datasets per cell, on series with no
weekday structure at all:

| condition | P(p ≤ .05) |
|---|---|
| autocorrelation 0 | 0.046 |
| autocorrelation 0.5 | 0.013 |
| autocorrelation 0.75 | 0.002 |
| autocorrelation 0.85 | 0.000 |
| only 70% of days logged | 0.021 |
| symptom nearly always absent | 0.030 |
| symptom nearly always present | 0.029 |

Nominal where it matters and conservative everywhere else — at the cost of
missing real effects in the most strongly clustered series.

**A hypothesis that did not survive contact with measurement.** A 28-day cycle
is exactly four weeks, so it looked as though a monthly symptom cycle would
alias onto the weekly grid and manufacture a weekday pattern. It does not: each
weekday collects days spaced 7 apart, which sample the full cycle at four
phases that average out. Measured false-positive rate on a real 28-day cycle
with no weekday cause: 0.015. The concern was real enough to test and wrong.

**The other guards still apply.** Testing seven symptoms and reporting the one
with the best-looking week is the same multiple-comparisons trap the rest of
the engine exists to avoid, so the same Benjamini-Hochberg correction runs
across the family. A claim also needs 21 logged days, at least three
observations on six of the seven weekdays, and at least seven days on which the
symptom was actually present — three flare days make a perfect-looking week.

## The assumption every other guard rests on

Everything in this document is computed on the days that were logged, and
silently assumes the unlogged ones went missing for reasons unrelated to how
the person felt. That assumption fails in exactly the way that matters most:
people stop logging during the worst stretches — too ill, too busy, too
demoralised — and pick it up again when things settle. When that happens the
engine draws its conclusions from a systematically milder version of someone's
life, every effect is attenuated, and no other guard here would notice.

It cannot be tested directly, because the severity of an unlogged day is
precisely what is unknown. What can be tested is the severity of the logged
days on either side of a gap: if bad stretches go unrecorded, those days are
the shoulders of those stretches and run worse than the rest.

**The null.** Two series — the symptom and the pattern of gaps — with the
alignment between them under test, so circular shifts are right here, exactly
as they are for correlations and exactly as they are *not* for the weekday
test above. Shifting the gap mask around the calendar preserves both the
clustering of the gaps and the autocorrelation of the symptom, and changes only
which days the gaps happen to land beside.

Measured over 2500 datasets per cell where days go missing for reasons
unrelated to severity, the p-values come out uniform, which is what a
calibrated test looks like across its whole range:

| condition | P(p≤.05) | P(p≤.10) | P(p≤.20) | P(p≤.50) |
|---|---|---|---|---|
| 180 days, isolated missing days | 0.052 | 0.103 | 0.206 | 0.504 |
| 120 days, isolated missing days | 0.056 | 0.107 | 0.207 | 0.496 |
| 120 days, autocorrelation 0.7 | 0.051 | 0.095 | 0.203 | 0.491 |
| 180 days, multi-day gaps | 0.046 | 0.098 | 0.203 | 0.515 |
| 120 days, multi-day gaps | 0.037 | 0.086 | 0.191 | 0.493 |

Against logs where the bad days genuinely were dropped, it fires 32–47% of the
time. That is deliberately unhurried: this claim undermines every other finding
on the page, and telling someone their data is untrustworthy on the strength of
a coincidence is worse than missing it.

**One-sided, on purpose.** A log that skips the *good* days is biased too, but
not in a direction that would make someone act on a symptom they do not have.

**It is a caveat, not a reprimand.** Someone who stopped logging for a
fortnight because they were floored does not need to be told off by a phone.
The wording says what the gaps do to the numbers, notes that a severity rating
on its own would close it, and stops there. An end-to-end test asserts the card
appears on both the insights view and the report, and separately that it
contains none of "should have", "failed to", "you must", "be better".

## "Keep logging" with a number attached

Someone logs for three months, the app reports that nothing held up, and they
stop. That is the single most likely way this app fails a person — and whether
stopping was reasonable depends entirely on how much power three months buys,
which the app used to describe from intuition.

The wording it used was wrong in the direction that does harm. It told someone
with 60 days that "only a strong day-to-day driver would reliably show up".
Measured, a strong driver shows up 20% of the time at 60 days. Read next to
"nothing held up", that invites exactly the wrong conclusion, and it would have
been wrong four times in five.

`POWER_CURVE` now holds measurements instead. Each cell is 50 synthetic logs
run through the real `discover()`: sixteen habit fields plus one symptom, a
single next-day effect of β standard deviations planted from late caffeine onto
that symptom, and a hit counted only when a surviving finding names that driver
and that outcome.

| days logged | weak (β=0.25) | moderate (β=0.40) | strong (β=0.60) |
|---|---|---|---|
| 60  | 0.00 | 0.02 | 0.20 |
| 90  | 0.00 | 0.12 | 0.54 |
| 120 | 0.02 | 0.32 | 0.86 |
| 150 | 0.06 | 0.46 | 0.96 |
| 180 | 0.10 | 0.74 | 1.00 |
| 240 | 0.14 | 0.84 | 1.00 |
| 300 | 0.20 | 0.96 | 1.00 |

Three things follow from the shape of that table, and all three are now said
out loud rather than left for the user to infer:

- **Three months is not a null result.** At 90 days a moderate driver is found
  once in eight attempts. "Nothing held up" at that length is a statement about
  the length.
- **The gap between 120 and 180 days is where most of the value is.** Moderate
  recall goes 0.32 → 0.74 across those two months. That is the single most
  useful thing to tell someone deciding whether to carry on, so the note names
  the number of days to the next milestone rather than saying "keep logging".
- **A weak driver is not reachable.** It tops out at 0.20 even after ten months,
  so the note never offers a milestone for one. Promising a length that would
  deliver it would be a lie with a number on it.

`chancePhrase` refuses to round 0.96 up to a certainty, and the interpolation
holds the last measured value beyond 300 days rather than extrapolating — an
engine that has never been measured past ten months should not make claims
about two years. Tests assert the curve is monotone in both days and effect
size, that `daysForChance` returns a length that genuinely delivers the target,
that it returns null for the weak curve rather than inventing one, and that the
note at 60 days does not contain the word "reliably".

## Where correlation does not merely stop — it gets worse

The finding-to-trial button exists because a correlation is a hypothesis. It is
worth stating precisely how much of a hypothesis, because the intuitive answer
is wrong in a way that matters.

**A trial is not faster than watching.** Measured head-to-head on one generating
process — symptom = 1.3 + δ·(late caffeine) + noise(sd 0.8), the only difference
being whether the caffeine is decided by the person or by a coin — watching wins
per day when nothing is confounding it:

| effect | watching, 90 days | watching, 120 days | trial, 32 days | trial, 48 days |
|---|---|---|---|---|
| δ = 0.6 | 0.61 | 0.85 | 0.34 | 0.63 |
| δ = 1.0 | 1.00 | 1.00 | 0.69 | 0.93 |

So the app does not tell anyone a trial will get them an answer sooner. It
would sound plausible and it is false.

**What a trial actually buys is the thing extra days cannot.** Same engine,
same lengths, but now late caffeine causes *nothing*: stress drives the
migraines, and stress also makes a late coffee more likely. How often does each
method blame the caffeine?

| method | rate of blaming the innocent habit |
|---|---|
| watching, 90 days | 0.36 |
| watching, 120 days | 0.64 |
| watching, 180 days | 0.93 |
| watching, 240 days | **0.99** |
| trial, 32 days | 0.02 |
| trial, 40 days | 0.02 |
| trial, 48 days | 0.04 |

More data does not dilute a confound; it sharpens it. The correlation engine
converges, with increasing confidence, on the wrong answer — 99 times in 100 by
240 days — while a five-week randomised trial refuses to blame it at all.

This is why "keep logging" and "test it properly" are different advice for
different problems, and the insights page now says so in as many words. Longer
logs buy power against a real effect that is currently too small to see. They
buy nothing whatsoever against a confounded one.

## The floor that excluded the people this app is for

`hasUsableVariance` guards against a "correlation" driven by three outlier days
on an otherwise flat series. That guard is necessary. The way it was written
was not: it required 15% of observations to sit away from the modal value, and
it was applied to outcomes as well as drivers.

Episodic migraine on 12% of days — three or four attacks a month, the textbook
presentation — sits under that floor. So the symptom was dropped as an outcome
entirely. On a 300-day synthetic log where dairy unambiguously triggered it,
the number of relationships tested fell from 36 to 16 and not one of them
concerned the migraine. The user's main complaint was never analysed, and the
report's own factor table then said "nothing found".

**A percentage confuses "rare" with "uninformative".** Twelve flare days is
twelve flare days whether they sit in 100 days of log or 400. The second person
has a rarer symptom, not a less analysable one.

**Sparsity was never the validity problem it was treated as.** Measured over
1500 pure-noise datasets per cell at n=200, the permutation null holds flat all
the way down:

| nonzero days | events | P(p≤.05) | P(p≤.10) | P(p≤.50) |
|---|---|---|---|---|
| 30% | 60 | 0.043 | 0.101 | 0.508 |
| 15% | 30 | 0.041 | 0.101 | 0.526 |
| 12% | 24 | 0.051 | 0.109 | 0.511 |
| 6%  | 12 | 0.045 | 0.105 | 0.508 |
| 2.5% | 6 | 0.045 | 0.098 | 0.507 |

The mathematics does not degrade. What degrades is robustness: a finding
resting on six days changes if one of them was mis-logged. So the floor is now
an absolute count — `MIN_INFORMATIVE = 12` observations away from the modal
value — and it is documented as a robustness floor rather than a statistical
one, because that is what the measurements say it is.

**The relaxation costs nothing in false positives.** Full engine, 250 pure-noise
datasets per cell, two symptoms and several binary factors in play:

| log length | flare rate | datasets carrying any finding |
|---|---|---|
| 200 days | 30% | 0.000 |
| 200 days | 15% | 0.000 |
| 200 days | 10% | 0.004 |
| 200 days | 6%  | 0.000 |
| 300 days | 6%  | 0.000 |
| 365 days | 5%  | 0.000 |
| 120 days | 15% | 0.000 |
| 120 days | 11% | 0.004 |

Against an FDR target of 0.10. The old floor was buying nothing and costing the
app its central purpose for anyone with an episodic condition.

## The same user, failed a second way

`MIN_REPORTABLE_R = 0.20` exists so the app does not bother anyone with a
relationship too weak to act on. Sound idea, wrong implementation: Spearman is
attenuated by ties, so `r` is not comparable across variables of different
shapes, and where a common exposure meets a rare outcome the *ceiling* falls
below the floor.

On 300 days with the habit on 60% of them and the symptom on 5%, a relationship
in which **every single flare** follows the habit scores r = 0.187. A fixed
floor of 0.20 discarded it as too weak to mention.

| exposure | flare rate | r for a perfect relationship | old floor |
|---|---|---|---|
| 50% | 20% | 0.500 | reported |
| 50% | 12% | 0.369 | reported |
| 50% | 5%  | 0.229 | reported, barely |
| 50% | 4%  | 0.204 | reported, barely |
| 60% | 5%  | **0.187** | **discarded** |

That is the same episodic user the informative-count floor was excluding,
failed a second and independent way — and the more common the habit and the
rarer the flare, the worse it gets, which is precisely the shape of a real
trigger for a rare attack.

The floor is now `MIN_REPORTABLE_R × attainableR(xs, ys)`, where `attainableR`
is the correlation of both series sorted — the largest |Spearman| those two
marginal distributions permit. It asks the question the floor was always meant
to ask: is this relationship strong *relative to how strong it could be*? On
continuous data the maximum is 1 and nothing changes at all, which a test
asserts by checking that a genuine r ≈ 0.1 link is still discarded.

**It costs nothing in false positives.** 150 pure-noise datasets per cell,
full engine: 0.000 / 0.007 / 0.000 / 0.000 of datasets carried any finding, at
200 days with 30%, 10% and 6% flare rates and 300 days at 8% — indistinguishable
from before the change. The FDR correction was always doing that work; the floor
was only ever a relevance filter, and it had been quietly acting as a second,
badly calibrated significance test.

**It costs about 20% in time.** The old floor let the engine skip the
permutation test for most hypotheses; a lower floor means more of them are
actually tested. Measured: 84 → 100 ms at 200 days, 159 → 197 ms at 365 days.
This runs inside the memo guard in `recompute()`, so it happens when the log
changes rather than on every render.

## Describing a thing that mostly does not happen

Fixing the reporting floor for attenuated correlations left the same distortion
in two places the user actually reads.

**The badge.** `effectSize` thresholded raw `|r|`, so a habit preceding *every
one* of someone's migraines — r = 0.21 against an attainable ceiling of 0.19 —
was labelled SMALL EFFECT. It now takes the ceiling, so the label answers the
same question the floor does: strong relative to how strong it could be. On
continuous data the ceiling is 1 and every threshold is exactly where it was.

**The sentence.** `practicalEffect` reports a difference of means, which is the
right description of a symptom you have every day and a poor one for a symptom
you have four times a month. The card read:

> On your higher-red wine days, migraine runs 0.31 points higher the same day.

Arithmetically true, and nearly useless to someone asking whether wine is doing
it. Where a symptom is absent on 65% or more of logged days, the same fact is
now put in the shape of the question:

> On your higher-red wine days, migraine turned up on 10% of them against 0%
> of the rest, the same day. This one is costing you.

A test asserts the points wording survives for a symptom present nearly every
day, where "turned up on 96% of them against 91% of the rest" would be the
worse sentence.

Together with the two floors above, this is the same user rescued at four
separate points. A yes/no factor was never tested; a 12%-of-days symptom was
dropped as an outcome; a perfect trigger fell under a floor it could not reach;
and had it survived all three, it would have been announced as a small effect
in a sentence about a third of a point.

## When a trial is the wrong tool, and saying so

The "Test this properly" button is offered on any finding that names something
you can deliberately change. That offer was unconditional, and for an episodic
symptom it was an offer of weeks of daily effort for a foregone conclusion.

A trial's power is governed by how many days carrying the symptom fall inside
it. Measured — 250 simulated trials per cell through the real
`createTrial`/`armForDate`/`analyze` path, at 90% adherence, with a lever that
works **perfectly** (avoiding the trigger removes the symptom entirely, so these
are upper bounds):

| symptom on … of days | 6 pairs (24d) | 8 (32d) | 12 (48d) | 16 (64d) | 20 (80d) |
|---|---|---|---|---|---|
| 60% | 0.21 | 0.74 | 0.96 | 1.00 | 1.00 |
| 35% | 0.04 | 0.21 | 0.63 | 0.86 | 0.94 |
| 20% | 0.00 | 0.03 | 0.17 | 0.38 | 0.60 |
| 12% | 0.00 | 0.00 | 0.01 | 0.12 | 0.28 |
| 8%  | 0.00 | 0.00 | — | 0.01 | 0.05 |
| 5%  | 0.00 | 0.00 | 0.00 | 0.00 | **0.00** |

At a 5% rate, not one of 250 perfect trials produced a verdict at any length the
app can run. The trial setup screen now says that, in those terms, before
anyone starts.

**The consolation is real, and it is the exact mirror of the correlation
engine's limits.** A rare symptom is precisely the case where simply logging
does work: the engine found a red-wine trigger for a 5%-of-days migraine over
330 days of ordinary observation. Trials are for frequent symptoms; patience is
for rare ones. Neither half of the app is the answer on its own, and each one
now points at the other where it should.

**Two things this measurement caught on the way.**

The slider stopped at 10 pairs — 40 days — which made every question about an
infrequent symptom unanswerable by construction. It now runs to 20.

It does not run further, and the reason is not taste. `analyze` enumerates the
exact reference set, all 2^pairs sign flips, and that enumeration is what makes
the p-value exact rather than sampled. The cost doubles per pair: 91 ms at 20,
376 ms at 22, and roughly a minute and a half at 30 — a frozen app. Twenty pairs
is where an exact test stops being affordable, so it is where the slider stops,
and a test asserts the cap does not drift upward without that trade being
revisited.

The default of 7 pairs is also worth knowing about: it sits under 50% power even
for a symptom present on 60% of days. Rather than change one global default for
outcomes of every shape, the outlook names a length that would actually do it.

## The safety rule that could not see an episodic symptom

The two symptom rules in the safety layer both keyed on **mean severity** —
"severe or worse on 10 of the last 14 days", and "averaging a full point higher
than the month before". That is the same wrong instrument that ran through the
rest of the engine, in the one place where getting it wrong matters most.

Someone whose migraine goes from two attacks a month to ten has quintupled the
thing that actually matters to them. Their 28-day mean severity moves by about
0.6 of a point, under the 1.0 threshold, and they never come close to ten severe
days in fourteen. Measured on exactly that log: **no flag at all**. Escalating
attack frequency is a textbook reason to be seen, and the app said nothing.

`symptom-more-often` counts events instead. Conditional on the total, an
unchanged rate means the number of recent attacks among all of them is
Binomial(total, recentDays / allDays) — an exact test, no simulation and no
approximation, which is the right standard for the one part of the app that
tells someone to go and see a person about it.

**Choosing alpha, where intuition was wrong by an order of magnitude.** A
p ≤ 0.01 threshold looks conservative. But this rule runs *every day*, so what
a person experiences is not the chance it fires today — it is the chance it ever
fires. Measured on symptoms that never change, over 120 days of daily checks:

| alpha | fires on a given day | falsely alarms someone at least once |
|---|---|---|
| 0.01 | 0.006 | **0.076** |
| 0.005 | 0.003 | 0.048 |
| 0.002 | 0.001 | 0.016 |

Repeated looks at accumulating data is a multiple-comparisons problem like any
other. Against that, sensitivity to a real change, measured as "caught within 28
days of it starting, given six months of prior history":

| change | α=0.01 | α=0.005 | α=0.002 |
|---|---|---|---|
| 2 → 12 per month | 0.94 | 0.92 | 0.86 |
| 4 → 16 | 0.94 | 0.92 | 0.84 |
| 3 → 12 | 0.85 | 0.78 | 0.66 |
| 2 → 8  | 0.64 | 0.51 | 0.40 |
| 4 → 8  | 0.17 | 0.13 | 0.06 |

Shipped at **0.005**: a quadrupling is caught around 8 times in 10, and fewer
than 5 in 100 stable people are told something is happening that is not. A mere
doubling is mostly not caught, and that is the honest position — one 28-day
window of an episodic symptom does not contain enough events to tell a doubling
from luck.

**The other five rules were never measured this way either.** They hold up: over
the same 120 days of daily checks on an ordinary stable person, only `low-mood`
ever fires, on 0.7% of people, and no other rule cries wolf at all.
