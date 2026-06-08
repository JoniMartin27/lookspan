/**
 * Parity suite: run the real repositories against the Postgres driver and
 * assert identical behaviour to SQLite. This exercises the full schema,
 * every migration, and the SQL dialect translation against a genuine
 * Postgres engine (pg-mem) — no external server, runs in CI.
 */
import type { Span, Trace } from '@lookspan/types';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type LookspanDatabase, migrate, openDatabase } from '../index.js';
import { CostsRepository } from '../repositories/costs.js';
import { DatasetsRepository, RunsRepository } from '../repositories/datasets.js';
import { ReplaysRepository } from '../repositories/replays.js';
import { ScoresRepository } from '../repositories/scores.js';
import { SpansRepository } from '../repositories/spans.js';
import { StatsRepository } from '../repositories/stats.js';
import { TracesRepository } from '../repositories/traces.js';
import { isPostgresConnectionString } from './postgres.js';

const PG_URL = 'postgres://lookspan:lookspan@localhost:5432/lookspan_test';

let db: LookspanDatabase;

beforeEach(() => {
  db = openDatabase({ path: PG_URL });
  migrate(db);
});
afterEach(() => db.close());

function trace(overrides: Partial<Trace> = {}): Trace {
  return {
    traceId: 'tr_1',
    rootName: 'root',
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
    ...overrides,
  };
}

function span(overrides: Partial<Span> = {}): Span {
  return {
    traceId: 'tr_1',
    spanId: 'sp_1',
    parentSpanId: null,
    type: 'llm_call',
    name: 'completion',
    startedAt: '2026-06-01T10:00:00Z',
    endedAt: '2026-06-01T10:00:01Z',
    durationMs: 1000,
    status: 'ok',
    framework: 'custom',
    agentId: null,
    sessionId: null,
    model: 'gpt-4o',
    provider: 'openai',
    input: null,
    output: null,
    error: null,
    usage: {
      inputTokens: 10,
      outputTokens: 20,
      cachedInputTokens: 0,
      reasoningTokens: 0,
      costUsd: 1.5,
    },
    attributes: null,
    receivedAt: '2026-06-01T10:00:02Z',
    ...overrides,
  };
}

describe('connection string detection', () => {
  it('recognises postgres:// and postgresql:// only', () => {
    expect(isPostgresConnectionString('postgres://h/db')).toBe(true);
    expect(isPostgresConnectionString('postgresql://h/db')).toBe(true);
    expect(isPostgresConnectionString('/home/me/.lookspan/lookspan.db')).toBe(false);
    expect(isPostgresConnectionString(':memory:')).toBe(false);
  });
});

describe('migrations on Postgres', () => {
  it('reports a non-zero schema version after migrating', () => {
    expect(db.dialect).toBe('postgres');
    expect(db.pragma('user_version', { simple: true })).toBeGreaterThan(0);
  });

  it('is idempotent — re-running applies nothing', () => {
    const result = migrate(db);
    expect(result.applied).toEqual([]);
  });
});

describe('TracesRepository on Postgres', () => {
  it('upserts, lists ordered, filters and paginates', () => {
    const repo = new TracesRepository(db);
    repo.upsert(trace({ traceId: 'a', framework: 'mcp', startedAt: '2026-06-01T10:00:00Z' }));
    repo.upsert(
      trace({
        traceId: 'b',
        framework: 'langgraph',
        status: 'error',
        startedAt: '2026-06-01T11:00:00Z',
      }),
    );
    repo.upsert(
      trace({ traceId: 'c', framework: 'mcp', sessionId: 's1', startedAt: '2026-06-01T12:00:00Z' }),
    );

    expect(repo.list().map((t) => t.traceId)).toEqual(['c', 'b', 'a']);
    expect(
      repo
        .list({ framework: 'mcp' })
        .map((t) => t.traceId)
        .sort(),
    ).toEqual(['a', 'c']);
    expect(repo.list({ status: 'error' }).map((t) => t.traceId)).toEqual(['b']);
    expect(repo.list({ sessionId: 's1' }).map((t) => t.traceId)).toEqual(['c']);
    expect(repo.list({ cursor: '2026-06-01T12:00:00Z' }).map((t) => t.traceId)).toEqual(['b', 'a']);
  });

  it('upsert updates the existing row in place', () => {
    const repo = new TracesRepository(db);
    repo.upsert(trace({ traceId: 'u', costUsd: 1 }));
    repo.upsert(trace({ traceId: 'u', costUsd: 9, status: 'error' }));
    const got = repo.getById('u');
    expect(got?.costUsd).toBe(9);
    expect(got?.status).toBe('error');
  });

  it('deletes and counts since', () => {
    const repo = new TracesRepository(db);
    repo.upsert(trace({ traceId: 'old', startedAt: '2026-01-01T00:00:00Z' }));
    repo.upsert(trace({ traceId: 'new', startedAt: '2026-06-01T00:00:00Z' }));
    expect(repo.countSince('2026-03-01T00:00:00Z')).toBe(1);
    repo.delete('old');
    expect(repo.getById('old')).toBeNull();
  });

  it('aggregates sessions', () => {
    const repo = new TracesRepository(db);
    repo.upsert(
      trace({
        traceId: 's1a',
        sessionId: 'sess1',
        agentId: 'a1',
        costUsd: 1,
        startedAt: '2026-06-01T10:00:00Z',
      }),
    );
    repo.upsert(
      trace({
        traceId: 's1b',
        sessionId: 'sess1',
        agentId: 'a2',
        costUsd: 2,
        status: 'error',
        errorCount: 1,
        startedAt: '2026-06-01T10:05:00Z',
      }),
    );
    repo.upsert(trace({ traceId: 'nosess', sessionId: null }));

    const sessions = repo.listSessions();
    expect(sessions.map((s) => s.sessionId)).toEqual(['sess1']);
    expect(Number(sessions[0]?.traceCount)).toBe(2);
    expect(Number(sessions[0]?.agentCount)).toBe(2);
    expect(Number(sessions[0]?.totalCostUsd)).toBe(3);
    expect(repo.sessionSummary('missing')).toBeNull();
  });
});

describe('SpansRepository on Postgres', () => {
  it('round-trips a span, upserts on conflict, and lists tool calls', () => {
    new TracesRepository(db).upsert(trace());
    const repo = new SpansRepository(db);
    repo.insert(span(), '2026-06-01T10:00:02Z');
    const spans = repo.listByTrace('tr_1');
    expect(spans).toHaveLength(1);
    expect(spans[0]?.usage?.costUsd).toBe(1.5);
    expect(spans[0]?.model).toBe('gpt-4o');

    // conflict path updates the same row
    repo.insert(span({ status: 'error' }), '2026-06-01T10:00:03Z');
    expect(repo.listByTrace('tr_1')).toHaveLength(1);
    expect(repo.getById('sp_1')?.status).toBe('error');

    repo.insert(span({ spanId: 'tc', type: 'tool_call', name: 'search' }), 'now');
    expect(repo.listRecentToolCalls().map((s) => s.spanId)).toEqual(['tc']);
  });

  it('inserts many in a transaction', () => {
    new TracesRepository(db).upsert(trace());
    const repo = new SpansRepository(db);
    repo.insertMany([span({ spanId: 'm1' }), span({ spanId: 'm2' })], 'now');
    expect(repo.listByTrace('tr_1')).toHaveLength(2);
  });
});

describe('CostsRepository on Postgres', () => {
  it('breaks cost down by provider, model and agent', () => {
    new TracesRepository(db).upsert(trace());
    const repo = new SpansRepository(db);
    repo.insert(
      span({ spanId: 's1', agentId: 'a1', usage: { inputTokens: 0, outputTokens: 0, costUsd: 2 } }),
      'now',
    );
    repo.insert(
      span({ spanId: 's2', agentId: 'a1', usage: { inputTokens: 0, outputTokens: 0, costUsd: 3 } }),
      'now',
    );
    repo.insert(
      span({
        spanId: 's3',
        model: 'claude-opus-4-8',
        provider: 'anthropic',
        agentId: 'a2',
        usage: { inputTokens: 0, outputTokens: 0, costUsd: 5 },
      }),
      'now',
    );
    const s = new CostsRepository(db).summary();
    expect(s.total).toBe(10);
    expect(s.byProvider).toEqual({ openai: 5, anthropic: 5 });
    expect(s.byModel).toEqual({ 'gpt-4o': 5, 'claude-opus-4-8': 5 });
    expect(s.byAgent).toEqual({ a1: 5, a2: 5 });
  });
});

describe('StatsRepository on Postgres', () => {
  it('computes totals, percentiles and per-day buckets', () => {
    const repo = new TracesRepository(db);
    for (let i = 1; i <= 100; i++) repo.upsert(trace({ traceId: `p${i}`, durationMs: i }));
    const s = new StatsRepository(db).summary();
    expect(s.totalTraces).toBe(100);
    expect(s.latencyMs?.p50).toBe(50);
    expect(s.latencyMs?.p95).toBe(95);
    expect(s.latencyMs?.p99).toBe(99);

    repo.delete('p1');
    const byDay = new StatsRepository(db).summary().byDay;
    expect(byDay[0]?.day).toBe('2026-06-01');
  });
});

describe('ScoresRepository on Postgres', () => {
  it('inserts with a generated id, lists, averages and cascades', () => {
    new TracesRepository(db).upsert(trace({ traceId: 't1' }));
    new TracesRepository(db).upsert(trace({ traceId: 't2' }));
    const repo = new ScoresRepository(db);
    const score = repo.insert(
      { traceId: 't1', name: 'correctness', value: 1, source: 'llm-judge' },
      'now',
    );
    expect(score.id).toBeGreaterThan(0);
    repo.insert({ traceId: 't2', name: 'correctness', value: 0 }, 'now');
    expect(repo.listByTrace('t1')).toHaveLength(1);
    expect(repo.averages()).toEqual([{ name: 'correctness', avg: 0.5, count: 2 }]);

    new TracesRepository(db).delete('t1');
    expect(repo.listByTrace('t1')).toHaveLength(0);
  });
});

describe('ReplaysRepository on Postgres', () => {
  it('inserts and lists replays for a trace', () => {
    new TracesRepository(db).upsert(trace({ traceId: 'rt' }));
    const repo = new ReplaysRepository(db);
    const r = repo.insert(
      { traceId: 'rt', provider: 'openai', replayModel: 'gpt-4o-mini', status: 'ok', output: 'hi' },
      'now',
    );
    expect(r.id).toBeGreaterThan(0);
    expect(repo.listByTrace('rt')).toHaveLength(1);
  });
});

describe('Datasets / Runs on Postgres', () => {
  it('creates datasets, items, runs and run items end-to-end', () => {
    const datasets = new DatasetsRepository(db);
    datasets.create('ds1', 'My dataset', 'desc', 'now');
    datasets.addItems('ds1', [{ input: { q: 'a' }, expected: '1' }, { input: { q: 'b' } }], 'now');

    const got = datasets.get('ds1');
    expect(got?.itemCount).toBe(2);
    expect(datasets.listItems('ds1')).toHaveLength(2);
    // NOTE: DatasetsRepository.list() uses a correlated scalar subquery in the
    // projection (`(SELECT COUNT(*) ... WHERE i.dataset_id = d.id)`). Real
    // Postgres executes this fine, but the in-memory pg-mem engine used for
    // these CI tests cannot resolve the correlated outer alias. It is therefore
    // exercised against SQLite only (see repositories.test.ts) — see
    // docs/CONFIGURATION.md → "Postgres" for the in-memory engine's known gaps.

    const runs = new RunsRepository(db);
    const run = runs.create(
      {
        datasetId: 'ds1',
        model: 'gpt-4o',
        provider: 'openai',
        status: 'running',
        itemCount: 2,
        judgeMetric: null,
      },
      'now',
    );
    expect(run.id).toBeGreaterThan(0);
    runs.insertRunItem(
      {
        runId: run.id,
        itemId: 1,
        status: 'ok',
        output: 'ok',
        costUsd: 0.1,
        durationMs: 5,
        score: 1,
        rationale: null,
      },
      'now',
    );
    runs.finalize(run.id, {
      status: 'done',
      okCount: 1,
      errorCount: 0,
      totalCostUsd: 0.1,
      avgScore: 1,
    });

    expect(runs.get(run.id)?.status).toBe('done');
    expect(runs.listByDataset('ds1')).toHaveLength(1);
    expect(runs.listItems(run.id)).toHaveLength(1);

    // run_count reflected after the run exists
    expect(datasets.get('ds1')?.runCount).toBe(1);
  });
});
