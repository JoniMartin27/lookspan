/**
 * The cost breakdowns have to add up to the total they sit next to.
 *
 * They did not. Each one dropped rows where its dimension was NULL, and a
 * CrewAI span carries no `provider` at all — its adapter never sets one.
 * Measured against a running server: `total` said 0.021 and "By provider"
 * summed to 0.0135, so 36% of the bill was missing from the chart with nothing
 * on screen to say so.
 */
import type { Span } from '@lookspan/types';
import { UNATTRIBUTED } from '@lookspan/types';
import { beforeEach, describe, expect, it } from 'vitest';
import { type LookspanDatabase, migrate, openDatabase } from '../index.js';
import { CostsRepository } from './costs.js';
import { SpansRepository } from './spans.js';
import { TracesRepository } from './traces.js';

let db: LookspanDatabase;

function span(overrides: Partial<Span> = {}): Span {
  return {
    traceId: 'tr_1',
    spanId: `sp_${Math.random().toString(36).slice(2)}`,
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
    usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
    attributes: null,
    receivedAt: '2026-06-01T10:00:02Z',
    ...overrides,
  };
}

const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);

beforeEach(() => {
  db = openDatabase({ path: ':memory:' });
  migrate(db);
  new TracesRepository(db).upsert({
    traceId: 'tr_1',
    rootName: 'root',
    framework: 'custom',
    agentId: null,
    sessionId: null,
    startedAt: '2026-06-01T10:00:00Z',
    endedAt: '2026-06-01T10:00:01Z',
    durationMs: 1000,
    status: 'ok',
    spanCount: 0,
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
  });
});

describe('cost breakdowns add up to the total', () => {
  it('counts spend that has no provider — the CrewAI case', () => {
    const spans = new SpansRepository(db);
    spans.insert(
      span({ provider: 'openai', usage: { inputTokens: 0, outputTokens: 0, costUsd: 2 } }),
      'now',
    );
    // A CrewAI LLM span: model, tokens, cost — and no provider at all.
    spans.insert(
      span({
        framework: 'crewai',
        provider: null,
        usage: { inputTokens: 0, outputTokens: 0, costUsd: 1 },
      }),
      'now',
    );

    const c = new CostsRepository(db).summary();
    expect(c.total).toBe(3);
    expect(c.byProvider[UNATTRIBUTED]).toBe(1);
    expect(sum(c.byProvider)).toBe(c.total);
  });

  it('does the same for model and agent', () => {
    const spans = new SpansRepository(db);
    spans.insert(
      span({ agentId: 'a1', usage: { inputTokens: 0, outputTokens: 0, costUsd: 2 } }),
      'now',
    );
    spans.insert(
      span({ model: null, agentId: null, usage: { inputTokens: 0, outputTokens: 0, costUsd: 5 } }),
      'now',
    );

    const c = new CostsRepository(db).summary();
    expect(sum(c.byModel)).toBe(c.total);
    expect(sum(c.byAgent)).toBe(c.total);
    expect(c.byModel[UNATTRIBUTED]).toBe(5);
    expect(c.byAgent[UNATTRIBUTED]).toBe(5);
  });

  it('leaves the named buckets exactly as they were', () => {
    // Fixing the hole must not move money between labels.
    const spans = new SpansRepository(db);
    spans.insert(
      span({ provider: 'openai', usage: { inputTokens: 0, outputTokens: 0, costUsd: 2 } }),
      'now',
    );
    spans.insert(
      span({ provider: 'anthropic', usage: { inputTokens: 0, outputTokens: 0, costUsd: 3 } }),
      'now',
    );

    const c = new CostsRepository(db).summary();
    expect(c.byProvider).toEqual({ openai: 2, anthropic: 3 });
    expect(c.byProvider[UNATTRIBUTED]).toBeUndefined();
  });

  it('does not add an empty bucket when the unattributed spend is zero', () => {
    // Tool calls and chain steps have no provider and cost nothing. A zero bar
    // on every chart is noise that teaches people to ignore the label.
    const spans = new SpansRepository(db);
    spans.insert(
      span({ provider: 'openai', usage: { inputTokens: 0, outputTokens: 0, costUsd: 2 } }),
      'now',
    );
    spans.insert(span({ type: 'tool_call', model: null, provider: null }), 'now');

    const c = new CostsRepository(db).summary();
    expect(c.byProvider).toEqual({ openai: 2 });
    expect(Object.keys(c.byModel)).toEqual(['gpt-4o']);
  });

  it('holds when a filter narrows the query', () => {
    const spans = new SpansRepository(db);
    spans.insert(
      span({
        framework: 'crewai',
        provider: null,
        usage: { inputTokens: 0, outputTokens: 0, costUsd: 7 },
      }),
      'now',
    );
    spans.insert(
      span({
        framework: 'mcp',
        provider: 'openai',
        usage: { inputTokens: 0, outputTokens: 0, costUsd: 4 },
      }),
      'now',
    );

    const c = new CostsRepository(db).summary({ framework: 'crewai' });
    expect(c.total).toBe(7);
    expect(sum(c.byProvider)).toBe(7);
    expect(c.byProvider[UNATTRIBUTED]).toBe(7);
  });
});
