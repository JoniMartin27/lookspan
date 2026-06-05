import type { SpanInput, SpanType } from '@lookspan/types';
import { HttpSpanExporter, type SpanExporter } from './exporter.js';
import { newSpanId, newTraceId } from './ids.js';

/**
 * Shared instrumentation for provider SDKs (OpenAI, Anthropic, …) that expose a
 * nested object surface like `client.chat.completions.create`. Each provider
 * differs only in *what* to trace and *how* to read usage/output from its
 * response shape; everything else — the span shape, the Proxy that intercepts
 * traced methods, streaming-iterator wrapping, error handling — is identical.
 *
 * `createSdkObserver(spec)` returns an `observe(client, options)` function that
 * captures that common behavior, so each SDK package becomes a thin spec.
 */

export interface SdkObserveOptions {
  /** Ingest endpoint. Default: http://127.0.0.1:3100/api/ingest */
  endpoint?: string;
  /** Bring your own exporter (overrides `endpoint`). */
  exporter?: SpanExporter;
  /** Attribution shown in the dashboard. */
  agentId?: string;
  sessionId?: string;
  /** Link this client's traces to a spawning trace (cross-agent handoff). */
  parentTraceId?: string;
  /** Provider label stored on the span. Defaults to the spec's provider. */
  provider?: string;
  /**
   * Capture the request params (messages/model) in the span's `input` and the
   * model's reply text in `output`. Enables Replay & LLM-as-judge in the
   * dashboard. Secrets are scrubbed server-side before storage. Default: true.
   * Set false to keep prompts/outputs out of Lookspan entirely.
   */
  captureContent?: boolean;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

/** Provider-specific knobs; the rest of the instrumentation is shared. */
export interface ObserverSpec {
  /** Exporter `source` tag + default `provider` label on each span. */
  source: string;
  defaultProvider: string;
  /** method path (e.g. `chat.completions.create`) → span type. */
  traced: Record<string, SpanType>;
  /** object paths to descend into to reach the traced methods. */
  namespaces: Set<string>;
  /** Read usage from a non-streaming result or a single streaming event. */
  readUsage: (obj: unknown) => Usage | null;
  /**
   * Fold a freshly-read usage into the accumulator across streaming events.
   * Default: keep the latest non-null reading.
   */
  mergeUsage?: (into: Usage | null, next: Usage | null) => Usage | null;
  /** Reply text from a non-streaming result. */
  extractOutputText: (result: unknown) => string | null;
  /** Text fragment from one streaming event. */
  chunkText: (event: unknown) => string;
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

const defaultMerge = (into: Usage | null, next: Usage | null): Usage | null => next ?? into;

export function createSdkObserver(spec: ObserverSpec) {
  const mergeUsage = spec.mergeUsage ?? defaultMerge;

  return function observe<T extends object>(client: T, options: SdkObserveOptions = {}): T {
    const exporter =
      options.exporter ??
      new HttpSpanExporter({
        endpoint: options.endpoint ?? 'http://127.0.0.1:3100/api/ingest',
        source: spec.source,
      });
    const provider = options.provider ?? spec.defaultProvider;
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

      // Streaming: the call returns an async iterable immediately. Wrap its
      // iterator so the span is emitted when the stream finishes (real
      // duration), with usage merged across events and the assistant text
      // accumulated across deltas.
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
              usage = mergeUsage(usage, spec.readUsage(next.value));
              if (captureContent) text += spec.chunkText(next.value);
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
        spec.readUsage(result),
        spec.extractOutputText(result),
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
            const type = spec.traced[full];
            if (type) {
              return (...args: unknown[]) =>
                traceCall(full, type, () => value.apply(obj, args), args);
            }
            return value.bind(obj);
          }
          if (value && typeof value === 'object' && spec.namespaces.has(full)) {
            return makeProxy(value, full);
          }
          return value;
        },
      });

    return makeProxy(client, '') as T;
  };
}
