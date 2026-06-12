/** Minimal, dependency-free CSV serialization (RFC 4180). */

/**
 * Escape a single CSV field. A value is quoted when it contains a comma, a
 * double-quote, or any newline; embedded quotes are doubled. `null`/`undefined`
 * become an empty field. Objects are JSON-stringified so structured columns
 * (e.g. attributes) survive a round-trip into a spreadsheet.
 */
export function csvField(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str =
    typeof value === 'object'
      ? JSON.stringify(value)
      : typeof value === 'string'
        ? value
        : String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Build a CSV document from a header row and an array of records. Columns are
 * driven by `columns`; each row reads the matching key from the record. Lines
 * are CRLF-terminated per RFC 4180 so the file opens cleanly in Excel.
 */
export function toCsv<T extends Record<string, unknown>>(
  columns: readonly (keyof T & string)[],
  rows: readonly T[],
): string {
  const lines: string[] = [columns.map(csvField).join(',')];
  for (const row of rows) {
    lines.push(columns.map((col) => csvField(row[col])).join(','));
  }
  return `${lines.join('\r\n')}\r\n`;
}
