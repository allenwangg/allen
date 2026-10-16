/**
 * clinical.js — the half of the record a clinician cannot work without.
 *
 * THE PROBLEM. This app produces a document headed "Summary for an
 * appointment" and hands it to a doctor. Until now that document contained no
 * medication list, no allergies, no date the illness started, and no account of
 * what had already been investigated. A symptom summary without a drug list is
 * close to uninterpretable: a good share of what is plotted on those charts
 * could be the side effect of something the person takes every morning, and the
 * reader has no way to know. Meanwhile the illness timeline began at the first
 * logged day, so three years of being unwell read as "started six weeks ago",
 * and "What I've already tried" meant only the behaviour trials this app ran —
 * not the MRI, the elimination diet or the two specialists.
 *
 * Worse than absent: the only place a drug could previously be recorded was the
 * suspected-factors list, so the one way to get your prescription onto the page
 * was to print it under "What I've been watching for" — your own medication,
 * listed to your doctor as a suspected cause of your symptom.
 *
 * WHY THE SECTION PRINTS EVEN WHEN IT IS EMPTY. Every other section of the
 * report hides itself when there is nothing in it. This one must not, because a
 * reader who sees no medication section will take it to mean no medications.
 * Omission reads as zero — the same mistake as a blank chart reading as a
 * measured zero, or an unanswered field being saved as the population average.
 * So an unfilled list prints "I have not listed these" in as many words.
 *
 * WHAT THIS IS NOT. It is a record of what the person says, presented as what
 * the person says: "What I take", not "Medications"; "What I've been told", not
 * "Diagnoses". Nothing here is verified, nothing here is reconciled against a
 * pharmacy record, and the report says so. This app has no clinician in it.
 *
 * AND IT DOES NOT FEED THE ENGINE. A medication is not entered as a driver.
 * Finding "on the days I take my tablets the symptom is worse" is a sentence
 * that gets people to stop taking their tablets, and the arrow very commonly
 * points the other way — you take the rescue medication on the bad days
 * BECAUSE they are bad. experiments.js already refuses to run a trial on a
 * prescription; this module is the matching refusal on the observational side.
 * Someone who genuinely wants a drug in the analysis can still add it as a
 * suspected factor by hand, which is a deliberate act with its own warning.
 */

/* ------------------------------------------------------------------ *
 * Shape
 * ------------------------------------------------------------------ */

export const MAX_MEDICATIONS = 24;
export const MAX_HISTORY = 24;

/**
 * Prescription, pharmacy shelf and supplement are kept apart because a reader
 * needs them apart. St John's Wort and a statin interact; "supplement" is not
 * a synonym for "harmless", and a doctor who asks "are you on anything?" is
 * asking about all three.
 */
export const MED_KINDS = [
  { value: 'prescription', label: 'Prescribed' },
  { value: 'otc', label: 'Over the counter' },
  { value: 'supplement', label: 'Supplement' },
];

/**
 * What has already been done about it. One list rather than four, because the
 * question a clinician is answering — has this been looked at, and what came
 * back — does not care which category it falls into.
 */
export const HISTORY_KINDS = [
  { value: 'test', label: 'Test or scan' },
  { value: 'diagnosis', label: 'What I was told' },
  { value: 'treatment', label: 'Treatment tried' },
  { value: 'referral', label: 'Referral or specialist' },
];

export const EMPTY_CLINICAL = {
  onset: '', onsetNote: '', allergies: '',
  medications: [], history: [],
};

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function newId(prefix, taken) {
  for (let i = 0; i < 50; i++) {
    const id = prefix + Math.random().toString(36).slice(2, 10).padEnd(8, '0');
    if (!taken.has(id)) return id;
  }
  return prefix + Date.now().toString(36);
}

/**
 * Validate the clinical record.
 *
 * Dates are free text on purpose. Real answers are "about 2019", "after the
 * flu", "last spring" — a date picker here forces a person to invent a day they
 * do not know, and an invented date in a clinical document is worse than a
 * vague true one. Nothing downstream does arithmetic on these strings.
 */
export function validateClinical(raw) {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_CLINICAL };

  const medIds = new Set();
  const medications = (Array.isArray(raw.medications) ? raw.medications : [])
    .map((m) => {
      if (!m || typeof m !== 'object') return null;
      const name = str(m.name, 120);
      if (!name) return null;                       // a nameless drug is noise
      const id = typeof m.id === 'string' && /^m_[a-z0-9]{1,32}$/.test(m.id) && !medIds.has(m.id)
        ? m.id : newId('m_', medIds);
      medIds.add(id);
      const kind = MED_KINDS.some((k) => k.value === m.kind) ? m.kind : 'prescription';
      return {
        id, name, kind,
        dose: str(m.dose, 80),
        forWhat: str(m.forWhat, 120),
        started: str(m.started, 40),
        stopped: str(m.stopped, 40),
      };
    })
    .filter(Boolean)
    .slice(0, MAX_MEDICATIONS);

  const histIds = new Set();
  const history = (Array.isArray(raw.history) ? raw.history : [])
    .map((h) => {
      if (!h || typeof h !== 'object') return null;
      const what = str(h.what, 160);
      if (!what) return null;
      const id = typeof h.id === 'string' && /^h_[a-z0-9]{1,32}$/.test(h.id) && !histIds.has(h.id)
        ? h.id : newId('h_', histIds);
      histIds.add(id);
      const kind = HISTORY_KINDS.some((k) => k.value === h.kind) ? h.kind : 'test';
      return { id, what, kind, when: str(h.when, 40), outcome: str(h.outcome, 300) };
    })
    .filter(Boolean)
    .slice(0, MAX_HISTORY);

  return {
    onset: str(raw.onset, 60),
    onsetNote: str(raw.onsetNote, 300),
    allergies: str(raw.allergies, 300),
    medications,
    history,
  };
}

export function addMedication(clinical, fields = {}) {
  const c = validateClinical(clinical);
  if (c.medications.length >= MAX_MEDICATIONS) {
    return { clinical: c, error: `That is the ${MAX_MEDICATIONS}-item limit.` };
  }
  const name = str(fields.name, 120);
  if (!name) return { clinical: c, error: 'Give it a name first.' };
  return {
    clinical: validateClinical({ ...c, medications: [...c.medications, { ...fields, name }] }),
    error: null,
  };
}

export function addHistory(clinical, fields = {}) {
  const c = validateClinical(clinical);
  if (c.history.length >= MAX_HISTORY) {
    return { clinical: c, error: `That is the ${MAX_HISTORY}-item limit.` };
  }
  const what = str(fields.what, 160);
  if (!what) return { clinical: c, error: 'Say what it was first.' };
  return {
    clinical: validateClinical({ ...c, history: [...c.history, { ...fields, what }] }),
    error: null,
  };
}

export function removeFrom(clinical, list, id) {
  const c = validateClinical(clinical);
  if (list !== 'medications' && list !== 'history') return c;
  return validateClinical({ ...c, [list]: c[list].filter((x) => x.id !== id) });
}

/* ------------------------------------------------------------------ *
 * What the report needs
 * ------------------------------------------------------------------ */

/** Still taking it, versus took it and stopped. Both matter; they matter differently. */
export function splitMedications(clinical) {
  const c = validateClinical(clinical);
  return {
    current: c.medications.filter((m) => !m.stopped),
    past: c.medications.filter((m) => m.stopped),
  };
}

/** One line per medication, the way a person would say it out loud. */
export function describeMedication(m) {
  const kind = MED_KINDS.find((k) => k.value === m.kind);
  const bits = [m.name];
  if (m.dose) bits.push(m.dose);
  const tail = [];
  if (m.forWhat) tail.push(`for ${m.forWhat}`);
  if (m.started) tail.push(`since ${m.started}`);
  if (m.stopped) tail.push(`stopped ${m.stopped}`);
  return bits.join(' ') + (tail.length ? ` — ${tail.join(', ')}` : '')
    + (kind && m.kind !== 'prescription' ? ` (${kind.label.toLowerCase()})` : '');
}

/**
 * How much of the clinical record is filled in, and what is missing.
 *
 * Used to ask for the gap once, in the right place, rather than nagging. The
 * list is ordered by what a clinician misses most.
 */
export function clinicalGaps(clinical) {
  const c = validateClinical(clinical);
  const gaps = [];
  if (!c.medications.length) gaps.push({ key: 'medications', label: 'what you take' });
  if (!c.onset) gaps.push({ key: 'onset', label: 'when it started' });
  if (!c.history.length) gaps.push({ key: 'history', label: "what's already been looked at" });
  if (!c.allergies) gaps.push({ key: 'allergies', label: 'allergies' });
  return gaps;
}

/* ------------------------------------------------------------------ *
 * The notes — 2000 characters a day that never reached the page
 * ------------------------------------------------------------------ */

/** How many days of notes the report prints. */
export const NOTE_DAYS = 8;

/**
 * The notes worth printing.
 *
 * The app collects up to 2000 characters a day and the report showed none of
 * it, which threw away the single richest thing in the diary: "woke at 4am,
 * vomited, took two tablets, could not face work" is the sentence that makes a
 * row of numbers mean something. Printing all of it is not an option either —
 * a hundred days of free text is not a summary, and nobody reads page four.
 *
 * So: the notes from the worst days, which is where the clinical yield is.
 * Ranked by the main symptom's severity, then by recency, because a reader with
 * limited time wants the bad days and the recent ones, and ties should break
 * towards what is happening now.
 *
 * Every day shown carries its severity next to it, so a reader can tell a note
 * from a 4-out-of-4 day from a note on an ordinary one, and the section states
 * how many notes exist in total rather than quietly implying these are all of
 * them.
 */
export function notableNotes(entries, symptomId, { limit = NOTE_DAYS } = {}) {
  const withNotes = (entries || [])
    .filter((e) => e && e.date && typeof e.notes === 'string' && e.notes.trim())
    .map((e) => ({
      date: e.date,
      note: e.notes.trim(),
      severity: symptomId ? (e.symptoms?.[symptomId] ?? null) : null,
    }));
  if (!withNotes.length) return { shown: [], total: 0, omitted: 0, ranked: false };

  const ranked = !!symptomId && withNotes.some((x) => x.severity != null);
  const sorted = [...withNotes].sort((a, b) => {
    if (ranked) {
      const d = (b.severity ?? -1) - (a.severity ?? -1);
      if (d) return d;
    }
    return b.date < a.date ? -1 : b.date > a.date ? 1 : 0;   // recent first
  });

  // Shown in date order, because a clinician reads a history forwards.
  const shown = sorted.slice(0, limit).sort((a, b) => (a.date < b.date ? -1 : 1));
  return { shown, total: withNotes.length, omitted: Math.max(0, withNotes.length - shown.length), ranked };
}
