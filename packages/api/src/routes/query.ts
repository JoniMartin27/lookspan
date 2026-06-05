/** Shared helpers for parsing untrusted query-string parameters. */

/**
 * Parse a `limit` query parameter into a positive integer, or `undefined`.
 *
 * Express query values are `string | string[] | undefined`. A naive
 * `Number(req.query.limit)` turns `"abc"` into `NaN`, which then propagates
 * into `Math.min(NaN, …)` and a `LIMIT NaN` bind — a 500 on malformed input.
 * This returns `undefined` for anything that isn't a finite positive number so
 * the repository falls back to its default.
 */
export function parseLimit(raw: unknown): number | undefined {
  if (typeof raw !== 'string' || raw === '') return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.floor(n);
}
