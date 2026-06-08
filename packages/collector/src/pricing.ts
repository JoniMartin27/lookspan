import type { ModelPricing, SpanInput, TokenUsage } from '@lookspan/types';

/**
 * Static pricing table — USD per 1M tokens. Snapshot of public list prices
 * (early 2026); treat the derived `cost_usd` as an estimate, not a bill.
 *
 * Matching is by case-insensitive substring of the span's `model`, longest
 * `model` key wins — so `claude-opus-4-8` matches `claude-opus-4` over a
 * shorter `claude` entry. Override the whole table with `setPricingTable()`.
 */
const DEFAULT_PRICING: ModelPricing[] = [
  // Anthropic
  {
    provider: 'anthropic',
    model: 'claude-opus-4',
    inputPer1M: 15,
    outputPer1M: 75,
    cachedInputPer1M: 1.5,
  },
  {
    provider: 'anthropic',
    model: 'claude-sonnet-4',
    inputPer1M: 3,
    outputPer1M: 15,
    cachedInputPer1M: 0.3,
  },
  {
    provider: 'anthropic',
    model: 'claude-haiku-4',
    inputPer1M: 1,
    outputPer1M: 5,
    cachedInputPer1M: 0.1,
  },
  {
    provider: 'anthropic',
    model: 'claude-3-5-sonnet',
    inputPer1M: 3,
    outputPer1M: 15,
    cachedInputPer1M: 0.3,
  },
  {
    provider: 'anthropic',
    model: 'claude-3-5-haiku',
    inputPer1M: 0.8,
    outputPer1M: 4,
    cachedInputPer1M: 0.08,
  },
  {
    provider: 'anthropic',
    model: 'claude-3-opus',
    inputPer1M: 15,
    outputPer1M: 75,
    cachedInputPer1M: 1.5,
  },
  {
    provider: 'anthropic',
    model: 'claude-3-haiku',
    inputPer1M: 0.25,
    outputPer1M: 1.25,
    cachedInputPer1M: 0.03,
  },
  // OpenAI
  {
    provider: 'openai',
    model: 'gpt-4o-mini',
    inputPer1M: 0.15,
    outputPer1M: 0.6,
    cachedInputPer1M: 0.075,
  },
  { provider: 'openai', model: 'gpt-4o', inputPer1M: 2.5, outputPer1M: 10, cachedInputPer1M: 1.25 },
  {
    provider: 'openai',
    model: 'gpt-4.1-mini',
    inputPer1M: 0.4,
    outputPer1M: 1.6,
    cachedInputPer1M: 0.1,
  },
  { provider: 'openai', model: 'gpt-4.1', inputPer1M: 2, outputPer1M: 8, cachedInputPer1M: 0.5 },
  { provider: 'openai', model: 'gpt-4-turbo', inputPer1M: 10, outputPer1M: 30 },
  {
    provider: 'openai',
    model: 'o3-mini',
    inputPer1M: 1.1,
    outputPer1M: 4.4,
    cachedInputPer1M: 0.55,
  },
  {
    provider: 'openai',
    model: 'o1-mini',
    inputPer1M: 1.1,
    outputPer1M: 4.4,
    cachedInputPer1M: 0.55,
  },
  { provider: 'openai', model: 'o1', inputPer1M: 15, outputPer1M: 60, cachedInputPer1M: 7.5 },
  // Google
  { provider: 'google', model: 'gemini-2.0-flash', inputPer1M: 0.1, outputPer1M: 0.4 },
  { provider: 'google', model: 'gemini-1.5-flash', inputPer1M: 0.075, outputPer1M: 0.3 },
  { provider: 'google', model: 'gemini-1.5-pro', inputPer1M: 1.25, outputPer1M: 5 },
];

let pricingTable: ModelPricing[] = DEFAULT_PRICING;

/** Replace the pricing table (e.g. to load a user-supplied price list). */
export function setPricingTable(table: ModelPricing[]): void {
  pricingTable = table;
}

/**
 * Validate and normalize a raw pricing list (e.g. parsed from a user JSON file).
 * Each entry needs at least `model`, `inputPer1M` and `outputPer1M`. Throws on
 * malformed input. Use to keep prices current without forking the code.
 */
export function parsePricingTable(raw: unknown): ModelPricing[] {
  if (!Array.isArray(raw)) throw new Error('pricing must be a JSON array');
  return raw.map((entry, i) => {
    const e = entry as Record<string, unknown>;
    if (typeof e.model !== 'string' || !e.model) {
      throw new Error(`pricing[${i}].model must be a non-empty string`);
    }
    if (typeof e.inputPer1M !== 'number' || typeof e.outputPer1M !== 'number') {
      throw new Error(`pricing[${i}] must have numeric inputPer1M and outputPer1M`);
    }
    return {
      provider: typeof e.provider === 'string' ? e.provider : 'unknown',
      model: e.model,
      inputPer1M: e.inputPer1M,
      outputPer1M: e.outputPer1M,
      ...(typeof e.cachedInputPer1M === 'number' ? { cachedInputPer1M: e.cachedInputPer1M } : {}),
      ...(typeof e.reasoningPer1M === 'number' ? { reasoningPer1M: e.reasoningPer1M } : {}),
    };
  });
}

/** The pricing table currently in effect. */
export function getPricingTable(): ModelPricing[] {
  return pricingTable;
}

/** Find the best price entry for a model id (longest substring match wins). */
export function findPricing(model: string | null | undefined): ModelPricing | null {
  if (!model) return null;
  const needle = model.toLowerCase();
  let best: ModelPricing | null = null;
  for (const entry of pricingTable) {
    // Lowercase both sides so a custom pricing table (loaded via --pricing)
    // with mixed-case model ids still matches.
    if (
      needle.includes(entry.model.toLowerCase()) &&
      (!best || entry.model.length > best.model.length)
    ) {
      best = entry;
    }
  }
  return best;
}

/**
 * Estimate the USD cost of a span from its token usage and the pricing table.
 * Returns null when the model is unknown.
 *
 * `cachedInputTokens` is treated as a **subset of `inputTokens`** (OpenAI
 * semantics, where `prompt_tokens` already includes cached tokens): the cached
 * portion is billed at the cached rate and the rest at the full input rate, so
 * cached tokens are never double-charged.
 *
 * `reasoningTokens` are treated as a **subset of `outputTokens`** (OpenAI
 * o-series semantics, where `completion_tokens` already includes reasoning
 * tokens). When the pricing entry carries an explicit `reasoningPer1M`, the
 * reasoning portion is billed at that rate and the remaining output at the
 * output rate — never double-charged. With no `reasoningPer1M`, reasoning stays
 * folded into output and is billed at the output rate (the prior behavior).
 */
export function computeCostUsd(
  model: string | null | undefined,
  usage: TokenUsage | null | undefined,
): number | null {
  if (!usage) return null;
  const pricing = findPricing(model);
  if (!pricing) return null;

  const input = usage.inputTokens ?? 0;
  const cached = usage.cachedInputTokens ?? 0;
  // Cached tokens may be reported inside inputTokens (OpenAI) or separately
  // (Anthropic); subtracting clamps both to "uncached input" without ever
  // double-charging the cached portion.
  const uncached = Math.max(0, input - cached);
  const output = usage.outputTokens ?? 0;
  const cachedRate = pricing.cachedInputPer1M ?? pricing.inputPer1M;

  // Reasoning tokens are a subset of output. Only split them out when the
  // pricing entry prices them explicitly; otherwise leave them billed as
  // output so the math is unchanged for models without a reasoning rate.
  const reasoning = pricing.reasoningPer1M !== undefined ? (usage.reasoningTokens ?? 0) : 0;
  const nonReasoningOutput = Math.max(0, output - reasoning);
  const reasoningCost =
    pricing.reasoningPer1M !== undefined ? reasoning * pricing.reasoningPer1M : 0;

  return (
    (uncached * pricing.inputPer1M +
      cached * cachedRate +
      nonReasoningOutput * pricing.outputPer1M +
      reasoningCost) /
    1_000_000
  );
}

/**
 * Fill in `usage.costUsd` from the pricing table when a span reports token
 * usage but no (or zero) cost. Caller-supplied non-zero costs are preserved.
 * Returns the same span instance (mutated) for convenience.
 */
export function enrichSpanCost(span: SpanInput): SpanInput {
  const usage = span.usage;
  if (!usage) return span;
  if (usage.costUsd && usage.costUsd > 0) return span;

  const computed = computeCostUsd(span.model, usage);
  if (computed !== null) usage.costUsd = computed;
  return span;
}
