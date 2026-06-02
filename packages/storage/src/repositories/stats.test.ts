import type { Trace } from '@lookspan/types';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type LookspanDatabase, migrate, openDatabase } from '../index.js';
import { StatsRepository } from './stats.js';
import { TracesRepository } from './traces.js';

let db: LookspanDatabase;

beforeEach(() => {
  db = openDatabase({ path: ':memory:' });
  migrate(db);
});
afterEach(() => db.close());

function seed(overrides: Partial<Trace> & { traceId: string }): void {
  const t: Trace = {
    rootName: 'r',
    framework: 'custom',
    agentId: null,
    sessionId: null,
    startedAt: '2026-06-01T10:00:00Z',
    endedAt: '2026-06-01T10:00:01Z',
    durationMs: 100,
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
    ...overrides,
  };
  new TracesRepository(db).upsert(t);
}

describe('StatsRepository.summary', () => {
  it('returns zeros on an empty database', () => {
    const s = new StatsRepository(db).summary();
    expect(s.totalTraces).toBe(0);
    expect(s.errorRate).toBe(0);
    expect(s.latencyMs).toBeNull();
    expect(s.byDay).toEqual([]);
  });

  it('computes totals, error rate and cost', () => {
    seed({ traceId: 'a', status: 'ok', costUsd: 1 });
    seed({ traceId: 'b', status: 'ok', costUsd: 2 });
    seed({ traceId: 'c', status: 'error', costUsd: 3 });
    seed({ traceId: 'd', status: 'error', costUsd: 4 });

    const s = new StatsRepository(db).summary();
    expect(s.totalTraces).toBe(4);
    expect(s.errorTraces).toBe(2);
    expect(s.errorRate).toBe(0.5);
    expect(s.totalCostUsd).toBe(10);
  });

  it('computes latency percentiles', () => {
    for (let i = 1; i <= 100; i++) seed({ traceId: `p${i}`, durationMs: i });
    const s = new StatsRepository(db).summary();
    // 100 sorted values 1..100, offset = floor(p*99)
    expect(s.latencyMs?.p50).toBe(50);
    expect(s.latencyMs?.p95).toBe(95);
    expect(s.latencyMs?.p99).toBe(99);
  });

  it('ignores null durations in percentiles but still counts the trace', () => {
    seed({ traceId: 'open', durationMs: null });
    seed({ traceId: 'closed', durationMs: 42 });
    const s = new StatsRepository(db).summary();
    expect(s.totalTraces).toBe(2);
    expect(s.latencyMs).toEqual({ p50: 42, p95: 42, p99: 42 });
  });

  it('buckets traces and cost by day', () => {
    seed({ traceId: 'd1a', startedAt: '2026-06-01T08:00:00Z', costUsd: 1 });
    seed({ traceId: 'd1b', startedAt: '2026-06-01T20:00:00Z', costUsd: 2 });
    seed({ traceId: 'd2', startedAt: '2026-06-02T09:00:00Z', costUsd: 5 });

    const s = new StatsRepository(db).summary();
    expect(s.byDay).toEqual([
      { day: '2026-06-01', traces: 2, costUsd: 3 },
      { day: '2026-06-02', traces: 1, costUsd: 5 },
    ]);
  });

  it('filters by framework', () => {
    seed({ traceId: 'm', framework: 'mcp', costUsd: 1 });
    seed({ traceId: 'c', framework: 'custom', costUsd: 2 });
    const s = new StatsRepository(db).summary({ framework: 'mcp' });
    expect(s.totalTraces).toBe(1);
    expect(s.totalCostUsd).toBe(1);
  });
});
