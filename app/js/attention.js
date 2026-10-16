/**
 * attention.js — stop asking for things that cannot answer anything.
 *
 * THE PROBLEM. The log screen asks for sixteen habit fields every day, forever,
 * regardless of whether the person's answers ever change. Measured on a
 * faithful but routine logger over 120 days — someone who varies their sleep,
 * stress, steps and drinking and leaves the rest alone, which is what most
 * people's lives actually look like — TWELVE of the sixteen were mathematically
 * incapable of ever producing a finding. The engine skips them in silence
 * (hasUsableVariance), and the app goes on asking for them daily.
 *
 * That is the single largest avoidable cost this app imposes. Daily logging is
 * what kills symptom trackers: people quit in the first fortnight, and nothing
 * downstream — however rigorous — ever gets to run.
 *
 * THE RULE IS NOT A HEURISTIC. A variable that does not vary cannot correlate
 * with anything. That is arithmetic, not a guess, and it is the same function
 * the engine uses to decide what to test. Importing hasUsableVariance rather
 * than reimplementing it is deliberate: the set of things the app asks about
 * and the set it can analyse must be the same set, or the app is wasting
 * somebody's time on a technicality.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO.
 *
 * It never touches symptoms or user-defined factors. Those are the person's own
 * question — the reason they opened the app — and an engine's opinion about
 * their variance is not grounds for burying them.
 *
 * It demotes rather than removes, and says why, with a one-tap way back. A
 * hidden field is a self-fulfilling prophecy: hide "strength session" from
 * someone about to start lifting and it stays inert forever. The wording has to
 * carry that, which is why it says what changed rather than announcing a
 * verdict.
 *
 * It waits for enough history. Below three weeks everything looks constant, and
 * demoting a field on day four would be a guess wearing the clothes of a
 * measurement.
 */

import { hasUsableVariance } from './insights.js';
import { DRIVER_FIELDS, FIELDS } from './model.js';

/**
 * Days of history before the app is willing to conclude anything about a field.
 *
 * Matches the engine's own floor for reporting a correlation: if there is not
 * enough history to find a pattern, there is not enough to rule a field out
 * either.
 */
export const MIN_DAYS_TO_JUDGE = 21;

/**
 * Which habit fields are worth a person's attention, and which are not.
 *
 * Returns `{ live, inert }`, both arrays of field names, plus a per-field note
 * explaining the call in terms of what the person actually did.
 */
export function fieldAttention(entries, fields = DRIVER_FIELDS) {
  const logged = (entries || []).filter((e) => e && e.date);
  const out = { live: [], inert: [], notes: {}, judged: logged.length >= MIN_DAYS_TO_JUDGE };
  if (!out.judged) return { ...out, live: [...fields] };

  for (const field of fields) {
    const values = logged.map((e) => e[field]).filter((v) => v != null && Number.isFinite(v));
    if (values.length < MIN_DAYS_TO_JUDGE) { out.live.push(field); continue; }

    if (hasUsableVariance(values)) { out.live.push(field); continue; }

    const counts = new Map();
    for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
    let modal = values[0], best = 0;
    for (const [v, n] of counts) if (n > best) { best = n; modal = v; }

    out.inert.push(field);
    out.notes[field] = {
      field,
      label: FIELDS[field]?.label || field,
      days: values.length,
      sameCount: best,
      value: modal,
      unit: FIELDS[field]?.unit || '',
      reason: best === values.length
        ? `the same on all ${values.length} days you logged it`
        : `the same on ${best} of ${values.length} days`,
    };
  }
  return out;
}

/**
 * One sentence for the collapsed group.
 *
 * Says what the person did, not what the app decided. "You answered these the
 * same way" is a fact they can check; "these were deemed uninformative" is a
 * verdict they can only accept.
 */
export function attentionSummary(att) {
  const n = att.inert.length;
  if (!n) return null;
  return `${n} ${n === 1 ? 'question answers' : 'questions answer'} the same way every day, so nothing in `
    + `${n === 1 ? 'it' : 'them'} can line up with how you feel. Hidden to keep the daily log short — open them any time one starts to change.`;
}
