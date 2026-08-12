/**
 * The calendar day a timestamp falls on, in the machine's own time zone.
 *
 * Traces are stored with UTC timestamps, and the per-day rollups used to bucket
 * them by slicing the first ten characters off that string — the UTC date. On a
 * machine at UTC+2 every trace between midnight and 02:00 local was counted
 * under the previous day, so "cost per day" quietly attributed a night's spend
 * to yesterday.
 *
 * Lookspan runs on the user's own machine, so the machine's day *is* their day.
 *
 * Registered as a SQL function in both drivers rather than written as dialect
 * SQL: SQLite's `datetime(…, 'localtime')` and Postgres' `to_char` are not the
 * same expression, and the repositories share one query. Doing the conversion
 * in JavaScript also gets DST and half-hour offsets right for free — `Date`
 * already knows about Kathmandu and the last Sunday in March.
 */
export const LOCAL_DAY_FN = 'lookspan_local_day';

export function localDay(timestamp: unknown): string | null {
  if (timestamp === null || timestamp === undefined) return null;
  const date = new Date(String(timestamp));
  if (Number.isNaN(date.getTime())) {
    // Not a timestamp we can read. Fall back to the leading date-looking part
    // so a malformed row still groups with itself instead of vanishing.
    const raw = String(timestamp);
    return /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : null;
  }
  // Local Y-M-D, zero-padded, without going through a locale format.
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
