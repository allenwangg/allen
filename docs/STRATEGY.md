# What this is worth, and what would have to be true

An honest assessment, written against the code that exists rather than the code
someone might write.

## The short version

A symptom tracker is not a trillion-dollar company. There are roughly seven of
those and every one is a platform or a piece of infrastructure that other people
are obliged to build on. Consumer health tracking is a crowded category with bad
retention and worse pricing power, and nothing in this repository changes that.

But the app is not the asset. Three things here are genuinely rare:

**1. A calibrated engine.** `docs/INSIGHTS.md` is 960 lines recording what was
measured, what the numbers were, and what got reverted when the numbers came
back wrong — per-symptom FDR families, circular shifts for the weekday test, a
28-day aliasing hypothesis, "a trial settles it faster than logging". Most
health software has a plausible method. This has a measured one, including the
parts that failed. That record is what a regulator, a journal reviewer or an
acquirer's diligence team asks for and almost nobody can produce.

**2. Verifiable pre-registration** (`app/js/prereg.js`). The design — question,
length, and the exact coin tosses — is hashed before the first day is logged.

**3. Portable certificates** (`app/js/certificate.js`). A finished trial emits
about a kilobyte that reproduces its own p-value from K published per-pair
differences, carries no diary, and is checkable by a stranger with their own
code.

Those last two were built this week and together they solve a specific,
long-standing problem. Read on for why that problem is worth money.

## The problem the certificate solves

Randomised controlled trials tell you what a treatment does **on average**.
Almost nothing tells an individual whether it does anything for **them**.
Guidelines are built on population means; the person in the chair is not the
mean.

n-of-1 trials are the correct instrument for that question, they are an accepted
design for rare disease, and they are largely absent from practice for one
reason: **the result is unfalsifiable**. Run eight self-experiments, report the
one that worked, and you have a testimonial. There has never been a cheap way to
show the question was chosen before the data.

That is now a hash and a twelve-character code handed to someone at the start.

The economically interesting property is the privacy one. The exact
randomisation test depends on the data only through K within-pair differences,
so a verifiable result can travel while the health record stays on the device.
Every other attempt to build evidence networks in health has foundered on data
sharing — consent, HIPAA/GDPR, breach liability, and the plain fact that people
do not want to hand over their symptom diary. **This design never asks them
to.**

## Four paths, ordered by how defensible they are

### 1. The registry — the only thing here that compounds

Certificates aggregate. Ten thousand pre-registered trials of "avoid dairy →
migraine" is a dataset that does not exist anywhere in the world, cannot be
assembled from claims data, and gets more valuable with every contribution.

This is the network effect, and it is unusually clean: the Nth user benefits
because N−1 others ran checkable trials, and contributing costs them no privacy
because a certificate is not a health record. The reason nobody has built it is
that unverifiable self-reports are worthless in aggregate — you would be
building a database of testimonials. Verification is what turns the pile into
evidence.

**What would have to be true:** enough people finish trials to reach density in
at least one lever/outcome pair. That is a real risk — trials are 4 to 11 weeks
of daily logging, and `TRIAL_POWER_GRID` in `experiments.js` says an episodic
symptom cannot be settled at all. Density will come from frequent symptoms
first.

### 2. Infrastructure — license the engine and the format

Every digital therapeutics company, every wearable, every health app eventually
has to answer "did this work for this person", and essentially none can answer
it correctly. The statistics are subtle enough that most get it wrong: the
guards in `INSIGHTS.md` exist because this codebase got several of them wrong
first and measured its way out.

Selling the engine as an embeddable core plus a certificate format is modest
revenue and large strategic value, because the format is the thing that wants to
become a standard. Formats win by being open and correct, not by being licensed
expensively.

### 3. Decentralised trials and pharma — where the money actually is

Sponsors run decentralised trials now, and their hardest problem is data
integrity: proving an endpoint was pre-specified and not edited. That is
precisely what `prereg.js` and `certificate.js` do, and pharma pays real money
for it. n-of-1 designs are already used in rare disease where a parallel-group
trial is impossible.

This is the highest-revenue path and the one furthest from the current code: it
needs audit trails, identity, and a regulatory posture the app deliberately does
not have.

### 4. Clinicians and payers

The printed report is already the wedge — one page, complaint first,
correlations last. A clinician who hands a patient a registration code at the
start of an appointment and reads the certificate at the next one has done a
controlled experiment on that patient, in normal practice, at no cost.

## What would have to be true for the largest outcome

To be worth a trillion you would have to become the system of record for
individual treatment-effect evidence, globally, and be the substrate other
health software is obliged to build on. Concretely: the certificate format
adopted as a standard, regulatory recognition that a pre-registered n-of-1
result is admissible evidence, pharma running trials on the rails, and a
registry dense enough that clinicians consult it by default.

That is a twenty-year infrastructure play with poor odds, and it is not what the
expected value of this repository is today. It is, however, a *real* path, which
is more than most health apps have. The honest range: a well-executed consumer
product here is a small business; the registry and format, if they take, are the
part with no ceiling anyone can see.

## The thing that would destroy all of it

Overclaiming.

The moat is that the numbers are trustworthy. `tests/copy-guard.mjs` prevents
the app from ever saying it diagnoses, treats, cures or reassures — and that
guard is not a compliance chore, it is the asset. Health companies that died
loudly (Theranos, uBiome, Outcome Health) did not die of weak growth; they died
because a claim turned out to be unsupported.

The moment this software says "cure", the scientific and regulatory position
that makes the registry worth anything evaporates, and what remains is another
symptom tracker. Every growth tactic that requires loosening a claim is
therefore negative expected value, however good the conversion numbers look.

Guard the claims and the compounding asset survives. That is the whole strategy.

## What to build next, in order

1. **Certificate ingestion and cohort statistics** — the registry primitive.
   Aggregate verified certificates into "n people have tested this lever against
   this outcome; k found an effect", with the same multiplicity discipline the
   single-user engine already has. Local first; a server is an implementation
   detail that can come later.
2. **Extract the engine** into a versioned, embeddable package with a stable
   documented surface, so it can be dropped into somebody else's product.
3. **A standalone verifier** — a single HTML file, no dependencies, that anyone
   can open to check a certificate. It costs almost nothing and it is how a
   format becomes a standard.
4. **Identity, only when a counterparty needs it.** Certificates are checkable,
   not self-authenticating, and that limit is stated honestly in the module. The
   signature layer belongs above this one, when there is a clinician or a
   sponsor on the other end who requires it.
