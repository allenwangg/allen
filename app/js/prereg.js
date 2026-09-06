/**
 * prereg.js — tamper-evident pre-registration for n-of-1 trials.
 *
 * WHY THIS EXISTS. The single reason n-of-1 evidence is not taken seriously is
 * that nobody can show the outcome was chosen before the data existed. Run
 * eight trials, report the one that worked, and you have a testimonial. The
 * arithmetic in experiments.js is exact, and exactness is worth nothing if the
 * question was picked afterwards.
 *
 * createTrial() already stores the outcome at creation with a comment saying it
 * is never edited. A comment is not a mechanism. Anything with access to the
 * store could rewrite that field and no code would notice.
 *
 * WHAT THIS DOES. It computes a SHA-256 over a canonical serialisation of
 * everything that determines the result: what is being changed, what is being
 * measured, how long for, and — crucially — the exact coin tosses. Change any
 * of it afterwards and the digest no longer matches.
 *
 * WHAT IT HONESTLY DOES NOT DO. A hash held only by the person who could also
 * recompute it proves nothing against that person. Locally it detects
 * corruption and edits made by any code path that does not know to re-hash,
 * which is every code path there is — that is real, and it is not proof.
 *
 * The digest becomes a commitment the moment it leaves your hands: shown to a
 * clinician, emailed, printed on the report, or anchored anywhere with a date.
 * From then on it binds, because the person holding it can check the finished
 * trial against what you told them you were going to do. That is exactly how
 * pre-registration works everywhere else, and it is the whole mechanism —
 * a short string, handed over early.
 *
 * The commitment covers the RANDOMISATION as well as the question. Without
 * that, you could re-roll the coin tosses until the arrangement flattered the
 * data, which is the same p-hacking wearing a different hat.
 */

/** Bump when the committed field set changes; old digests stay verifiable. */
export const PREREG_VERSION = 1;

/**
 * Canonical serialisation of a trial's design.
 *
 * Written out field by field rather than JSON.stringify(trial), for two
 * reasons. Key order in a JS object is insertion-ordered and quietly depends on
 * how the object was built, so two identical designs could hash differently.
 * And a trial gains fields as it runs — status, endedAt, result — none of which
 * are part of what was promised; hashing the whole object would make the
 * commitment break the moment the trial legitimately progressed.
 */
export function canonicalDesign(t) {
  if (!t) return null;
  const num = (v) => (Number.isFinite(v) ? String(v) : 'null');
  return [
    `prereg-v${PREREG_VERSION}`,
    `lever=${t.leverId ?? ''}`,
    `outcome=${t.outcome ?? ''}`,
    `pairs=${num(t.pairs)}`,
    `blockDays=${num(t.blockDays)}`,
    `startDate=${t.startDate ?? ''}`,
    `seed=${num(t.seed)}`,
    // The arrangement itself, not just the seed that produced it. A seed is
    // only as binding as the generator that consumed it.
    `assignment=${Array.isArray(t.assignment) ? t.assignment.join('') : ''}`,
    // The analysis is fixed in advance too, so "we tried a different test"
    // is excluded along with "we measured a different thing".
    'analysis=exact-randomisation-test',
    'alpha=0.05',
  ].join('\n');
}

/** SHA-256 of a string, hex. Uses Web Crypto, present in browsers and Node 18+. */
async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * The full digest of a trial design, and the short form a person can actually
 * read out loud or copy onto a form.
 *
 * Twelve hex characters is 48 bits. That is not collision-resistant in the
 * cryptographic sense and is not meant to be: nobody is mounting a birthday
 * attack on their own migraine diary. It is a human-checkable handle, and the
 * full digest is always carried alongside it for anything that matters.
 */
export async function commit(trial) {
  const canonical = canonicalDesign(trial);
  if (!canonical) return null;
  const digest = await sha256Hex(canonical);
  return {
    version: PREREG_VERSION,
    digest,
    short: digest.slice(0, 12),
    committedAt: trial.createdAt ?? Date.now(),
  };
}

/**
 * Does this trial still match what was committed?
 *
 * Returns a verdict rather than a boolean, because "this trial carries no
 * commitment" and "this trial's design was altered after it was registered"
 * are very different statements and only one of them is an accusation.
 */
export async function verify(trial) {
  if (!trial) return { status: 'no-trial' };
  const prereg = trial.prereg;
  if (!prereg || !prereg.digest) {
    return {
      status: 'unregistered',
      detail: 'This trial was created before pre-registration existed, so there is nothing to check it against. Its result still stands on its own arithmetic; it just cannot show that the question came first.',
    };
  }
  if (prereg.version !== PREREG_VERSION) {
    return {
      status: 'unknown-version',
      detail: `Registered with commitment format v${prereg.version}, and this build understands v${PREREG_VERSION}.`,
    };
  }
  const actual = await sha256Hex(canonicalDesign(trial));
  if (actual === prereg.digest) {
    return {
      status: 'intact',
      digest: actual,
      short: actual.slice(0, 12),
      detail: 'The design matches what was registered before the first day was logged: same change, same measurement, same length, same coin tosses.',
    };
  }
  return {
    status: 'altered',
    expected: prereg.digest,
    actual,
    detail: 'This trial no longer matches what was registered. Something about the design — what was changed, what was measured, how long for, or the randomisation — is different from when it started. Its result cannot be read as a pre-registered one.',
  };
}

/**
 * Fields whose alteration the commitment is meant to catch. Exported so the
 * test suite can walk them rather than hand-listing a subset that drifts out of
 * date the moment the design gains a field.
 */
export const COMMITTED_FIELDS = [
  'leverId', 'outcome', 'pairs', 'blockDays', 'startDate', 'seed', 'assignment',
];
