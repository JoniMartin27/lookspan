import type {
  FrameworkName,
  Span,
  SpanStatus,
  SpanType,
  Trace,
  TraceListItem,
} from '@lookspan/types';
import type { SpanRow, TraceRow } from '../schema.js';

function parseJson<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export function rowToTrace(row: TraceRow): Trace {
  return {
    traceId: row.trace_id,
    rootName: row.root_name,
    framework: row.framework as FrameworkName,
    agentId: row.agent_id,
    sessionId: row.session_id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    durationMs: row.duration_ms,
    status: row.status as SpanStatus,
    spanCount: row.span_count,
    errorCount: row.error_count,
    totalUsage: {
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      cachedInputTokens: row.cached_input_tokens,
      reasoningTokens: row.reasoning_tokens,
      costUsd: row.cost_usd,
    },
    costUsd: row.cost_usd,
    attributes: parseJson<Record<string, unknown>>(row.attributes),
  };
}

export function rowToTraceListItem(row: TraceRow): TraceListItem {
  return {
    traceId: row.trace_id,
    rootName: row.root_name,
    framework: row.framework as FrameworkName,
    agentId: row.agent_id,
    startedAt: row.started_at,
    durationMs: row.duration_ms,
    status: row.status as SpanStatus,
    spanCount: row.span_count,
    costUsd: row.cost_usd,
  };
}

export function rowToSpan(row: SpanRow): Span {
  return {
    traceId: row.trace_id,
    spanId: row.span_id,
    parentSpanId: row.parent_span_id,
    type: row.type as SpanType,
    name: row.name,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    durationMs: row.duration_ms,
    status: row.status as SpanStatus,
    framework: row.framework as FrameworkName,
    agentId: row.agent_id,
    sessionId: row.session_id,
    model: row.model,
    provider: row.provider,
    input: parseJson<Record<string, unknown>>(row.input),
    output: row.output,
    error: parseJson<{ code?: string; message: string }>(row.error),
    usage:
      row.input_tokens !== null || row.output_tokens !== null
        ? {
            inputTokens: row.input_tokens ?? 0,
            outputTokens: row.output_tokens ?? 0,
            cachedInputTokens: row.cached_input_tokens ?? 0,
            reasoningTokens: row.reasoning_tokens ?? 0,
            costUsd: row.cost_usd ?? 0,
          }
        : null,
    attributes: parseJson<Record<string, unknown>>(row.attributes),
    receivedAt: row.received_at,
  };
}
