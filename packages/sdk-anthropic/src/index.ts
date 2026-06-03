import { HttpSpanExporter, newSpanId, newTraceId, type SpanExporter } from '@lookspan/mcp';
import type { SpanInput, SpanType } from '@lookspan/types';

export interface ObserveOptions {
  /** Ingest endpoint. Default: http://127.0.0.1:3100/api/ingest */
  endpoint?: string;
  /** Bring your own exporter (overrides `endpoint`). */
  exporter?: SpanExporter;
  agentId?: string;
  sessionId?: string;
  /** Link this client's traces to a spawning trace (cross-agent handoff). */
  parentTraceId?: string;
  /** Provider label stored on the span. Default: "anthropic". */
  provider?: string;
  /**
   * Capture the request params (messages/model) in the span's `input` and the
   * model's reply text in `output`. Enables Replay & LLM-as-judge in the
   * dashboard. Secrets are scrubbed server-side before storage. Default: true.
   * Set false to keep prompts/outputs out of Lookspan entirely.
   */
  captureContent?: boolean;
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
export function observeAnthropic<T extends object>(client: T, options: ObserveOptions = {}): T {
  const exporter =
    options.exporter ??
    new HttpSpanExporter({
      endpoint: options.endpoint ?? 'http://127.0.0.1:3100/api/ingest',
      source: '@lookspan/anthropic',
    });
  const provider = options.provider ?? 'anthropic';
  const captureContent = options.captureContent !== false;

  const emitSpan = (
    path: string,
    type: SpanType,
    args: unknown[],
    startedAt: string,
    status: SpanInput['status'],
    error: SpanInput['error'],
    result: unknown,
    usage: SpanInput['usage'],
    output: string | null,
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
      parentTraceId: options.parentTraceId ?? null,
      model: extractModel(args, result),
      provider,
      input: captureContent ? ((args[0] as Record<string, unknown> | undefined) ?? null) : null,
      output: captureContent ? output : null,
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
      emitSpan(
        path,
        type,
        args,
        startedAt,
        'error',
        { message: errMsg(err) },
        undefined,
        null,
        null,
      );
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
        let text = '';
        try {
          while (true) {
            const next = await it.next();
            if (next.done) break;
            usage = mergeUsage(usage, readUsage(next.value));
            if (captureContent) text += chunkText(next.value);
            yield next.value;
          }
          emitSpan(path, type, args, startedAt, 'ok', null, result, usage, text || null);
        } catch (err) {
          emitSpan(
            path,
            type,
            args,
            startedAt,
            'error',
            { message: errMsg(err) },
            result,
            usage,
            text || null,
          );
          throw err;
        }
      };
      return result;
    }

    emitSpan(
      path,
      type,
      args,
      startedAt,
      'ok',
      null,
      result,
      readUsage(result),
      extractOutputText(result),
    );
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
