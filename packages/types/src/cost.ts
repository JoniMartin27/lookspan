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
