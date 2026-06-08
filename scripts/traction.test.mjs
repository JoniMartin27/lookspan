import { describe, expect, it } from 'vitest';
import {
  buildSnapshot,
  computeDelta,
  findPreviousSnapshotName,
  formatReport,
  normalizeDate,
  parseRepo,
  pickNpmForDate,
  pickTrafficForDate,
  resolveDate,
} from './traction.mjs';

describe('normalizeDate', () => {
  it('accepts a valid date', () => {
    expect(normalizeDate('2026-06-08')).toBe('2026-06-08');
  });
  it('rejects bad format', () => {
    expect(() => normalizeDate('2026-6-8')).toThrow(/invalid date/);
    expect(() => normalizeDate('not-a-date')).toThrow(/invalid date/);
    expect(() => normalizeDate(undefined)).toThrow(/invalid date/);
  });
  it('rejects impossible calendar dates', () => {
    expect(() => normalizeDate('2026-13-40')).toThrow(/invalid calendar date/);
    expect(() => normalizeDate('2026-02-30')).toThrow(/invalid calendar date/);
  });
});

describe('resolveDate', () => {
  it('prefers the arg date', () => {
    expect(resolveDate({ argDate: '2026-01-02', envDate: '2026-03-04' })).toBe('2026-01-02');
  });
  it('falls back to env', () => {
    expect(resolveDate({ envDate: '2026-03-04' })).toBe('2026-03-04');
  });
  it('uses the injected clock as last resort (no system clock in logic)', () => {
    const now = new Date(Date.UTC(2026, 5, 8, 23, 59, 59));
    expect(resolveDate({ now })).toBe('2026-06-08');
  });
  it('validates arg/env dates', () => {
    expect(() => resolveDate({ argDate: 'garbage' })).toThrow(/invalid date/);
  });
});

describe('parseRepo', () => {
  it('maps counts and uses subscribers_count for watchers', () => {
    const json = {
      stargazers_count: 12,
      subscribers_count: 3,
      watchers_count: 12, // stars alias — must NOT be used as watchers
      forks_count: 4,
    };
    expect(parseRepo(json)).toEqual({ stars: 12, watchers: 3, forks: 4 });
  });
  it('accepts a JSON string and defaults missing fields to 0', () => {
    expect(parseRepo('{}')).toEqual({ stars: 0, watchers: 0, forks: 0 });
  });
});

describe('pickTrafficForDate', () => {
  const views = {
    count: 115,
    uniques: 87,
    views: [
      { timestamp: '2026-06-07T00:00:00Z', count: 3, uniques: 2 },
      { timestamp: '2026-06-08T00:00:00Z', count: 10, uniques: 6 },
    ],
  };
  it('extracts the matching day from a views payload', () => {
    expect(pickTrafficForDate(views, '2026-06-08')).toEqual({ count: 10, uniques: 6 });
  });
  it('handles clones payloads too', () => {
    const clones = { clones: [{ timestamp: '2026-06-08T00:00:00Z', count: 5, uniques: 4 }] };
    expect(pickTrafficForDate(clones, '2026-06-08')).toEqual({ count: 5, uniques: 4 });
  });
  it('returns null when the date is outside the window', () => {
    expect(pickTrafficForDate(views, '2026-05-01')).toBeNull();
  });
});

describe('pickNpmForDate', () => {
  const range = {
    downloads: [
      { downloads: 0, day: '2026-06-07' },
      { downloads: 365, day: '2026-06-08' },
    ],
  };
  it('extracts the matching day', () => {
    expect(pickNpmForDate(range, '2026-06-08')).toBe(365);
  });
  it('returns 0 for a missing day', () => {
    expect(pickNpmForDate(range, '2026-06-01')).toBe(0);
  });
  it('returns 0 for an empty payload', () => {
    expect(pickNpmForDate({}, '2026-06-08')).toBe(0);
  });
});

describe('buildSnapshot', () => {
  it('keeps the CLI download separate from the SDK total', () => {
    const snap = buildSnapshot({
      date: '2026-06-08',
      repo: { stars: 2, watchers: 1, forks: 0 },
      views: { count: 10, uniques: 6 },
      clones: { count: 5, uniques: 4 },
      cliDownloads: 365,
      sdkDownloads: { '@lookspan/openai': 4, '@lookspan/mcp': 6 },
    });
    expect(snap.npm.cli).toBe(365);
    expect(snap.npm.sdkTotal).toBe(10);
    expect(snap.traffic.uniqueViews).toBe(6);
    expect(snap.traffic.uniqueClones).toBe(4);
  });
  it('degrades traffic to null when not available', () => {
    const snap = buildSnapshot({
      date: '2026-06-08',
      repo: { stars: 2, watchers: 1, forks: 0 },
      views: null,
      clones: null,
      cliDownloads: 0,
      sdkDownloads: {},
    });
    expect(snap.traffic.uniqueViews).toBeNull();
    expect(snap.traffic.uniqueClones).toBeNull();
    expect(snap.npm.sdkTotal).toBe(0);
  });
});

describe('computeDelta', () => {
  const curr = buildSnapshot({
    date: '2026-06-08',
    repo: { stars: 5, watchers: 2, forks: 1 },
    views: { count: 10, uniques: 6 },
    clones: { count: 5, uniques: 4 },
    cliDownloads: 400,
    sdkDownloads: { a: 10 },
  });
  it('subtracts prev from curr for each leaf', () => {
    const prev = buildSnapshot({
      date: '2026-06-07',
      repo: { stars: 2, watchers: 1, forks: 0 },
      views: { count: 3, uniques: 2 },
      clones: { count: 1, uniques: 1 },
      cliDownloads: 365,
      sdkDownloads: { a: 4 },
    });
    expect(computeDelta(prev, curr)).toEqual({
      stars: 3,
      watchers: 1,
      forks: 1,
      uniqueViews: 4,
      uniqueClones: 3,
      cliDownloads: 35,
      sdkDownloads: 6,
    });
  });
  it('returns null deltas when there is no previous snapshot', () => {
    const d = computeDelta(null, curr);
    expect(d.stars).toBeNull();
    expect(d.cliDownloads).toBeNull();
  });
  it('returns null for a leaf the previous snapshot lacked (null traffic)', () => {
    const prev = buildSnapshot({
      date: '2026-06-07',
      repo: { stars: 2, watchers: 1, forks: 0 },
      views: null,
      clones: null,
      cliDownloads: 365,
      sdkDownloads: { a: 4 },
    });
    const d = computeDelta(prev, curr);
    expect(d.uniqueViews).toBeNull();
    expect(d.stars).toBe(3);
  });
});

describe('findPreviousSnapshotName', () => {
  it('returns the latest snapshot strictly before the date', () => {
    const files = ['2026-06-05.json', '2026-06-07.json', '2026-06-08.json', 'README.md'];
    expect(findPreviousSnapshotName(files, '2026-06-08')).toBe('2026-06-07.json');
  });
  it('returns null when nothing precedes the date', () => {
    expect(findPreviousSnapshotName(['2026-06-08.json'], '2026-06-08')).toBeNull();
    expect(findPreviousSnapshotName([], '2026-06-08')).toBeNull();
  });
});

describe('formatReport', () => {
  it('renders signed deltas and a baseline note', () => {
    const snap = buildSnapshot({
      date: '2026-06-08',
      repo: { stars: 2, watchers: 1, forks: 0 },
      views: { count: 10, uniques: 6 },
      clones: { count: 5, uniques: 4 },
      cliDownloads: 365,
      sdkDownloads: { a: 10 },
    });
    const baseline = formatReport(snap, computeDelta(null, snap), null);
    expect(baseline).toContain('no previous snapshot');
    expect(baseline).toContain('npm CLI dls   365');

    const delta = computeDelta(
      buildSnapshot({
        date: '2026-06-07',
        repo: { stars: 2, watchers: 1, forks: 0 },
        views: { count: 3, uniques: 2 },
        clones: { count: 1, uniques: 1 },
        cliDownloads: 300,
        sdkDownloads: { a: 4 },
      }),
      snap,
    );
    const report = formatReport(snap, delta, '2026-06-07');
    expect(report).toContain('delta vs 2026-06-07');
    expect(report).toContain('(+65)'); // CLI delta 365-300
  });
});
