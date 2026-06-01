import type { Trace } from '@lookspan/types';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type LookspanDatabase, migrate, openDatabase } from './index.js';
import { SpansRepository } from './repositories/spans.js';
import { TracesRepository } from './repositories/traces.js';
import { cutoffFrom, parseDuration, pruneOlderThan, vacuum } from './retention.js';

describe('parseDuration', () => {
  it.each([
    ['7d', 7 * 86_400_000],
    ['24h', 24 * 3_600_000],
    ['30m', 30 * 60_000],
    ['1w', 604_800_000],
    ['500ms', 500],
    ['10 s', 10_000],
  ])('parses %s', (input, expected) => {
    expect(parseDuration(input)).toBe(expected);
  });

  it('returns null for garbage', () => {
    expect(parseDuration('soon')).toBeNull();
    expect(parseDuration('7x')).toBeNull();
    expect(parseDuration('')).toBeNull();
  });
});

describe('cutoffFrom', () => {
  it('subtracts the retention window from now', () => {
    const now = Date.parse('2026-06-08T00:00:00.000Z');
    expect(cutoffFrom(7 * 86_400_000, now)).toBe('2026-06-01T00:00:00.000Z');
  });
});

describe('pruneOlderThan', () => {
  let db: LookspanDatabase;
  beforeEach(() => {
    db = openDatabase({ path: ':memory:' });
    migrate(db);
  });
  afterEach(() => db.close());

  function seed(traceId: string, startedAt: string): void {
    const trace: Trace = {
      traceId,
      rootName: 'r',
      framework: 'custom',
      agentId: null,
      sessionId: null,
      startedAt,
      endedAt: startedAt,
      durationMs: 0,
      status: 'ok',
      spanCount: 1,
      errorCount: 0,
      totalUsage: {
        inputTokens: 0,
        outputTokens: 0,
        cachedInputTokens: 0,
        reasoningTokens: 0,
        costUsd: 0,
      },
      costUsd: 0,
      attributes: null,
    };
    new TracesRepository(db).upsert(trace);
    new SpansRepository(db).insert(
      {
        traceId,
        spanId: `${traceId}_s`,
        parentSpanId: null,
        type: 'custom',
        name: 'n',
        startedAt,
        endedAt: startedAt,
        status: 'ok',
        framework: 'custom',
      },
      startedAt,
    );
  }

  it('deletes only traces older than the cutoff and cascades to spans', () => {
    seed('old', '2026-01-01T00:00:00Z');
    seed('new', '2026-06-01T00:00:00Z');

    const res = pruneOlderThan(db, '2026-03-01T00:00:00Z');
    expect(res.deletedTraces).toBe(1);

    const traces = new TracesRepository(db).list();
    expect(traces.map((t) => t.traceId)).toEqual(['new']);
    // span of the deleted trace cascaded away
    expect(new SpansRepository(db).getById('old_s')).toBeNull();
    expect(new SpansRepository(db).getById('new_s')).not.toBeNull();
  });

  it('vacuum runs without error after a prune', () => {
    seed('old', '2026-01-01T00:00:00Z');
    pruneOlderThan(db, '2026-03-01T00:00:00Z');
    expect(() => vacuum(db)).not.toThrow();
  });
});
