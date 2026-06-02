import { AlertCondition, type AlertRule, type Trace } from '@lookspan/types';
import { describe, expect, it } from 'vitest';
import { AlertEngine } from './alerts.js';

const NOW = '2026-06-01T10:00:00.000Z';

function trace(overrides: Partial<Trace> = {}): Trace {
  return {
    traceId: 'tr_1',
    rootName: 'agent.run',
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
      inputTokens: 100,
      outputTokens: 50,
      cachedInputTokens: 0,
      reasoningTokens: 0,
      costUsd: 0,
    },
    costUsd: 0,
    attributes: null,
    ...overrides,
  };
}

describe('AlertEngine', () => {
  it('is disabled with no rules', () => {
    expect(new AlertEngine([]).enabled).toBe(false);
  });

  it('fires on a failed trace', () => {
    const engine = new AlertEngine([{ id: 'e', condition: AlertCondition.Error }]);
    expect(engine.evaluate(trace({ status: 'ok' }), NOW)).toHaveLength(0);
    const alerts = engine.evaluate(trace({ traceId: 'x', status: 'error' }), NOW);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ ruleId: 'e', condition: 'error', value: null });
  });

  it('fires when cost exceeds threshold', () => {
    const engine = new AlertEngine([
      { id: 'c', condition: AlertCondition.CostOver, threshold: 0.5 },
    ]);
    expect(engine.evaluate(trace({ costUsd: 0.4 }), NOW)).toHaveLength(0);
    const alerts = engine.evaluate(trace({ traceId: 'y', costUsd: 0.6 }), NOW);
    expect(alerts[0]).toMatchObject({ condition: 'cost_over', value: 0.6, threshold: 0.5 });
  });

  it('fires when total tokens exceed threshold', () => {
    const engine = new AlertEngine([
      { id: 't', condition: AlertCondition.TokensOver, threshold: 100 },
    ]);
    const alerts = engine.evaluate(
      trace({
        totalUsage: {
          inputTokens: 80,
          outputTokens: 80,
          cachedInputTokens: 0,
          reasoningTokens: 0,
          costUsd: 0,
        },
      }),
      NOW,
    );
    expect(alerts[0]).toMatchObject({ condition: 'tokens_over', value: 160, threshold: 100 });
  });

  it('fires when duration exceeds threshold, ignoring open traces', () => {
    const engine = new AlertEngine([
      { id: 'd', condition: AlertCondition.DurationOver, threshold: 500 },
    ]);
    expect(engine.evaluate(trace({ durationMs: null }), NOW)).toHaveLength(0);
    const alerts = engine.evaluate(trace({ traceId: 'z', durationMs: 900 }), NOW);
    expect(alerts[0]).toMatchObject({ condition: 'duration_over', value: 900, threshold: 500 });
  });

  it('fires each (trace, rule) only once', () => {
    const engine = new AlertEngine([{ id: 'e', condition: AlertCondition.Error }]);
    const t = trace({ status: 'error' });
    expect(engine.evaluate(t, NOW)).toHaveLength(1);
    expect(engine.evaluate(t, NOW)).toHaveLength(0); // already fired
  });

  it('evaluates multiple rules independently', () => {
    const rules: AlertRule[] = [
      { id: 'e', condition: AlertCondition.Error },
      { id: 'c', condition: AlertCondition.CostOver, threshold: 1 },
    ];
    const alerts = new AlertEngine(rules).evaluate(trace({ status: 'error', costUsd: 2 }), NOW);
    expect(alerts.map((a) => a.ruleId).sort()).toEqual(['c', 'e']);
  });
});
