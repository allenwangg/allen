/**
 * intake-link.js — carry a job summary in a URL, with no server.
 *
 * The margin audit's real bottleneck is not the hour of data entry; it is
 * having to be on a phone call to collect the numbers at all. A link the
 * contractor fills in on their own time turns five booked calls into twenty
 * sent links, which is the only part of the funnel that scales without a
 * backend.
 *
 * Everything travels in the URL fragment, which browsers never send to a
 * server — so even the hosted page cannot see a contractor's figures. That is
 * a privacy property worth stating to them out loud when you ask.
 *
 * The payload is a positional array rather than an object: field names would
 * roughly double the encoded length for no benefit, and the shape is versioned
 * so an older link can never be silently misread by newer code.
 */

export const INTAKE_VERSION = 1;
export const INTAKE_CATEGORIES = ['labor', 'material', 'subcontractor', 'equipment', 'other'];

/* ------------------------------------------------------ base64url (utf-8) -- */

/**
 * btoa() only accepts Latin-1, and real job titles contain em dashes and
 * accented names, so text is encoded to UTF-8 bytes first. Padding is stripped
 * and +/ swapped for -_ so the result survives being pasted into any URL,
 * chat client, or email that might reformat it.
 */
function toBase64Url(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(encoded) {
  const padded = encoded.replace(/-/g, '+').replace(/_/g, '/')
    + '='.repeat((4 - (encoded.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/* ------------------------------------------------------------- encoding --- */

const round2 = (v) => Math.round((Number(v) || 0) * 100) / 100;

/** Pack a job summary into a compact, URL-safe string. */
export function encodeIntake(input) {
  const payload = [
    INTAKE_VERSION,
    String(input.title || '').slice(0, 120),
    String(input.client || '').slice(0, 120),
    round2(input.quotedTotal),
    INTAKE_CATEGORIES.map((c) => round2(input.budget?.[c])),
    INTAKE_CATEGORIES.map((c) => round2(input.spent?.[c])),
    (input.changes || [])
      .filter((c) => Number(c.amount))
      .slice(0, 40)
      .map((c) => [String(c.title || '').slice(0, 120), round2(c.amount), c.signed ? 1 : 0]),
  ];
  return toBase64Url(JSON.stringify(payload));
}

/**
 * Unpack a link. Returns null rather than throwing on anything malformed —
 * a mistyped or truncated link is a routine event when people paste things,
 * and the caller shows a readable message instead of a stack trace.
 */
export function decodeIntake(encoded) {
  if (!encoded || typeof encoded !== 'string') return null;
  let parsed;
  try {
    parsed = JSON.parse(fromBase64Url(encoded.trim()));
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed[0] !== INTAKE_VERSION) return null;

  const [, title, client, quoted, budgetArr, spentArr, changesArr] = parsed;
  if (!Array.isArray(budgetArr) || !Array.isArray(spentArr)) return null;

  const unpack = (arr) => Object.fromEntries(
    INTAKE_CATEGORIES.map((c, i) => [c, Number(arr[i]) || 0]),
  );

  return {
    title: typeof title === 'string' ? title : '',
    client: typeof client === 'string' ? client : '',
    quotedTotal: Number(quoted) || 0,
    budget: unpack(budgetArr),
    spent: unpack(spentArr),
    changes: (Array.isArray(changesArr) ? changesArr : [])
      .filter((c) => Array.isArray(c))
      .map((c) => ({ title: String(c[0] ?? ''), amount: Number(c[1]) || 0, signed: c[2] === 1 })),
  };
}

/** Pull an intake payload out of a full URL, a bare fragment, or a raw code. */
export function readIntakeFrom(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const afterHash = raw.includes('#') ? raw.slice(raw.lastIndexOf('#') + 1) : raw;
  // Tolerate both '#j=CODE' and a bare pasted code.
  const code = afterHash.startsWith('j=') ? afterHash.slice(2) : afterHash;
  return decodeIntake(code);
}
