/**
 * csv.js — the export, per RFC 4180.
 *
 * THE BUG. Only the notes column was escaped. Symptom and factor labels are
 * free text the person typed, and they go into the header row — so a symptom
 * somebody had called "Joint pain (knee, left)" split into two header cells,
 * shifting every column to the right of it one place out of line with its own
 * data. Every reading in the file then sat under the wrong name, in a file
 * meant to be loaded into a spreadsheet or handed to a clinician to check the
 * app's arithmetic against.
 *
 * Treating one column as dangerous and the rest as safe was the whole mistake.
 * Everything goes through the same function now, header included.
 */

/**
 * One cell.
 *
 * Numbers go out bare. Quoting a measurement, or prefixing a negative one with
 * the apostrophe that the formula guard below adds, turns it into text that no
 * spreadsheet will average — which defeats the point of exporting a CSV.
 */
export function cell(v) {
  if (v == null) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  let s = String(v).replace(/"/g, '""');
  // Spreadsheet formula injection (CWE-1236): a note beginning `=HYPERLINK(…)`
  // or `+cmd|…` executes on open in Excel and Sheets. A leading apostrophe
  // forces text interpretation and is hidden by the spreadsheet, so the note
  // still reads as written.
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  // Quote on anything that could end a field or a record — and on the
  // apostrophe the guard above may have just added, so that a defused formula
  // survives a round trip through a parser rather than being re-read as data.
  return /[",\r\n']/.test(s) ? `"${s}"` : s;
}

/** One record. */
export const row = (cells) => cells.map(cell).join(',');

/**
 * The whole file.
 *
 * CRLF between records and a trailing one, because RFC 4180 says so and
 * because Excel on Windows reads a bare-LF file as a single row.
 */
export function toCSV(header, rows) {
  return [row(header), ...rows.map(row)].join('\r\n') + '\r\n';
}
