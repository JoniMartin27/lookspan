import { type Alert, AlertCondition, type AlertRule, type Trace } from '@lookspan/types';

function totalTokens(trace: Trace): number {
  const u = trace.totalUsage;
  return u.inputTokens + u.outputTokens + (u.cachedInputTokens ?? 0) + (u.reasoningTokens ?? 0);
}

/**
 * Stateful rule evaluator. Each (traceId, ruleId) fires at most once for the
 * lifetime of the engine, so re-evaluating a trace as more spans stream in
 * does not re-alert. Designed to live for the process lifetime.
 */
export class AlertEngine {
  private readonly fired = new Set<string>();

  constructor(private readonly rules: AlertRule[]) {}

  get enabled(): boolean {
    return this.rules.length > 0;
  }

  /** Evaluate all rules against a trace, returning newly-triggered alerts. */
  evaluate(trace: Trace, now: string): Alert[] {
    const out: Alert[] = [];
    for (const rule of this.rules) {
      const key = `${trace.traceId}:${rule.id}`;
      if (this.fired.has(key)) continue;
      const alert = this.check(rule, trace, now);
      if (alert) {
        this.fired.add(key);
        out.push(alert);
      }
    }
    return out;
  }

  private check(rule: AlertRule, trace: Trace, now: string): Alert | null {
    const threshold = rule.threshold ?? null;
    const make = (value: number | null, message: string): Alert => ({
      ruleId: rule.id,
      traceId: trace.traceId,
      condition: rule.condition,
      message,
      value,
      threshold,
      createdAt: now,
    });

    switch (rule.condition) {
      case AlertCondition.Error:
        return trace.status === 'error' ? make(null, `Trace "${trace.rootName}" failed`) : null;
      case AlertCondition.CostOver: {
        if (threshold === null) return null;
        return trace.costUsd > threshold
          ? make(
              trace.costUsd,
              `Trace "${trace.rootName}" cost $${trace.costUsd.toFixed(4)} (> $${threshold})`,
            )
          : null;
      }
      case AlertCondition.TokensOver: {
        if (threshold === null) return null;
        const tokens = totalTokens(trace);
        return tokens > threshold
          ? make(tokens, `Trace "${trace.rootName}" used ${tokens} tokens (> ${threshold})`)
          : null;
      }
      case AlertCondition.DurationOver: {
        if (threshold === null || trace.durationMs === null) return null;
        return trace.durationMs > threshold
          ? make(
              trace.durationMs,
              `Trace "${trace.rootName}" took ${trace.durationMs}ms (> ${threshold}ms)`,
            )
          : null;
      }
      default:
        return null;
    }
  }
}
