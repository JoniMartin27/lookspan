import type { SpanInput } from '@lookspan/types';
import { afterEach, describe, expect, it } from 'vitest';
import {
  computeCostUsd,
  enrichSpanCost,
  findPricing,
  getPricingTable,
  setPricingTable,
} from './pricing.js';

const defaultTable = getPricingTable();
afterEach(() => setPricingTable(defaultTable));

describe('findPricing', () => {
  it('matches a model by substring', () => {
    expect(findPricing('claude-opus-4-8')?.model).toBe('claude-opus-4');
  });

  it('prefers the longest matching key', () => {
    // both "gpt-4o" and "gpt-4o-mini" are substrings of the id below
    expect(findPricing('gpt-4o-mini-2026')?.model).toBe('gpt-4o-mini');
  });

  it('is case-insensitive', () => {
    expect(findPricing('Claude-Sonnet-4-6')?.model).toBe('claude-sonnet-4');
  });

  it('returns null for unknown or empty models', () => {
    expect(findPricing('llama-3-70b')).toBeNull();
    expect(findPricing(null)).toBeNull();
    expect(findPricing(undefined)).toBeNull();
  });
});

describe('computeCostUsd', () => {
  it('bills input + output at per-1M rates', () => {
    // claude-opus-4: $15 in / $75 out
    expect(
      computeCostUsd('claude-opus-4-8', {
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
        costUsd: 0,
      }),
    ).toBe(90);
  });

  it('bills cached input at the cached rate, separately from input', () => {
    // claude-opus-4: cached $1.5/1M → 2M cached = $3
    expect(
      computeCostUsd('claude-opus-4-8', {
        inputTokens: 0,
        outputTokens: 0,
        cachedInputTokens: 2_000_000,
        costUsd: 0,
      }),
    ).toBe(3);
  });

  it('returns null when the model is unknown', () => {
    expect(
      computeCostUsd('mystery-model', { inputTokens: 100, outputTokens: 100, costUsd: 0 }),
    ).toBeNull();
  });

  it('returns null when usage is missing', () => {
    expect(computeCostUsd('claude-opus-4-8', null)).toBeNull();
  });
});

function span(overrides: Partial<SpanInput> = {}): SpanInput {
  return {
    traceId: 'tr_1',
    spanId: 'sp_1',
    parentSpanId: null,
    type: 'llm_call',
    name: 'completion',
    startedAt: '2026-06-01T10:00:00Z',
    endedAt: null,
    status: 'ok',
    framework: 'custom',
    model: 'claude-opus-4-8',
    usage: { inputTokens: 1_000_000, outputTokens: 0, costUsd: 0 },
    ...overrides,
  };
}

describe('enrichSpanCost', () => {
  it('fills costUsd when usage has tokens but zero cost', () => {
    const s = enrichSpanCost(span());
    expect(s.usage?.costUsd).toBe(15);
  });

  it('preserves a non-zero client-supplied cost', () => {
    const s = enrichSpanCost(
      span({ usage: { inputTokens: 1_000_000, outputTokens: 0, costUsd: 999 } }),
    );
    expect(s.usage?.costUsd).toBe(999);
  });

  it('leaves spans without usage untouched', () => {
    const s = enrichSpanCost(span({ usage: null }));
    expect(s.usage).toBeNull();
  });

  it('leaves cost at 0 for an unknown model', () => {
    const s = enrichSpanCost(
      span({ model: 'llama-3', usage: { inputTokens: 1000, outputTokens: 1000, costUsd: 0 } }),
    );
    expect(s.usage?.costUsd).toBe(0);
  });

  it('honors an overridden pricing table', () => {
    setPricingTable([{ provider: 'x', model: 'foo', inputPer1M: 1000, outputPer1M: 0 }]);
    const s = enrichSpanCost(
      span({ model: 'foo-1', usage: { inputTokens: 1_000_000, outputTokens: 0, costUsd: 0 } }),
    );
    expect(s.usage?.costUsd).toBe(1000);
  });
});
