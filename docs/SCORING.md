# How the Healthspan Score is built

The point of publishing this is that you should be able to argue with your own
score. A number you cannot interrogate is a number you stop trusting.

## Shape of the model

```
Healthspan Score  =  weighted mean of six pillar scores
Pillar score      =  weighted mean of component scores
Component score   =  a piecewise dose-response curve applied to one logged value
```

Every value in the app is traceable back through that chain to a specific curve.

## Why curves and not coefficients

Most habit trackers score linearly: more of a good thing is always better. Real
dose-response relationships are usually not linear and frequently not monotonic.

Sleep is the clearest case. Both short and long sleep associate with worse
outcomes, so the curve peaks at 7.5–8.5 hours and declines on both sides:

| Hours | 4 | 5.5 | 6.5 | 7 | 7.5–8.5 | 9 | 10 | 12 |
|---|---|---|---|---|---|---|---|---|
| Score | 20 | 45 | 75 | 92 | 100 | 88 | 62 | 30 |

A linear model cannot express that, and would tell a nine-hour sleeper to sleep
more. The simulator inherits this: someone already sleeping eight hours is
correctly told that another ninety minutes would *cost* them points.

## Pillar weights

| Pillar | Weight | Components |
|---|---|---|
| Sleep | 24% | duration 50%, quality 32%, timing 18% |
| Movement | 22% | steps 42%, training load 42%, strength 16% |
| Nutrition | 20% | protein 30%, produce 26%, ultra-processed 24%, fiber 12%, hydration 8% |
| Recovery | 16% | stress 34%, mood 22%, energy 18%, daylight 16%, social 10% |
| Substances | 10% | alcohol 52%, nicotine 30%, late caffeine 18% |
| Metabolic | 8% | resting HR 55%, HRV 45% |

Weights reflect roughly how much each domain is discussed in the healthspan
literature relative to the others, and are deliberately round numbers rather
than false precision. They are one defensible allocation, not the only one.

## Two details that matter

**Unlogged is not zero.** A pillar with nothing logged is dropped from the
weighted mean rather than scored zero. Someone who never enters HRV is not
punished for it; their score is computed from what they did log. This is why
partial logging is safe.

**Protein and training scale to the person.** Protein is scored per kilogram of
bodyweight, not in absolute grams, so 100 g is a good day for a 60 kg person and
a thin one for a 110 kg person. Training load is minutes weighted by intensity,
and saturates — overtraining is real.

## Sleep regularity

Scored separately from duration, on the standard deviation of bedtime across the
window. Irregular timing associates with worse outcomes even when total duration
is adequate, so folding it into duration would hide it.

## Healthspan Age

The score is mapped to a years-offset through a saturating transform anchored,
at the reference age of 35, so that a score of 50 (population-average habits)
is 0 years, 85 is about −4.5 years, and 20 is about +4 years. It saturates at
±9 years, and scales modestly with age (older users have more absolute room to
move). The transform is symmetric about 50, so the anchors are too — an earlier
version of this document claimed +5.5 years at score 20, which no symmetric
transform can produce alongside −4.5 at 85; the code now matches the anchors
and the anchors are stated honestly. If HRV or resting
heart rate are logged, they nudge the estimate against age-referenced norms.

**This is an illustrative estimate, not a biological-age measurement.** It exists
because expressing a change in years makes its value legible in a way a 0–100
score does not — "this habit is worth eight months" lands where "this habit is
worth 2.4 points" does not. Every place it appears in the app carries a
confidence tag driven by how many days back it and whether biomarkers are
present, and a disclaimer.

It is not a diagnosis and it is not an epigenetic clock. The app says so
wherever the number is shown, not only in the small print.

## Verification

`npm test` runs 82 checks over this model, including:

- score bounds held across 4,000 fuzzed out-of-range inputs
- monotonicity where it should hold (alcohol strictly hurts) and non-monotonicity
  where it should not (sleep peaks and declines)
- pillar weights summing to 1
- Healthspan Age monotone in score, correctly signed, and saturating
- protein scoring correctly by bodyweight
- bedtime wrapping properly past midnight
