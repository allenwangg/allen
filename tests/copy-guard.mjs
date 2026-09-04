/**
 * copy-guard.mjs — the app must never claim to diagnose, treat or cure.
 *
 * This is the one rule in the product that is not a matter of taste, and copy
 * is the easiest place to lose it: a single reassuring sentence added in a
 * hurry ("probably nothing") does more harm than any bug in here. So it is
 * enforced mechanically rather than by remembering.
 *
 * Runs over source rather than the rendered page, so it also covers strings a
 * given test run happens not to display.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES = [
  'app/js/ui.js', 'app/js/app.js', 'app/js/safety.js', 'app/js/experiments.js',
  'app/js/sample.js', 'index.html', 'app/index.html',
  // The README describes the app to everyone who ever looks at it, and was
  // outside this guard entirely — which is how a retracted statistical claim
  // survived in it after being chased out of four other files.
  'README.md',
];

export const RULES = [
  // Each of these is written to the SHAPE of the claim, not to one sentence.
  // The original diagnosis rule required the word "condition" to follow the
  // article directly, so "you probably have a thyroid condition" — a named
  // condition, which is the likelier way anyone would ever write it — walked
  // straight past the single most important rule in the product. Ten of
  // eighteen realistic rephrasings did. See the self-test in tests/run.mjs.
  [/\byou (?:probably |likely |may |might |possibly )?(?:have|'ve got|are showing signs of) (?:a |an )?(?:[\w-]+ ){0,3}(?:condition|disease|disorder|syndrome|deficiency|infection|intolerance|allergy)\b/i,
    'asserts a diagnosis'],
  [/\b(?:this|it|that) (?:is|looks like|could be|might be|may be|sounds like|seems like|is likely|is probably|is consistent with|points to|suggests)\b[^.]{0,24}\b(?:migraine|ibs|anxiety|depression|apn(?:o|oe)a|diabetes|an(?:a)?emia|deficiency|fibromyalgia|c(?:o)?eliac|thyroid)\b/i,
    'names a condition as a conclusion'],
  [/\b(?:you should|try|consider|start|worth) (?:taking|stopping|cutting out|supplementing)\b/i,
    'directs treatment'],
  [/\byou should (?:take|stop taking|start taking|increase|reduce|double|halve)\b/i, 'directs treatment'],
  [/\b(?:cures?|cured|curing|will fix|will heal)\b/i, 'claims a cure'],
  [/\bwill (?:resolve|clear up|get rid of|eliminate|sort out)\b/i, 'claims a cure'],
  [/\bprobably nothing\b/i, 'false reassurance'],
  [/\bnothing to (?:worry about|be concerned about|be worried about)\b/i, 'false reassurance'],
  [/\b(?:no cause for concern|nothing serious|likely harmless|probably harmless|perfectly normal)\b/i,
    'false reassurance'],
  [/\bdon'?t worry\b/i, 'false reassurance'],
  [/\byou'?re fine\b/i, 'false reassurance'],
  [/\bguarantee[ds]?\b/i, 'guarantees an outcome'],
];

/** Comment lines are commentary about the code, not words shown to anyone. */
const isComment = (l) => /^\s*(?:\/\/|\/\*|\*)/.test(l);

/** A sentence may name these words while explicitly denying them. */
const NEGATED = /\b(?:does not|do not|cannot|can't|never|not a medical|no clinical|is not|isn't|won't|refus)/i;

/**
 * Claims this project has measured, found false, and retracted.
 *
 * Each of these was once written in good faith, disproved by measurement, and
 * removed — and then reappeared, because a retraction lives in one commit
 * message while the sentence lives in four files. The per-symptom correction
 * claim had to be chased down three separate times, the last of which was in
 * the methods paragraph of the document you hand a doctor.
 *
 * A retraction is only real if something enforces it.
 */
export const RETRACTED = [
  {
    // Broadened after a fourth sighting. The previous pattern required the
    // word "symptom" after "tracking a second", and the README said "tracking
    // a second ONE never costs accuracy on the first" — the same retracted
    // claim, in the project's most-read file, invisible to the guard written
    // to stop it. A guard that only catches the exact sentence it was born
    // from is a guard against nothing.
    pattern: /(within each symptom separately|each symptom is (?:corrected|judged) (?:as its own|on its own)|tracking (?:a second|another|more)\b[^.]{0,40}never (?:costs|makes|hurts|reduces)|correction (?:done |applied )?(?:\*)?per[- ]symptom)/i,
    why: 'Per-symptom FDR families were reverted: measured 3-4 of 40 noise datasets leaking against 0 of 40 for one global correction, with no recall gained. See docs/INSIGHTS.md Guard 8.',
  },
  {
    pattern: /\b(?:healthspan|biological|body|metabolic|health|real|true|fitness) age\b/i,
    why: 'The bio-age figure was removed; it existed because it was shareable, not because it helped anyone. Any renaming of it is the same claim.',
  },
  {
    pattern: /(cannot explain|rules? (?:it|them|that) out)\b(?![^.]*\b(?:systematic|by luck)\b)/i,
    why: 'Randomisation makes a confound unlikely as systematic bias; it does not rule it out in a single trial.',
  },
  {
    // "trial" alone is not here on purpose: this app runs n-of-1 trials and
    // the word is load-bearing throughout. "free trial" is the paywall sense.
    pattern: /\b(?:free tier|free trial|upgrade to (?:pro|premium|plus)|pro plan|paid plan|premium|subscription|paywall|unlock (?:the |all )?(?:full|premium|pro)|billing)\b/i,
    why: 'The business layer was removed entirely; every feature is available to everyone.',
  },
];

/**
 * The guard's actual verdict on one line, negation window included.
 *
 * Exported so the self-test in tests/run.mjs exercises THIS, not a hand-rolled
 * reimplementation of half of it — my first attempt tested the bare regexes
 * and duly reported that the app's own disclaimer ("it cannot diagnose you,
 * treat you, or cure anything") was a violation.
 */
export function violations(line, context = line) {
  if (isComment(line)) return [];
  const out = [];
  for (const [re, why] of RULES) {
    if (re.test(line) && !NEGATED.test(context)) out.push(why);
  }
  for (const { pattern, why } of RETRACTED) {
    if (pattern.test(line)) out.push(`retracted: ${why}`);
  }
  return out;
}

/**
 * The scan runs only when this file is executed directly. tests/run.mjs imports
 * RULES and RETRACTED to prove the guard catches the shape of a claim rather
 * than one sentence of it, and an import that runs a process.exit(1) on failure
 * would take the unit suite down with it.
 */
const IS_MAIN = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (!IS_MAIN) { /* imported for its rules only */ } else {

let issues = 0;
for (const rel of FILES) {
  const lines = readFileSync(path.join(ROOT, rel), 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (isComment(line)) return;
    // Disclaimers wrap across lines, so judge negation over a small window.
    const windowText = lines.slice(Math.max(0, i - 2), i + 3).join(' ');
    for (const [re, why] of RULES) {
      if (!re.test(line)) continue;
      if (NEGATED.test(windowText)) continue;
      console.error(`  ${rel}:${i + 1}  [${why}]\n    ${line.trim().slice(0, 150)}`);
      issues++;
    }
  });
}

// Retracted claims must not come back.
for (const rel of FILES) {
  const lines = readFileSync(path.join(ROOT, rel), 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (isComment(line)) return;
    for (const { pattern, why } of RETRACTED) {
      if (!pattern.test(line)) continue;
      console.error(`  ${rel}:${i + 1}  [retracted claim]\n    ${line.trim().slice(0, 150)}\n    ${why}`);
      issues++;
    }
  });
}

/**
 * Published test counts must match reality.
 *
 * This has now drifted three times. The app's entire pitch is that its numbers
 * can be checked, so a README claiming 128 tests when there are 133 undermines
 * the one thing it is asking to be trusted about — and it is exactly the kind
 * of thing nobody remembers to update.
 */
const RUN = readFileSync(path.join(ROOT, 'tests/run.mjs'), 'utf8');
const realCount = (RUN.match(/^t\(/gm) || []).length;
for (const rel of ['README.md', 'docs/SCORING.md', 'docs/INSIGHTS.md']) {
  let text;
  try { text = readFileSync(path.join(ROOT, rel), 'utf8'); } catch { continue; }
  for (const m of text.matchAll(/(\d+)\s+(?:unit tests|checks)/g)) {
    if (Number(m[1]) !== realCount) {
      console.error(`  ${rel}  [stale test count]\n    says "${m[0]}" but tests/run.mjs defines ${realCount}`);
      issues++;
    }
  }
}

if (issues) {
  console.error(`\ncopy-guard: ${issues} phrase(s) claim more than this app can support.`);
  process.exit(1);
}
console.log('copy-guard: clean — nothing diagnoses, cures, falsely reassures, or repeats a retracted claim.');

}
