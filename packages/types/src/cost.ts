export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  reasoningTokens?: number;
  /**
   * USD attributable to this span's reasoning tokens — a subset of `costUsd`,
   * priced at the model's reasoning rate when it has one, else the output rate.
   * Surfaced so the reasoning premium is legible per span, not just blended.
   */
  reasoningCostUsd?: number;
  costUsd: number;
}

export interface ModelPricing {
  provider: string;
  model: string;
  inputPer1M: number;
  outputPer1M: number;
  cachedInputPer1M?: number;
  reasoningPer1M?: number;
}

export interface CostBreakdown {
  total: number;
  byProvider: Record<string, number>;
  byModel: Record<string, number>;
  byAgent: Record<string, number>;
  /**
   * Total USD attributable to reasoning tokens across the matched spans — a
   * sub-component of `total`, not an extra charge.
   */
  reasoning: number;
  /**
   * Reasoning cost broken down by model — the routing dimension, so the
   * "use a smarter model on harder requests" premium is visible per request
   * type instead of only in aggregate.
   */
  reasoningByModel: Record<string, number>;
}

/**
 * Bucket for spend that carries no provider, model or agent.
 *
 * The cost breakdowns used to drop those rows with `IS NOT NULL`, so the
 * charts quietly failed to add up to the total they sat next to: a CrewAI
 * trace has no `provider` at all, and 36% of a measured bill went missing from
 * "By provider" without a mark. Money that is not attributable is still money.
 *
 * The same string the session view already uses for agents, so a reader meets
 * one label rather than two.
 */
export const UNATTRIBUTED = '(unattributed)';
