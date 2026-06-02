import { HttpSpanExporter, newSpanId, newTraceId, type SpanExporter } from '@lookspan/mcp';
import type { SpanInput, SpanType } from '@lookspan/types';

export interface ObserveOptions {
  /** Ingest endpoint. Default: http://127.0.0.1:3100/api/ingest */
  endpoint?: string;
  /** Bring your own exporter (overrides `endpoint`). */
  exporter?: SpanExporter;
  /** Attribution shown in the dashboard. */
  agentId?: string;
  sessionId?: string;
  /** Provider label stored on the span. Default: "openai". */
  provider?: string;
}

// method path → span type. Covers the common OpenAI SDK surface.
const TRACED: Record<string, SpanType> = {
  'chat.completions.create': 'llm_call',
  'responses.create': 'llm_call',
  'embeddings.create': 'embedding',
};

// object paths we descend into to reach the traced methods above.
const NAMESPACES = new Set(['chat', 'chat.completions', 'responses', 'embeddings']);

interface Usage {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

function extractModel(args: unknown[], result: unknown): string | null {
  const fromResult = (result as { model?: unknown })?.model;
  if (typeof fromResult === 'string') return fromResult;
  const fromArgs = (args[0] as { model?: unknown } | undefined)?.model;
  return typeof fromArgs === 'string' ? fromArgs : null;
}

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

/**
 * Wrap an OpenAI client so every model call emits a Lookspan span — no other
 * code changes. Returns the same client type; calls behave identically.
 *
 *   import { observeOpenAI } from '@lookspan/openai';
 *   const openai = observeOpenAI(new OpenAI());
 *   await openai.chat.completions.create({ model: 'gpt-4o', messages });
 */
export function observeOpenAI<T extends object>(client: T, options: ObserveOptions = {}): T {
  const exporter =
    options.exporter ??
    new HttpSpanExporter({
      endpoint: options.endpoint ?? 'http://127.0.0.1:3100/api/ingest',
      source: '@lookspan/openai',
    });
  const provider = options.provider ?? 'openai';

  const traceCall = async (path: string, type: SpanType, fn: () => unknown, args: unknown[]) => {
    const startedAt = new Date().toISOString();
    const traceId = newTraceId();
    const spanId = newSpanId();
    let status: SpanInput['status'] = 'ok';
    let error: SpanInput['error'] = null;
    let result: unknown;
    try {
      result = await fn();
      return result;
    } catch (err) {
      status = 'error';
      error = { message: (err as Error)?.message ?? String(err) };
      throw err;
    } finally {
      const usage = status === 'ok' ? extractUsage(result) : null;
      const span: SpanInput = {
        traceId,
        spanId,
        parentSpanId: null,
        type,
        name: path,
        startedAt,
        endedAt: new Date().toISOString(),
        status,
        framework: 'custom',
        agentId: options.agentId ?? null,
        sessionId: options.sessionId ?? null,
        model: extractModel(args, result),
        provider,
        error,
        usage,
      };
      void exporter.send([span]).catch(() => {});
    }
  };

  const makeProxy = (target: object, prefix: string): object =>
    new Proxy(target, {
      get(obj, prop, receiver) {
        if (typeof prop !== 'string') return Reflect.get(obj, prop, receiver);
        const value = Reflect.get(obj, prop, receiver);
        const full = prefix ? `${prefix}.${prop}` : prop;

        if (typeof value === 'function') {
          if (TRACED[full]) {
            const type = TRACED[full];
            return (...args: unknown[]) =>
              traceCall(full, type, () => value.apply(obj, args), args);
          }
          return value.bind(obj);
        }
        if (value && typeof value === 'object' && NAMESPACES.has(full)) {
          return makeProxy(value, full);
        }
        return value;
      },
    });

  return makeProxy(client, '') as T;
}

export type { SpanExporter } from '@lookspan/mcp';
