/**
 * certificate.js — a finished trial, in a form somebody else can check.
 *
 * WHY. A result inside an app is a claim about an app. For an n-of-1 result to
 * be worth anything to a clinician, a registry, or a stranger, three things
 * have to travel with it and be independently checkable:
 *
 *   1. The question was fixed before the data existed  (the prereg digest).
 *   2. The arithmetic is right                          (recomputable here).
 *   3. Neither has been edited since                    (the certificate digest).
 *
 * THE TRICK THAT MAKES THIS PRIVATE. An exact randomisation test on a
 * block-randomised trial depends on the data only through the K within-pair
 * differences. Publish those K numbers — eight to twenty of them — and anyone
 * can rederive the p-value exactly, with their own code, having never seen a
 * single day of the diary. The whole verifiable claim is about a kilobyte, and
 * it contains no dates, no symptom log, and nothing about the rest of the
 * person's life.
 *
 * That is the unit a registry of individual treatment effects is made of. Not
 * an export of somebody's health record.
 *
 * WHAT A CERTIFICATE IS NOT. It is not a signature. Nothing here proves WHO
 * produced it, and a person determined to fabricate one can: invent K numbers,
 * compute the digests, and hand it over. What it does prove is internal
 * consistency — that this result follows from this design, and that the design
 * matches a code committed earlier. The identity half is somebody else's
 * problem: a clinician who watched the trial, a registry that timestamps the
 * commitment on receipt, a signature layer above this one. Certificates are
 * checkable, not self-authenticating, and saying otherwise would be the exact
 * kind of overclaim the rest of this codebase exists to avoid.
 */

import { canonicalDesign, PREREG_VERSION } from './prereg.js';

export const CERT_VERSION = 1;

/**
 * The exact randomisation p-value, from the pair differences alone.
 *
 * Deliberately reimplemented here rather than imported from experiments.js, so
 * a verifier needs only this file and prereg.js — not the app. A test asserts
 * the two implementations agree on random inputs; if they ever diverge, one of
 * them is wrong and the suite says so rather than the certificate quietly
 * disagreeing with the app that issued it.
 *
 * Two-sided, over all 2^K sign flips of the observed differences.
 */
export function exactP(pairDiffs) {
  const k = pairDiffs.length;
  if (!k) return null;
  const observed = pairDiffs.reduce((a, b) => a + b, 0) / k;
  const total = 2 ** k;
  let asExtreme = 0;
  for (let mask = 0; mask < total; mask++) {
    let sum = 0;
    for (let i = 0; i < k; i++) sum += (mask & (1 << i)) ? -pairDiffs[i] : pairDiffs[i];
    if (Math.abs(sum / k) >= Math.abs(observed) - 1e-12) asExtreme++;
  }
  return asExtreme / total;
}

/** Stable text form of a certificate body. Hashed, so field order is fixed. */
export function canonicalCertificate(c) {
  return [
    `cert-v${CERT_VERSION}`,
    `design=${c.design}`,
    `preregDigest=${c.preregDigest ?? ''}`,
    `preregVersion=${c.preregVersion ?? ''}`,
    `outcomeLabel=${c.outcomeLabel ?? ''}`,
    `leverLabel=${c.leverLabel ?? ''}`,
    `usablePairs=${c.usablePairs}`,
    `pairDiffs=${c.pairDiffs.join(',')}`,
    `observedDiff=${c.observedDiff}`,
    `p=${c.p}`,
    `verdict=${c.verdict ?? ''}`,
    `adherence=${c.adherence ?? ''}`,
  ].join('\n');
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Issue a certificate for a completed trial.
 *
 * `analysis` is the object analyze() returns; `verdictKind` the plain-language
 * conclusion. Returns null for a trial that was never analysed, because a
 * certificate for a trial with no result would be a document asserting nothing.
 */
export async function issue(trial, analysis, { verdictKind = null, leverLabel = null, adherence = null } = {}) {
  if (!trial || !analysis || analysis.status !== 'analysed') return null;
  const body = {
    version: CERT_VERSION,
    trialId: trial.id,
    design: canonicalDesign(trial),
    preregDigest: trial.prereg?.digest ?? null,
    preregVersion: trial.prereg?.version ?? null,
    outcomeLabel: trial.outcomeLabel || trial.outcome,
    leverLabel: leverLabel || trial.leverId,
    usablePairs: analysis.usablePairs,
    pairDiffs: analysis.pairDiffs,
    observedDiff: analysis.observedDiff,
    meanOn: analysis.meanOn,
    meanOff: analysis.meanOff,
    p: analysis.p,
    floorP: analysis.floorP,
    verdict: verdictKind,
    adherence,
    issuedAt: Date.now(),
  };
  body.digest = await sha256Hex(canonicalCertificate(body));
  body.short = body.digest.slice(0, 12);
  return body;
}

/**
 * Check a certificate without trusting whoever handed it to you.
 *
 * `expectedPreregShort` is the code the holder was given when the trial
 * started. Without it the arithmetic is still checkable, but the claim that the
 * question came first rests on the certificate's own say-so — which is the
 * thing it cannot establish about itself.
 */
export async function check(cert, expectedPreregShort = null) {
  const problems = [];
  const notes = [];
  if (!cert || typeof cert !== 'object') return { ok: false, problems: ['Not a certificate.'], notes };
  if (cert.version !== CERT_VERSION) {
    return { ok: false, problems: [`Certificate format v${cert.version}; this checker understands v${CERT_VERSION}.`], notes };
  }
  if (!Array.isArray(cert.pairDiffs) || !cert.pairDiffs.length) {
    return { ok: false, problems: ['No pair differences, so nothing can be recomputed.'], notes };
  }

  // 1. The digest covers the body.
  const recomputed = await sha256Hex(canonicalCertificate(cert));
  if (recomputed !== cert.digest) problems.push('The certificate has been edited since it was issued.');

  // 2. The effect is the mean of the differences it publishes.
  const mean = cert.pairDiffs.reduce((a, b) => a + b, 0) / cert.pairDiffs.length;
  if (Math.abs(mean - cert.observedDiff) > 0.011) {
    problems.push(`The stated effect (${cert.observedDiff}) is not the mean of the published differences (${mean.toFixed(2)}).`);
  }

  // 3. The p-value follows from those differences and nothing else.
  const p = exactP(cert.pairDiffs);
  if (Math.abs(p - cert.p) > 0.0002) {
    problems.push(`The stated p-value (${cert.p}) is not what these differences give (${p.toFixed(4)}).`);
  }

  // 4. The design matches the code the holder was given at the start.
  if (expectedPreregShort) {
    if (!cert.preregDigest) problems.push('This trial carries no pre-registration to compare your code against.');
    else if (!cert.preregDigest.startsWith(expectedPreregShort)) {
      problems.push(`The design does not match the registration code you were given (${expectedPreregShort}). This is not the trial that was registered.`);
    } else notes.push(`Matches registration code ${expectedPreregShort}, so the question and the coin tosses are the ones fixed before any day was logged.`);
  } else if (cert.preregDigest) {
    notes.push('Carries a pre-registration digest, but you have not supplied the code you were given at the start, so that half is unchecked.');
  } else {
    notes.push('Carries no pre-registration. The arithmetic below is still checkable; that the question came first is not.');
  }

  if (cert.preregVersion && cert.preregVersion !== PREREG_VERSION) {
    notes.push(`Registered under commitment format v${cert.preregVersion}.`);
  }
  return { ok: problems.length === 0, problems, notes, recomputedP: p };
}

/** Human-readable form, for a report, an email, or a printed page. */
export function render(cert) {
  if (!cert) return '';
  return [
    `n-of-1 TRIAL CERTIFICATE  (format v${cert.version})`,
    ``,
    `Change tested   ${cert.leverLabel}`,
    `Measured        ${cert.outcomeLabel}`,
    `Block pairs     ${cert.usablePairs}`,
    `Effect          ${cert.observedDiff} (on ${cert.meanOn} vs off ${cert.meanOff})`,
    `p (exact)       ${cert.p}   [best possible at this length: ${cert.floorP}]`,
    `Conclusion      ${cert.verdict ?? 'not stated'}`,
    cert.adherence != null ? `Adherence       ${cert.adherence}%` : null,
    ``,
    `Per-pair differences (these alone reproduce the p-value):`,
    `  ${cert.pairDiffs.join(', ')}`,
    ``,
    `Registration    ${cert.preregDigest ? cert.preregDigest.slice(0, 12) : 'none'}`,
    `Certificate     ${cert.short}`,
    ``,
    `Anyone can check this: take the ${cert.usablePairs} differences above, flip the`,
    `sign of every subset of them, and count how often the mean comes out at`,
    `least as far from zero as ${cert.observedDiff}. That fraction is the p-value.`,
    `No access to the underlying diary is needed, or given.`,
  ].filter((x) => x !== null).join('\n');
}
