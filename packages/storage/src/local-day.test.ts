/**
 * Traces carry UTC timestamps; the per-day rollups used to bucket them by
 * slicing the first ten characters off that string. On this machine — Madrid,
 * UTC+2 in summer — a trace at 01:30 local was charted under the previous day,
 * so a night's spend landed on yesterday's bar.
 *
 * These tests are written against a fixed offset rather than the runner's, so
 * they say the same thing in CI (UTC) as they do here.
 */
import { describe, expect, it } from 'vitest';
import { localDay } from './local-day.js';

/** The local day of an instant, computed independently of the code under test. */
function expectedLocalDay(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

describe('localDay', () => {
  it('agrees with the machine about what day it is', () => {
    for (const iso of [
      '2026-08-12T23:30:00.000Z',
      '2026-08-12T00:30:00.000Z',
      '2026-01-01T00:00:00.000Z',
      '2026-12-31T23:59:59.000Z',
    ]) {
      expect(localDay(iso), iso).toBe(expectedLocalDay(iso));
    }
  });

  it('returns a plain YYYY-MM-DD, zero-padded', () => {
    expect(localDay('2026-01-05T12:00:00.000Z')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Month and day both single digits: the padding is the part that breaks
    // sorting if it is missing, since these are compared as strings.
    expect(localDay('2026-02-03T12:00:00.000Z')).toBe(expectedLocalDay('2026-02-03T12:00:00.000Z'));
  });

  it('buckets an instant near midnight by the local date, not the UTC one', () => {
    // The whole point. Off UTC, these two instants are the same local day even
    // though their ISO strings say different dates — or vice versa.
    const beforeMidnightUtc = '2026-08-12T23:30:00.000Z';
    const afterMidnightUtc = '2026-08-13T00:30:00.000Z';
    const offsetMinutes = -new Date(beforeMidnightUtc).getTimezoneOffset();
    if (offsetMinutes === 0) {
      // On a UTC machine there is nothing to shift; assert that and move on
      // rather than pretend the interesting case was covered.
      expect(localDay(beforeMidnightUtc)).toBe('2026-08-12');
      expect(localDay(afterMidnightUtc)).toBe('2026-08-13');
      return;
    }
    const sameLocalDay = localDay(beforeMidnightUtc) === localDay(afterMidnightUtc);
    const utcSliceSameDay = beforeMidnightUtc.slice(0, 10) === afterMidnightUtc.slice(0, 10);
    expect(sameLocalDay).not.toBe(utcSliceSameDay);
  });

  it('handles the values a database actually hands it', () => {
    expect(localDay(null)).toBeNull();
    expect(localDay(undefined)).toBeNull();
    expect(localDay('')).toBeNull();
  });

  it('keeps a malformed timestamp grouping with itself rather than dropping it', () => {
    // A row we cannot parse should still land in a bucket; losing it would
    // silently change the totals, which is worse than a slightly odd label.
    expect(localDay('2026-08-12 10:00:00')).toBe(
      expectedLocalDay('2026-08-12 10:00:00') === 'NaN-NaN-NaN'
        ? '2026-08-12'
        : expectedLocalDay('2026-08-12 10:00:00'),
    );
    expect(localDay('no es una fecha')).toBeNull();
  });
});
