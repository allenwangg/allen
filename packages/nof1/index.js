/**
 * @vitalarc/nof1 — the n-of-1 evidence engine, as an embeddable surface.
 *
 * WHAT THIS IS FOR. The app in this repository is one consumer of this engine.
 * The engine is the part with value outside it: every digital therapeutics
 * product, wearable and health app eventually has to answer "did this work for
 * THIS person", and essentially none of them can. The statistics are subtle
 * enough that most get them wrong — docs/INSIGHTS.md is a record of this
 * codebase getting several of them wrong first and measuring its way out.
 *
 * WHY THIS FILE RE-EXPORTS RATHER THAN CONTAINS. Copying the engine in here
 * would create two implementations that drift, which is the precise failure
 * mode guarded against in verify.html's duplicate of the exact test. There is
 * one implementation. This file is the contract: the list of things an embedder
 * may depend on, and the promise that the rest is internal and will move.
 *
 * WHAT AN EMBEDDER GETS. No DOM, no storage, no network, no framework, no build
 * step — asserted mechanically by tests/run.mjs, not by this comment. Pass in
 * an array of daily entries, get back findings, trials, and certificates that a
 * third party can verify without seeing the underlying data.
 *
 * STABILITY. SURFACE below is the whole public API and is locked by a test. Add
 * to it deliberately; remove from it only with a major version, because
 * somebody's product breaks when you do.
 */

/* ------------------------------------------------------------------ *
 * Discovery — what in a log moves with a symptom
 * ------------------------------------------------------------------ */
export {
  discover,           // the full hypothesis grid, FDR-corrected
  phrase,             // a finding, in a sentence a person can read
  labelFor,
  isLowerBetter,
  effectSize,
  attainableR,        // the ceiling a correlation could reach given its ties
  weekdayEffects,     // day-of-week structure, permutation-tested
  loggingBiasChecks,  // whether the days someone skipped were their worse ones
  symptomTrend,       // better, worse, or not enough to say
  compareWindows,
  sensitivityNote,    // what "nothing held up" is worth at this much history
  detectionChance,
  daysForChance,
  POWER_CURVE,        // measured recall of this engine by log length
  MIN_PAIRS as DISCOVERY_MIN_PAIRS,
  MIN_INFORMATIVE,
  MIN_REPORTABLE_R,
  FDR_Q,
} from '../../app/js/insights.js';

/* Statistics primitives, for embedders who want to build their own layer. */
export {
  spearman,
  benjaminiHochberg,
  permutationP,
  correlationCI,
  effectiveN,
  lag1Autocorr,
} from '../../app/js/insights.js';

/* ------------------------------------------------------------------ *
 * Trials — the only part that can support the sentence "this helped"
 * ------------------------------------------------------------------ */
export {
  createTrial,
  trialDays,
  trialEndDate,
  daysRemaining,
  isComplete,
  schedule,
  armForDate,
  analyze,            // the exact randomisation test
  verdict,
  adherence,
  floorP,             // the best p-value a given length could ever produce
  trialOutlook,       // what this design can realistically detect, measured
  trialPower,
  TRIAL_POWER_GRID,
  MIN_PAIRS as TRIAL_MIN_PAIRS,
  MAX_PAIRS as TRIAL_MAX_PAIRS,
  DEFAULT_PAIRS,
} from '../../app/js/experiments.js';

/* ------------------------------------------------------------------ *
 * Evidence — the part that makes a result portable
 * ------------------------------------------------------------------ */
export {
  commit as registerTrial,      // hash the design before any data exists
  verify as checkRegistration,  // has the design changed since?
  canonicalDesign,
  PREREG_VERSION,
  COMMITTED_FIELDS,
} from '../../app/js/prereg.js';

export {
  issue as issueCertificate,
  check as checkCertificate,
  render as renderCertificate,
  canonicalCertificate,
  exactP,                       // rederive a p-value from pair differences alone
  CERT_VERSION,
} from '../../app/js/certificate.js';

export {
  cohorts,                      // many verified trials, aggregated honestly
  wilson,
  cohortKey,
  RESPONDER_ALPHA,
  MIN_REPORTING,
} from '../../app/js/registry.js';

/* ------------------------------------------------------------------ *
 * Safety — conservative flags, never diagnostic
 * ------------------------------------------------------------------ */
export {
  checkFlags,
  checkNotesForCrisis,
  binomTailGE,
} from '../../app/js/safety.js';

/* ------------------------------------------------------------------ *
 * The data shapes an embedder has to produce
 * ------------------------------------------------------------------ */
export {
  emptyEntry,
  validateEntry,
  validateSymptoms,
  validateFactors,
  symptomId,
  dateKey,
  addDays,
  daysBetween,
  FIELDS,
  DRIVER_FIELDS,
  OUTCOME_FIELDS,
  SEVERITY,
  SEVERITY_MAX,
  AMOUNT,
  AMOUNT_MAX,
} from '../../app/js/model.js';

/** Semantic version of the public surface, not of the app that ships it. */
export const ENGINE_VERSION = '1.0.0';

/**
 * Every name an embedder may rely on.
 *
 * Locked by a test. This is not documentation that drifts from reality — if
 * the exports and this list disagree, the suite fails and says which way.
 */
export const SURFACE = Object.freeze([
  // discovery
  'discover', 'phrase', 'labelFor', 'isLowerBetter', 'effectSize', 'attainableR',
  'weekdayEffects', 'loggingBiasChecks', 'symptomTrend', 'compareWindows',
  'sensitivityNote', 'detectionChance', 'daysForChance', 'POWER_CURVE',
  'DISCOVERY_MIN_PAIRS', 'MIN_INFORMATIVE', 'MIN_REPORTABLE_R', 'FDR_Q',
  // primitives
  'spearman', 'benjaminiHochberg', 'permutationP', 'correlationCI', 'effectiveN', 'lag1Autocorr',
  // trials
  'createTrial', 'trialDays', 'trialEndDate', 'daysRemaining', 'isComplete', 'schedule',
  'armForDate', 'analyze', 'verdict', 'adherence', 'floorP', 'trialOutlook', 'trialPower',
  'TRIAL_POWER_GRID', 'TRIAL_MIN_PAIRS', 'TRIAL_MAX_PAIRS', 'DEFAULT_PAIRS',
  // evidence
  'registerTrial', 'checkRegistration', 'canonicalDesign', 'PREREG_VERSION', 'COMMITTED_FIELDS',
  'issueCertificate', 'checkCertificate', 'renderCertificate', 'canonicalCertificate',
  'exactP', 'CERT_VERSION',
  'cohorts', 'wilson', 'cohortKey', 'RESPONDER_ALPHA', 'MIN_REPORTING',
  // safety
  'checkFlags', 'checkNotesForCrisis', 'binomTailGE',
  // data shapes
  'emptyEntry', 'validateEntry', 'validateSymptoms', 'validateFactors', 'symptomId',
  'dateKey', 'addDays', 'daysBetween', 'FIELDS', 'DRIVER_FIELDS', 'OUTCOME_FIELDS',
  'SEVERITY', 'SEVERITY_MAX', 'AMOUNT', 'AMOUNT_MAX',
  // meta
  'ENGINE_VERSION', 'SURFACE',
]);
