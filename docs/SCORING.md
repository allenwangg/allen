# How the habit score is built

The point of publishing this is that you should be able to argue with your own
score. A number you cannot interrogate is a number you stop trusting.

## Shape of the model

```
Habit score       =  weighted mean of six pillar scores
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
| Metabolic | 8% | resting HR 55%, HRV 45%, waist 30% (needs height) |

Weights reflect roughly how much each domain is discussed in the healthspan
literature relative to the others, and are deliberately round numbers rather
than false precision. They are one defensible allocation, not the only one.

## Two details that matter

**Unlogged is not zero.** A pillar with nothing logged is dropped from the
weighted mean rather than scored zero. Someone who never enters HRV is not
punished for it; their score is computed from what they did log. This is why
partial logging is safe.

**Waist is scored as a ratio, not a number.** A logged waist is converted to
waist-to-height ratio, which predicts cardiometabolic risk better than BMI and
needs no sex-specific table — the familiar "keep your waist under half your
height" threshold sits at 0.5. Without a height in Settings there is no ratio,
so waist is stored but not scored, and the app says so rather than guessing.

**Protein and training scale to the person.** Protein is scored per kilogram of
bodyweight, not in absolute grams, so 100 g is a good day for a 60 kg person and
a thin one for a 110 kg person. Training load is minutes weighted by intensity,
and saturates — overtraining is real.

## Sleep regularity

Scored separately from duration, on the standard deviation of bedtime across the
window. Irregular timing associates with worse outcomes even when total duration
is adequate, so folding it into duration would hide it.

## What is deliberately not here

There used to be a "healthspan age" — your habits expressed as a number of
years older or younger than you are. It is gone. This codebase's own comment
explained why it existed: it was the most shareable, most retention-driving
number a habit tracker could produce. That is a reason to build something for a
business, not for a person, and a confident-looking composite at the top of a
page is a good way to have everything below it ignored.

The score itself survives because "how have my habits been" is a fair question.
It is just not the first one, and it says nothing about whether you are well.

## Verification

`npm test` runs 141 checks over this model, including:

- score bounds held across 4,000 fuzzed out-of-range inputs
- monotonicity where it should hold (alcohol strictly hurts) and non-monotonicity
  where it should not (sleep peaks and declines)
- pillar weights summing to 1
- protein scoring correctly by bodyweight
- bedtime wrapping properly past midnight
