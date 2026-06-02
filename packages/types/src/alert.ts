export const AlertCondition = {
  Error: 'error',
  CostOver: 'cost_over',
  TokensOver: 'tokens_over',
  DurationOver: 'duration_over',
} as const;

export type AlertCondition = (typeof AlertCondition)[keyof typeof AlertCondition];

export interface AlertRule {
  id: string;
  condition: AlertCondition;
  /** Threshold for cost_over (USD), tokens_over (tokens), duration_over (ms). Ignored by `error`. */
  threshold?: number;
}

export interface Alert {
  id?: number;
  ruleId: string;
  traceId: string;
  condition: AlertCondition;
  message: string;
  value: number | null;
  threshold: number | null;
  createdAt: string;
}
