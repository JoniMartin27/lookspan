import { createSdkObserver, type SdkObserveOptions, type Usage } from '@lookspan/mcp';
import type { SpanType } from '@lookspan/types';

export type ObserveOptions = SdkObserveOptions;

const TRACED: Record<string, SpanType> = {
  'messages.create': 'llm_call',
};
const NAMESPACES = new Set(['messages']);

// Anthropic reports usage as { input_tokens, output_tokens }. On streams the
// input arrives in `message_start` and output in `message_delta`, so we merge
// across events (taking the max seen for each counter).
function readUsage(obj: unknown): Usage | null {
  const u =
    (obj as { usage?: Record<string, unknown> } | undefined)?.usage ??
    (obj as { message?: { usage?: Record<string, unknown> } } | undefined)?.message?.usage;
  if (!u || typeof u !== 'object') return null;
  const n = (k: string): number => (typeof u[k] === 'number' ? (u[k] as number) : 0);
  return { inputTokens: n('input_tokens'), outputTokens: n('output_tokens'), costUsd: 0 };
}

function mergeUsage(into: Usage | null, next: Usage | null): Usage | null {
  if (!next) return into;
  if (!into) return next;
  return {
    inputTokens: Math.max(into.inputTokens, next.inputTokens),
    outputTokens: Math.max(into.outputTokens, next.outputTokens),
    costUsd: 0,
  };
}

/** Join the text blocks of a (non-streaming) messages result into one string. */
function extractOutputText(result: unknown): string | null {
  const content = (result as { content?: unknown } | undefined)?.content;
  if (!Array.isArray(content)) return null;
  const text = content
    .filter(
      (b): b is { type: string; text: string } =>
        !!b &&
        typeof b === 'object' &&
        (b as { type?: unknown }).type === 'text' &&
        typeof (b as { text?: unknown }).text === 'string',
    )
    .map((b) => b.text)
    .join('');
  return text || null;
}

/** Text fragment from a single streaming event (content_block_delta). */
function chunkText(event: unknown): string {
  const e = event as { type?: unknown; delta?: { text?: unknown } } | undefined;
  if (e?.type === 'content_block_delta' && typeof e.delta?.text === 'string') return e.delta.text;
  return '';
}

/**
 * Wrap an Anthropic client so every `messages.create` (incl. streaming) emits a
 * Lookspan span. Returns the same client; calls behave identically.
 *
 *   import { observeAnthropic } from '@lookspan/anthropic';
 *   const anthropic = observeAnthropic(new Anthropic());
 *   await anthropic.messages.create({ model: 'claude-sonnet-4-6', messages, max_tokens: 1024 });
 */
export const observeAnthropic = createSdkObserver({
  source: '@lookspan/anthropic',
  defaultProvider: 'anthropic',
  traced: TRACED,
  namespaces: NAMESPACES,
  readUsage,
  mergeUsage,
  extractOutputText,
  chunkText,
});

export type { SpanExporter } from '@lookspan/mcp';
