# @vitalarc/nof1

The n-of-1 evidence engine: work out what is driving one person's symptoms, test
it properly, and emit a result somebody else can check.

No DOM, no storage, no network, no framework, no build step. Pass in daily
entries, get back findings, trials and verifiable certificates. Runs in a
browser, in Node, in a worker, on a server.

```js
import * as nof1 from '@vitalarc/nof1';
```

## Why this exists

Randomised controlled trials tell you what a treatment does **on average**.
Almost nothing tells an individual whether it does anything for **them**.

n-of-1 trials are the right instrument for that question and are largely absent
from practice for one reason: the result is unfalsifiable. Run eight
self-experiments, report the one that worked, and you have a testimonial. This
engine closes that hole — the design is committed before the data exists, and
the finished result travels as a certificate a stranger can check without ever
seeing the underlying diary.

## The three things it does

### 1. Find what moves with a symptom

```js
const res = nof1.discover(entries, { symptoms, factors });
for (const f of res.findings) console.log(nof1.phrase(f, symptoms, factors));
// "On your higher-alcohol days, headache runs 1.3 points higher the next day."
```

Lagged rank correlations with time trends and weekly rhythms removed,
permutation p-values, and one false-discovery-rate correction across everything
tested. `docs/INSIGHTS.md` in this repository records what was measured to get
each guard right, including the approaches that were tried and reverted.

`sensitivityNote(days)` tells you what an empty result is worth at that much
history, from `POWER_CURVE` — measured recall of this engine, not a rule of
thumb.

### 2. Test one thing on purpose

```js
const { trial } = nof1.createTrial({ leverId, outcome, pairs: 8, startDate });
trial.prereg = await nof1.registerTrial(trial);   // commit before day one
// ...log days...
const analysis = nof1.analyze(trial, entries);     // exact randomisation test
```

Block-randomised, with the outcome and the coin tosses fixed in advance and an
exact test over all 2^K assignments. `trialOutlook(rate, pairs, label)` says
what a given design can realistically detect given how often the symptom
actually occurs — and says plainly when a trial cannot work at all, which for an
episodic symptom is often.

### 3. Emit something a stranger can verify

```js
const cert = await nof1.issueCertificate(trial, analysis, { verdictKind, leverLabel });
const { ok, problems } = await nof1.checkCertificate(cert, registrationCode);
```

A certificate is about a kilobyte. It reproduces its own p-value from the K
within-pair differences it carries, and contains no dates, no diary and no
symptom log — because an exact randomisation test depends on the data only
through those K numbers.

`verify.html` at the repository root checks one: a single file, no
dependencies, works from an email attachment with the network off.

Many certificates aggregate:

```js
const { cohorts } = nof1.cohorts(certs, { registrations });
// "100 people have tested No dairy against Migraine. 22% found an effect
//  (15%-31%), more than chance would give."
```

The denominator is **registrations, not submissions**, so trials that registered
and never reported back are visible rather than silently excluded. A cohort
whose responder rate matches the false-positive rate is reported as luck, not as
a finding.

## What it will not do

It does not diagnose, treat, cure or reassure, and the copy that ships with the
app is mechanically prevented from doing so (`tests/copy-guard.mjs`). That is
not a compliance chore — it is the reason the numbers are worth anything.

A certificate is checkable, not self-authenticating. Nothing here is a
signature, and it proves internal consistency rather than identity. The
signature layer belongs above this one, when there is a clinician or a sponsor
on the other end who requires it.

## Stability

`SURFACE` is the complete public API and is locked by a test: if the exports and
that list disagree, the build fails and says which way. Three tests back the
claims on this page rather than leaving them as prose —

- the surface matches the contract,
- the engine source contains no DOM, storage or network access,
- and a complete loop (log → findings → registered trial → certificate →
  verification → cohort) runs through the public API alone.

`ENGINE_VERSION` versions this surface, not the app that ships it.
