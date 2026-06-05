import { createSdkObserver, type SdkObserveOptions, type Usage } from '@lookspan/mcp';
import type { SpanType } from '@lookspan/types';

export type ObserveOptions = SdkObserveOptions;

// method path → span type. Covers the common OpenAI SDK surface.
const TRACED: Record<string, SpanType> = {
  'chat.completions.create': 'llm_call',
  'responses.create': 'llm_call',
  'embeddings.create': 'embedding',
};

// object paths we descend into to reach the traced methods above.
const NAMESPACES = new Set(['chat', 'chat.completions', 'responses', 'embeddings']);

function extractUsage(result: unknown): Usage | null {
  const u = (result as { usage?: Record<string, unknown> } | undefined)?.usage;
  if (!u || typeof u !== 'object') return null;
  const num = (...keys: string[]): number => {
    for (const k of keys) {
      const v = u[k];
      if (typeof v === 'number') return v;
    }
    return 0;
  };
  return {
    inputTokens: num('prompt_tokens', 'input_tokens'),
    outputTokens: num('completion_tokens', 'output_tokens'),
    costUsd: 0, // computed server-side from the model
  };
}

// OpenAI sends usage once, in the final stream chunk (with include_usage), so
// we keep the latest reading that actually carries token counts.
function mergeUsage(into: Usage | null, next: Usage | null): Usage | null {
  if (next && (next.inputTokens > 0 || next.outputTokens > 0)) return next;
  return into;
}

/** Pull the assistant's reply text out of a (non-streaming) completion result. */
function extractOutputText(result: unknown): string | null {
  const r = result as {
    choices?: { message?: { content?: unknown } }[];
    output_text?: unknown;
  } | null;
  const content = r?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (typeof r?.output_text === 'string') return r.output_text; // responses API
  return null;
}

/** Text fragment from a single streaming chunk (chat.completions delta). */
function chunkText(chunk: unknown): string {
  const delta = (chunk as { choices?: { delta?: { content?: unknown } }[] } | undefined)
    ?.choices?.[0]?.delta?.content;
  return typeof delta === 'string' ? delta : '';
}

/**
 * Wrap an OpenAI client so every model call emits a Lookspan span — no other
 * code changes. Returns the same client type; calls behave identically.
 *
 *   import { observeOpenAI } from '@lookspan/openai';
 *   const openai = observeOpenAI(new OpenAI());
 *   await openai.chat.completions.create({ model: 'gpt-4o', messages });
 */
export const observeOpenAI = createSdkObserver({
  source: '@lookspan/openai',
  defaultProvider: 'openai',
  traced: TRACED,
  namespaces: NAMESPACES,
  readUsage: extractUsage,
  mergeUsage,
  extractOutputText,
  chunkText,
});

export type { SpanExporter } from '@lookspan/mcp';
