import type { Trace } from '@lookspan/types';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type LookspanDatabase, migrate, openDatabase } from '../index.js';
import { ScoresRepository } from './scores.js';
import { TracesRepository } from './traces.js';

let db: LookspanDatabase;

beforeEach(() => {
  db = openDatabase({ path: ':memory:' });
  migrate(db);
});
afterEach(() => db.close());

function seedTrace(traceId: string): void {
  const t: Trace = {
    traceId,
    rootName: 'r',
    framework: 'custom',
    agentId: null,
    sessionId: null,
    startedAt: '2026-06-01T10:00:00Z',
    endedAt: '2026-06-01T10:00:01Z',
    durationMs: 1000,
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
  new TracesRepository(db).upsert(t);
}

describe('ScoresRepository', () => {
  it('inserts and lists scores for a trace', () => {
    seedTrace('t1');
    const repo = new ScoresRepository(db);
    repo.insert(
      { traceId: 't1', name: 'correctness', value: 1, comment: 'looks right', source: 'llm-judge' },
      'now',
    );
    repo.insert({ traceId: 't1', name: 'relevance', value: 0.8 }, 'now');

    const scores = repo.listByTrace('t1');
    expect(scores).toHaveLength(2);
    expect(scores[0]).toMatchObject({ name: 'correctness', value: 1, source: 'llm-judge' });
    expect(scores[1]).toMatchObject({ name: 'relevance', value: 0.8, comment: null });
  });

  it('cascades scores when the trace is deleted', () => {
    seedTrace('t1');
    new ScoresRepository(db).insert({ traceId: 't1', name: 'x', value: 1 }, 'now');
    new TracesRepository(db).delete('t1');
    expect(new ScoresRepository(db).listByTrace('t1')).toHaveLength(0);
  });

  it('averages values per name', () => {
    seedTrace('t1');
    seedTrace('t2');
    const repo = new ScoresRepository(db);
    repo.insert({ traceId: 't1', name: 'score', value: 1 }, 'now');
    repo.insert({ traceId: 't2', name: 'score', value: 0 }, 'now');
    expect(repo.averages()).toEqual([{ name: 'score', avg: 0.5, count: 2 }]);
  });
});
