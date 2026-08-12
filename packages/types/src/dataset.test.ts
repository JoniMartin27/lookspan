/**
 * A dataset run stops at a cap. The dashboard said so only in the abstract —
 * "Runs up to 100 items synchronously", the same sentence whether the dataset
 * held five items or five hundred — so a 150-item run came back "100/100 ok"
 * and read as a clean sweep. Fifty items had never been evaluated, and they
 * are precisely the ones nobody would think to check.
 *
 * This is the export-truncation bug again, in the feature whose whole job is
 * telling you whether your agent still works.
 */
import { describe, expect, it } from 'vitest';
import { MAX_DATASET_RUN_ITEMS, runCoverage } from './dataset.js';

describe('runCoverage', () => {
  it('covers the whole dataset when it fits', () => {
    expect(runCoverage(1)).toEqual({ willRun: 1, skipped: 0, capped: false });
    expect(runCoverage(99)).toEqual({ willRun: 99, skipped: 0, capped: false });
  });

  it('is not capped exactly at the limit', () => {
    // Off-by-one here would warn on every full-size dataset and train people
    // to ignore the warning.
    expect(runCoverage(MAX_DATASET_RUN_ITEMS)).toEqual({
      willRun: MAX_DATASET_RUN_ITEMS,
      skipped: 0,
      capped: false,
    });
  });

  it('reports what a run leaves out', () => {
    expect(runCoverage(101)).toEqual({ willRun: 100, skipped: 1, capped: true });
    expect(runCoverage(150)).toEqual({ willRun: 100, skipped: 50, capped: true });
    expect(runCoverage(5_000)).toEqual({ willRun: 100, skipped: 4_900, capped: true });
  });

  it('willRun and skipped always account for every item', () => {
    for (const n of [0, 1, 7, 99, 100, 101, 250, 1_000]) {
      const c = runCoverage(n);
      expect(c.willRun + c.skipped, `${n} items`).toBe(n);
      expect(c.willRun, `${n} items`).toBeLessThanOrEqual(MAX_DATASET_RUN_ITEMS);
      expect(c.capped, `${n} items`).toBe(c.skipped > 0);
    }
  });

  it('treats an empty or nonsensical count as nothing to run', () => {
    for (const n of [0, -1, Number.NaN, Number.POSITIVE_INFINITY * 0]) {
      expect(runCoverage(n)).toEqual({ willRun: 0, skipped: 0, capped: false });
    }
  });

  it('honours a caller-supplied cap', () => {
    // The API passes its own constant; if the two ever drift, the server would
    // slice one number while the dashboard promised another.
    expect(runCoverage(10, 4)).toEqual({ willRun: 4, skipped: 6, capped: true });
  });

  it('an infinite count does not produce a negative skipped', () => {
    const c = runCoverage(Number.POSITIVE_INFINITY);
    expect(c.willRun).toBe(0);
    expect(c.skipped).toBe(0);
  });
});
