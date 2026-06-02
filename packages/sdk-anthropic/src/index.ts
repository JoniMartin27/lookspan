import { HttpSpanExporter, newSpanId, newTraceId, type SpanExporter } from '@lookspan/mcp';
import type { SpanInput, SpanType } from '@lookspan/types';

export interface ObserveOptions {
  /** Ingest endpoint. Default: http://127.0.0.1:3100/api/ingest */
  endpoint?: string;
  /** Bring your own exporter (overrides `endpoint`). */
  exporter?: SpanExporter;
  agentId?: string;
  sessionId?: string;
  /** Provider label stored on the span. Default: "anthropic". */
  provider?: string;
}

const TRACED: Record<string, SpanType> = {
  'messages.create': 'llm_call',
};
const NAMESPACES = new Set(['messages']);

interface Usage {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

function errMsg(err: unknown): string {
  return (err as Error)?.message ?? String(err);
}

function extractModel(args: unknown[], result: unknown): string | null {
  const fromResult = (result as { model?: unknown })?.model;
  if (typeof fromResult === 'string') return fromResult;
  const fromArgs = (args[0] as { model?: unknown } | undefined)?.model;
  return typeof fromArgs === 'string' ? fromArgs : null;
}

// Anthropic reports usage as { input_tokens, output_tokens }. On streams the
// input arrives in `message_start` and output in `message_delta`, so callers
// merge across events (see mergeUsage).
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

/**
 * Wrap an Anthropic client so every `messages.create` (incl. streaming) emits a
 * Lookspan span. Returns the same client; calls behave identically.
 *
 *   import { observeAnthropic } from '@lookspan/anthropic';
 *   const anthropic = observeAnthropic(new Anthropic());
 *   await anthropic.messages.create({ model: 'claude-sonnet-4-6', messages, max_tokens: 1024 });
 */
export function observeAnthropic<T extends object>(client: T, options: ObserveOptions = {}): T {
  const exporter =
    options.exporter ??
    new HttpSpanExporter({
      endpoint: options.endpoint ?? 'http://127.0.0.1:3100/api/ingest',
      source: '@lookspan/anthropic',
    });
  const provider = options.provider ?? 'anthropic';

  const emitSpan = (
    path: string,
    type: SpanType,
    args: unknown[],
    startedAt: string,
    status: SpanInput['status'],
    error: SpanInput['error'],
    result: unknown,
    usage: SpanInput['usage'],
  ) => {
    const span: SpanInput = {
      traceId: newTraceId(),
      spanId: newSpanId(),
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
  };

  const traceCall = async (path: string, type: SpanType, fn: () => unknown, args: unknown[]) => {
    const startedAt = new Date().toISOString();
    let result: unknown;
    try {
      result = await fn();
    } catch (err) {
      emitSpan(path, type, args, startedAt, 'error', { message: errMsg(err) }, undefined, null);
      throw err;
    }

    const streaming = (args[0] as { stream?: unknown } | undefined)?.stream === true;
    const iterable = result as { [Symbol.asyncIterator]?: () => AsyncIterator<unknown> } | null;
    const origMethod = iterable?.[Symbol.asyncIterator];
    if (streaming && iterable && typeof origMethod === 'function') {
      const getIter = origMethod.bind(iterable);
      iterable[Symbol.asyncIterator] = async function* wrapped(): AsyncGenerator<unknown> {
        const it = getIter();
        let usage: Usage | null = null;
        try {
          while (true) {
            const next = await it.next();
            if (next.done) break;
            usage = mergeUsage(usage, readUsage(next.value));
            yield next.value;
          }
          emitSpan(path, type, args, startedAt, 'ok', null, result, usage);
        } catch (err) {
          emitSpan(path, type, args, startedAt, 'error', { message: errMsg(err) }, result, usage);
          throw err;
        }
      };
      return result;
    }

    emitSpan(path, type, args, startedAt, 'ok', null, result, readUsage(result));
    return result;
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
