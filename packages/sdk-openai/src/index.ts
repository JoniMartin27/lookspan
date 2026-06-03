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
  /** Link this client's traces to a spawning trace (cross-agent handoff). */
  parentTraceId?: string;
  /** Provider label stored on the span. Default: "openai". */
  provider?: string;
  /**
   * Capture the request params (messages/model) in the span's `input` and the
   * model's reply text in `output`. Enables Replay & LLM-as-judge in the
   * dashboard. Secrets are scrubbed server-side before storage. Default: true.
   * Set false to keep prompts/outputs out of Lookspan entirely.
   */
  captureContent?: boolean;
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

function errMsg(err: unknown): string {
  return (err as Error)?.message ?? String(err);
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
export function observeOpenAI<T extends object>(client: T, options: ObserveOptions = {}): T {
  const exporter =
    options.exporter ??
    new HttpSpanExporter({
      endpoint: options.endpoint ?? 'http://127.0.0.1:3100/api/ingest',
      source: '@lookspan/openai',
    });
  const provider = options.provider ?? 'openai';
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

    // Streaming: the call returns immediately with an async iterable. Wrap its
    // iterator so the span is emitted when the stream finishes (real duration)
    // with usage from the final chunk (OpenAI sends it with include_usage) and
    // the assistant text accumulated across deltas.
    const streaming = (args[0] as { stream?: unknown } | undefined)?.stream === true;
    const iterable = result as { [Symbol.asyncIterator]?: () => AsyncIterator<unknown> } | null;
    const origMethod = iterable?.[Symbol.asyncIterator];
    if (streaming && iterable && typeof origMethod === 'function') {
      const getIter = origMethod.bind(iterable);
      iterable[Symbol.asyncIterator] = async function* wrapped(): AsyncGenerator<unknown> {
        const it = getIter();
        let usage: SpanInput['usage'] = null;
        let text = '';
        try {
          while (true) {
            const next = await it.next();
            if (next.done) break;
            const u = extractUsage(next.value);
            if (u && (u.inputTokens > 0 || u.outputTokens > 0)) usage = u;
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
      extractUsage(result),
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
