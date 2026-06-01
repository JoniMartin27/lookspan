import type { Span, Trace } from '@lookspan/types';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type LookspanDatabase, migrate, openDatabase } from '../index.js';
import { CostsRepository } from './costs.js';
import { SpansRepository } from './spans.js';
import { TracesRepository } from './traces.js';

let db: LookspanDatabase;

beforeEach(() => {
  db = openDatabase({ path: ':memory:' });
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

describe('TracesRepository.list', () => {
  beforeEach(() => {
    const repo = new TracesRepository(db);
    repo.upsert(
      trace({ traceId: 'tr_a', framework: 'mcp', status: 'ok', startedAt: '2026-06-01T10:00:00Z' }),
    );
    repo.upsert(
      trace({
        traceId: 'tr_b',
        framework: 'langgraph',
        status: 'error',
        startedAt: '2026-06-01T11:00:00Z',
      }),
    );
    repo.upsert(
      trace({
        traceId: 'tr_c',
        framework: 'mcp',
        status: 'ok',
        sessionId: 's1',
        startedAt: '2026-06-01T12:00:00Z',
      }),
    );
  });

  it('orders by startedAt descending', () => {
    const ids = new TracesRepository(db).list().map((t) => t.traceId);
    expect(ids).toEqual(['tr_c', 'tr_b', 'tr_a']);
  });

  it('filters by framework', () => {
    const ids = new TracesRepository(db).list({ framework: 'mcp' }).map((t) => t.traceId);
    expect(ids.sort()).toEqual(['tr_a', 'tr_c']);
  });

  it('filters by status', () => {
    const ids = new TracesRepository(db).list({ status: 'error' }).map((t) => t.traceId);
    expect(ids).toEqual(['tr_b']);
  });

  it('filters by sessionId', () => {
    const ids = new TracesRepository(db).list({ sessionId: 's1' }).map((t) => t.traceId);
    expect(ids).toEqual(['tr_c']);
  });

  it('clamps the limit to 500', () => {
    expect(() => new TracesRepository(db).list({ limit: 99999 })).not.toThrow();
  });

  it('supports cursor pagination', () => {
    const ids = new TracesRepository(db)
      .list({ cursor: '2026-06-01T12:00:00Z' })
      .map((t) => t.traceId);
    expect(ids).toEqual(['tr_b', 'tr_a']);
  });
});

describe('TracesRepository delete / countSince', () => {
  it('deletes a trace by id', () => {
    const repo = new TracesRepository(db);
    repo.upsert(trace({ traceId: 'tr_x' }));
    repo.delete('tr_x');
    expect(repo.getById('tr_x')).toBeNull();
  });

  it('counts traces started since a timestamp', () => {
    const repo = new TracesRepository(db);
    repo.upsert(trace({ traceId: 'old', startedAt: '2026-01-01T00:00:00Z' }));
    repo.upsert(trace({ traceId: 'new', startedAt: '2026-06-01T00:00:00Z' }));
    expect(repo.countSince('2026-03-01T00:00:00Z')).toBe(1);
  });
});

describe('SpansRepository', () => {
  it('round-trips a span and lists it by trace', () => {
    new TracesRepository(db).upsert(trace());
    new SpansRepository(db).insert(span(), '2026-06-01T10:00:02Z');
    const spans = new SpansRepository(db).listByTrace('tr_1');
    expect(spans).toHaveLength(1);
    expect(spans[0].usage?.costUsd).toBe(1.5);
    expect(spans[0].model).toBe('gpt-4o');
  });
});

describe('CostsRepository.summary', () => {
  beforeEach(() => {
    new TracesRepository(db).upsert(trace());
    const repo = new SpansRepository(db);
    repo.insert(
      span({
        spanId: 's1',
        model: 'gpt-4o',
        provider: 'openai',
        agentId: 'a1',
        usage: { inputTokens: 0, outputTokens: 0, costUsd: 2 },
      }),
      'now',
    );
    repo.insert(
      span({
        spanId: 's2',
        model: 'gpt-4o',
        provider: 'openai',
        agentId: 'a1',
        usage: { inputTokens: 0, outputTokens: 0, costUsd: 3 },
      }),
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
  });

  it('totals cost and breaks it down by provider, model and agent', () => {
    const s = new CostsRepository(db).summary();
    expect(s.total).toBe(10);
    expect(s.byProvider).toEqual({ openai: 5, anthropic: 5 });
    expect(s.byModel).toEqual({ 'gpt-4o': 5, 'claude-opus-4-8': 5 });
    expect(s.byAgent).toEqual({ a1: 5, a2: 5 });
  });
});
