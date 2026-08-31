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

export const INTAKE_VERSION = 2;
export const INTAKE_CATEGORIES = ['labor', 'material', 'subcontractor', 'equipment', 'other'];

/**
 * Limits enforced on DECODE, not just encode.
 *
 * An attacker never runs the encoder — they craft the string. Capping only on
 * the way out is security theatre: it constrains the honest path and leaves
 * the hostile one wide open.
 */
const MAX_CODE_LENGTH = 8000;    // a real job encodes to well under 400 chars
const MAX_CHANGES = 40;
const MAX_TEXT = 120;
const MAX_MONEY = 1e12;          // a trillion-dollar remodel is not the use case

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

/**
 * FNV-1a over the payload, as four base64url characters.
 *
 * This is an integrity check, not a signature — it defends against a link
 * mangled in transit, which is the realistic failure: an email client wrapping
 * a line, a chat app eating a character, someone retyping it by hand. Without
 * it a single altered character is accepted hundreds of ways, and in a fifth
 * of those it silently carries DIFFERENT money into a report the contractor
 * will be shown. Confidently wrong is far worse than refusing to load.
 */
function checksum(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let out = '';
  for (let i = 0; i < 4; i++) out += alphabet[(h >>> (i * 6)) & 63];
  return out;
}

/* ------------------------------------------------------------- encoding --- */

/**
 * Money to two decimals, with anything non-finite or absurd flattened to zero.
 * An unclamped 1e308 overflows the cents arithmetic downstream to Infinity and
 * the audit then reports "$0.00 found" rather than failing visibly.
 */
const round2 = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n) || Math.abs(n) > MAX_MONEY) return 0;
  return Math.round(n * 100) / 100;
};

/** Pack a job summary into a compact, URL-safe string. */
export function encodeIntake(input) {
  const payload = [
    INTAKE_VERSION,
    String(input.title || '').slice(0, MAX_TEXT),
    String(input.client || '').slice(0, MAX_TEXT),
    round2(input.quotedTotal),
    INTAKE_CATEGORIES.map((c) => round2(input.budget?.[c])),
    INTAKE_CATEGORIES.map((c) => round2(input.spent?.[c])),
    (input.changes || [])
      .filter((c) => Number(c.amount))
      .slice(0, MAX_CHANGES)
      .map((c) => [String(c.title || '').slice(0, MAX_TEXT), round2(c.amount), c.signed ? 1 : 0]),
  ];
  const body = toBase64Url(JSON.stringify(payload));
  return checksum(body) + body;
}

/**
 * Unpack a link. Returns null rather than throwing on anything malformed —
 * a mistyped or truncated link is a routine event when people paste things,
 * and the caller shows a readable message instead of a stack trace.
 */
export function decodeIntake(encoded) {
  if (!encoded || typeof encoded !== 'string') return null;
  const raw = encoded.trim();
  // Refuse anything oversized before doing any work on it.
  if (raw.length < 5 || raw.length > MAX_CODE_LENGTH) return null;

  const body = raw.slice(4);
  if (checksum(body) !== raw.slice(0, 4)) return null;   // mangled in transit

  let parsed;
  try {
    parsed = JSON.parse(fromBase64Url(body));
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed[0] !== INTAKE_VERSION) return null;

  const [, title, client, quoted, budgetArr, spentArr, changesArr] = parsed;
  if (!Array.isArray(budgetArr) || !Array.isArray(spentArr)) return null;

  // Every cap the encoder applies is re-applied here, because a hostile link
  // was never produced by the encoder in the first place.
  const text = (v) => (typeof v === 'string' ? v.slice(0, MAX_TEXT) : '');
  const unpack = (arr) => Object.fromEntries(
    INTAKE_CATEGORIES.map((c, i) => [c, round2(arr[i])]),
  );

  return {
    title: text(title),
    client: text(client),
    quotedTotal: round2(quoted),
    budget: unpack(budgetArr),
    spent: unpack(spentArr),
    changes: (Array.isArray(changesArr) ? changesArr : [])
      .filter((c) => Array.isArray(c))
      .slice(0, MAX_CHANGES)
      .map((c) => ({ title: text(c[0]), amount: round2(c[1]), signed: c[2] === 1 })),
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
