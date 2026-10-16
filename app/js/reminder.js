/**
 * reminder.js — a daily nudge that needs no server, no account and no permission.
 *
 * THE PROBLEM. This app had no reminder of any kind. Not a notification, not a
 * streak, nothing — grep the repo before this file and there is no mention of
 * the Notification API anywhere. For something that only works if you open it
 * every day, that is the gap that decides whether any of the rest ever runs.
 *
 * WHY NOT WEB PUSH. Push needs a push service, which means a server, an
 * endpoint per device and a subscription that leaves the machine. This app's
 * whole position is that nothing leaves the device, and adding a push server
 * would trade the one thing it has for a feature every rival already has.
 * Notification permission alone does not solve it either: a web page cannot
 * wake itself up at 8pm. Scheduling with setTimeout only fires while the tab is
 * open, which is precisely when a reminder is pointless.
 *
 * WHAT THIS DOES INSTEAD. It writes a calendar file. The operating system's own
 * calendar — the thing already on every phone, already reliable, already
 * allowed to make a noise — does the reminding. No permission prompt, no
 * account, no network, and it works on iOS where an uninstalled web app cannot
 * receive push at all.
 *
 * The event uses a floating local time (no Z, no TZID), which in RFC 5545 means
 * "this wall-clock time wherever you happen to be". That is what a daily habit
 * wants: 8pm stays 8pm after you fly somewhere, rather than becoming 3am.
 */

/** Escape a TEXT value per RFC 5545 §3.3.11. */
function escapeText(s) {
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * Fold a content line to 75 octets, per RFC 5545 §3.1.
 *
 * Counted in UTF-8 bytes rather than characters, and never split inside a
 * multi-byte sequence — a symptom label with an accent or an emoji in it would
 * otherwise produce a file some calendars reject and others silently mangle.
 */
function fold(line) {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out = [];
  let start = 0, limit = 75;
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    // Walk back off a continuation byte so a code point is never cut in half.
    while (end > start && end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
    out.push(new TextDecoder().decode(bytes.slice(start, end)));
    start = end;
    limit = 74;             // continuation lines carry a leading space
  }
  return out.join('\r\n ');
}

const pad = (n) => String(n).padStart(2, '0');

/** YYYYMMDDTHHMMSSZ, from a Date, in UTC. */
function utcStamp(d) {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`
    + `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

/**
 * Build the calendar file.
 *
 * `hour`/`minute` are local wall-clock. `startDate` is a YYYY-MM-DD key; the
 * first occurrence is that day, and RRULE:FREQ=DAILY carries it forward with no
 * end — a chronic condition does not have an end date, and an event that
 * expires after a month would quietly stop reminding exactly when the log is
 * getting long enough to be worth something.
 */
export function buildReminder({ hour = 20, minute = 0, startDate, uid, now = new Date(), label = 'Log today' } = {}) {
  const h = Math.max(0, Math.min(23, Math.floor(hour)));
  const m = Math.max(0, Math.min(59, Math.floor(minute)));
  const [y, mo, d] = (startDate || `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`)
    .split('-').map(Number);

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//VitalArc//Daily log reminder//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid || `vitalarc-daily-${y}${pad(mo)}${pad(d)}-${pad(h)}${pad(m)}@local`}`,
    `DTSTAMP:${utcStamp(now)}`,
    // Floating local time: no Z and no TZID, so it stays at this wall-clock
    // hour wherever the person is.
    `DTSTART:${y}${pad(mo)}${pad(d)}T${pad(h)}${pad(m)}00`,
    'DURATION:PT5M',
    'RRULE:FREQ=DAILY',
    `SUMMARY:${escapeText(label)}`,
    `DESCRIPTION:${escapeText(
      'Open VitalArc and log the day. A missed day is not just a gap — the app measures whether '
      + 'the days you skip are systematically your worse ones, and too many of them make every '
      + 'pattern it finds less trustworthy.')}`,
    'TRANSP:TRANSPARENT',
    'BEGIN:VALARM',
    'TRIGGER:PT0M',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeText(label)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  // RFC 5545 requires CRLF, and a trailing one.
  return lines.map(fold).join('\r\n') + '\r\n';
}

/** A filename that says what it is in a downloads folder six months later. */
export const reminderFilename = (hour = 20, minute = 0) =>
  `vitalarc-daily-reminder-${pad(hour)}${pad(minute)}.ics`;
