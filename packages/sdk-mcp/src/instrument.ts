import type { SpanInput } from '@lookspan/types';
import { FrameworkName, SpanStatus, SpanType } from '@lookspan/types';
import type { SpanExporter } from './exporter.js';
import { newSpanId, newTraceId } from './ids.js';

interface MinimalMcpClient {
  callTool: (
    params: { name: string; arguments?: Record<string, unknown> },
    ...rest: unknown[]
  ) => Promise<unknown>;
  listTools?: (...args: unknown[]) => Promise<unknown>;
}

export interface InstrumentOptions {
  exporter: SpanExporter;
  agentId?: string;
  sessionId?: string;
  traceId?: string;
  rootSpanId?: string;
  /** Capture tool arguments and results. Default: false. */
  captureContent?: boolean;
  attributes?: Record<string, unknown>;
}

export interface InstrumentedClient<T extends MinimalMcpClient> {
  client: T;
  traceId: string;
  flush: () => Promise<void>;
}

export function wrapMcpClient<T extends MinimalMcpClient>(
  client: T,
  options: InstrumentOptions,
): InstrumentedClient<T> {
  const traceId = options.traceId ?? newTraceId();
  const exporter = options.exporter;
  const captureContent = options.captureContent === true;

  const originalCallTool = client.callTool.bind(client);

  const wrappedCallTool = async function callTool(
    this: unknown,
    params: { name: string; arguments?: Record<string, unknown> },
    ...rest: unknown[]
  ): Promise<unknown> {
    const spanId = newSpanId();
    const startedAt = new Date().toISOString();

    const baseSpan: Omit<SpanInput, 'endedAt' | 'status' | 'output' | 'error'> = {
      traceId,
      spanId,
      parentSpanId: options.rootSpanId ?? null,
      type: SpanType.ToolCall,
      name: `mcp.tool.${params.name}`,
      startedAt,
      framework: FrameworkName.Mcp,
      agentId: options.agentId ?? null,
      sessionId: options.sessionId ?? null,
      input: captureContent ? { name: params.name, arguments: params.arguments ?? {} } : null,
      attributes: options.attributes ?? null,
    };

    try {
      const result = await originalCallTool(params, ...rest);
      const span: SpanInput = {
        ...baseSpan,
        endedAt: new Date().toISOString(),
        status: SpanStatus.Ok,
        output: captureContent
          ? typeof result === 'string'
            ? result
            : safeStringify(result)
          : null,
        error: null,
      };
      void exporter.send([span]);
      return result;
    } catch (err) {
      const span: SpanInput = {
        ...baseSpan,
        endedAt: new Date().toISOString(),
        status: SpanStatus.Error,
        output: null,
        error: { message: (err as Error).message, code: (err as { code?: string }).code },
      };
      void exporter.send([span]);
      throw err;
    }
  };

  (client as MinimalMcpClient).callTool = wrappedCallTool as MinimalMcpClient['callTool'];

  return {
    client,
    traceId,
    flush: () => exporter.flush(),
  };
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
