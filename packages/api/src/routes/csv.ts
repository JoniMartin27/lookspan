/** Minimal, dependency-free CSV serialization (RFC 4180) with audit hardening. */

/**
 * UTF-8 byte-order mark. Prepended to every CSV document so spreadsheet
 * applications (notably Excel on Windows) detect the encoding and render
 * accented characters correctly instead of mojibake.
 */
export const UTF8_BOM = '﻿';

/**
 * Characters that, when they START a CSV cell, can trigger formula execution
 * in spreadsheet applications (CSV / formula injection, CWE-1236). Excel,
 * LibreOffice and Google Sheets treat a leading `=`, `+`, `-`, `@`, TAB (0x09)
 * or CR (0x0D) as the beginning of a formula.
 */
const CSV_INJECTION_PREFIXES = new Set(['=', '+', '-', '@', '\t', '\r']);

/**
 * Escape a single CSV field. A value is quoted when it contains a comma, a
 * double-quote, or any newline; embedded quotes are doubled. `null`/`undefined`
 * become an empty field. Objects are JSON-stringified so structured columns
 * (e.g. attributes) survive a round-trip into a spreadsheet.
 *
 * Anti-injection (CWE-1236 / OWASP CSV injection): when the ORIGINAL value is a
 * **string** whose first character is one of `= + - @ TAB CR`, the field is
 * prefixed with a single quote (`'`) before RFC 4180 quoting, neutralising it as
 * a spreadsheet formula. The guard is deliberately limited to string inputs:
 * `number`/`boolean` values are trusted producers (e.g. `String(-5)` → `"-5"`
 * starts with `-` but is a legitimate negative number, not attacker-controlled
 * text), so they are never prefixed.
 */
export function csvField(value: unknown): string {
  if (value === null || value === undefined) return '';
  const wasString = typeof value === 'string';
  let str =
    typeof value === 'object'
      ? JSON.stringify(value)
      : wasString
        ? (value as string)
        : String(value);
  // Only neutralise attacker-controllable string inputs; numbers/booleans are safe.
  if (wasString && str.length > 0 && CSV_INJECTION_PREFIXES.has(str[0] as string)) {
    str = `'${str}`;
  }
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Build a CSV document from a header row and an array of records. Columns are
 * driven by `columns`; each row reads the matching key from the record. Lines
 * are CRLF-terminated per RFC 4180 so the file opens cleanly in Excel, and the
 * document is prefixed with a UTF-8 BOM for correct accent rendering.
 */
export function toCsv<T extends Record<string, unknown>>(
  columns: readonly (keyof T & string)[],
  rows: readonly T[],
): string {
  const lines: string[] = [columns.map(csvField).join(',')];
  for (const row of rows) {
    lines.push(columns.map((col) => csvField(row[col])).join(','));
  }
  return `${UTF8_BOM}${lines.join('\r\n')}\r\n`;
}
