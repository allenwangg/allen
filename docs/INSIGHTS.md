# The insight engine

Finding real signal in one person's noisy daily log is the hard part of this
product, and getting it wrong is worse than not shipping it. An app that tells
someone "your fiber intake is raising your heart rate" on the strength of noise
has actively harmed them.

This document records what the engine does and — more usefully — the two bugs
found while validating it, because both are the kind that ship silently.

## The pipeline

For every (driver, outcome, lag) combination, where lag ∈ {0, 1, 2} days:

1. **Pair the days.** Driver on day *d*, outcome on day *d+lag*. Missing days
   break the chain rather than being interpolated — inventing data in order to
   find correlations in it is the cardinal sin of this category.
2. **Detrend both series** against elapsed time — but only where a trend
   actually exists (see below).
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

## Guard 5 — spurious time trends

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

Thirty independent 120-day datasets per scenario:

| Scenario | Findings/dataset | Planted effect recovered |
|---|---|---|
| Pure noise, no real effect | 0.00 | n/a — **0 of 30 datasets produced anything** |
| Habits all trending, no real effect | 0.00 | n/a — **0 of 30 datasets produced anything** |
| Planted effect, no trend | 1.00 | **100%** |
| Planted effect + confounding trend | 1.00 | **100%** |
| Planted effect, weekend-clustered driver | 1.00 | **100%** |
| Planted effect, trend *and* weekend-clustered | 1.00 | **100%** |

The two rows that matter most are the first two: on data containing no real
day-to-day relationship, the engine reports nothing at all — including when
every habit is improving together, which is the case that fools naive analysis.

## What it still cannot do

- **Correlation is not causation.** A third factor may drive both. The UI says
  this every time findings are shown, not once in the footer.
- **Self-report is biased.** People misremember portions and round their sleep.
- **Detrending removes real slow effects too.** Where a genuine trend exists,
  a habit that helps only over months will not appear. That is the accepted cost
  of not reporting eleven false things in order to catch one slow true one.
- **Three lags only.** Effects with a longer delay are invisible.

Run `npm test` to reproduce every number in this document.
