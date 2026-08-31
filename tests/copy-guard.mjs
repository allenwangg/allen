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
];

const RULES = [
  [/\byou (?:probably )?have (?:a |an )?(?:condition|disease|disorder|syndrome|deficiency|infection)\b/i, 'asserts a diagnosis'],
  [/\b(?:this|it|that) (?:is|looks like|could be|might be|sounds like) (?:a |an )?(?:migraine|ibs|anxiety|depression|apn(?:o|oe)a|diabetes|an(?:a)?emia|deficiency)\b/i, 'names a condition as a conclusion'],
  [/\byou should (?:take|stop taking|start taking|increase|reduce|double|halve)\b/i, 'directs treatment'],
  [/\b(?:cures?|cured|curing|will fix|will heal)\b/i, 'claims a cure'],
  [/\bprobably nothing\b/i, 'false reassurance'],
  [/\bnothing to worry about\b/i, 'false reassurance'],
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
const RETRACTED = [
  {
    pattern: /(within each symptom separately|each symptom is (?:corrected|judged) (?:as its own|on its own)|tracking (?:a second|more) symptoms? never (?:costs|makes))/i,
    why: 'Per-symptom FDR families were reverted: measured 3-4 of 40 noise datasets leaking against 0 of 40 for one global correction, with no recall gained. See docs/INSIGHTS.md Guard 8.',
  },
  {
    pattern: /\bhealthspan age\b/i,
    why: 'The bio-age figure was removed; it existed because it was shareable, not because it helped anyone.',
  },
  {
    pattern: /(cannot explain|rules? (?:it|them|that) out)\b(?![^.]*\b(?:systematic|by luck)\b)/i,
    why: 'Randomisation makes a confound unlikely as systematic bias; it does not rule it out in a single trial.',
  },
  {
    pattern: /\b(?:free tier|upgrade to pro|pro plan|subscription|paywall)\b/i,
    why: 'The business layer was removed entirely; every feature is available to everyone.',
  },
];

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

if (issues) {
  console.error(`\ncopy-guard: ${issues} phrase(s) claim more than this app can support.`);
  process.exit(1);
}
console.log('copy-guard: clean — nothing diagnoses, cures, falsely reassures, or repeats a retracted claim.');
