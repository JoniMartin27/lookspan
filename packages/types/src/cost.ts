export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  reasoningTokens?: number;
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
}
