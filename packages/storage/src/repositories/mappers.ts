import type { Span, Trace, TraceListItem } from '@lookspan/types';
import { FrameworkName, SpanStatus, SpanType } from '@lookspan/types';
import type { SpanRow, TraceRow } from '../schema.js';

function parseJson<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

const SPAN_TYPES = new Set<string>(Object.values(SpanType));
const SPAN_STATUSES = new Set<string>(Object.values(SpanStatus));
const FRAMEWORK_NAMES = new Set<string>(Object.values(FrameworkName));

/**
 * Validate an enum value read from the database. A raw `as SpanType` cast lies
 * when the stored value is corrupt (older schema, manual SQL edit), letting
 * invalid data reach the API and dashboard. Instead we check against the known
 * set and fall back to a safe default — warning rather than throwing, so a
 * single corrupt row can't break the whole listing.
 */
function coerceEnum<T extends string>(
  value: string,
  valid: Set<string>,
  fallback: T,
  field: string,
): T {
  if (valid.has(value)) return value as T;
  console.warn(`[lookspan/storage] invalid ${field} "${value}" from DB; using "${fallback}"`);
  return fallback;
}

const toSpanType = (v: string) => coerceEnum<SpanType>(v, SPAN_TYPES, SpanType.Custom, 'span.type');
const toSpanStatus = (v: string) =>
  coerceEnum<SpanStatus>(v, SPAN_STATUSES, SpanStatus.Error, 'span.status');
const toFramework = (v: string) =>
  coerceEnum<FrameworkName>(v, FRAMEWORK_NAMES, FrameworkName.Custom, 'span.framework');

export function rowToTrace(row: TraceRow): Trace {
  return {
    traceId: row.trace_id,
    rootName: row.root_name,
    framework: toFramework(row.framework),
    agentId: row.agent_id,
    sessionId: row.session_id,
    parentTraceId: row.parent_trace_id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    durationMs: row.duration_ms,
    status: toSpanStatus(row.status),
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
    framework: toFramework(row.framework),
    agentId: row.agent_id,
    parentTraceId: row.parent_trace_id,
    startedAt: row.started_at,
    durationMs: row.duration_ms,
    status: toSpanStatus(row.status),
    spanCount: row.span_count,
    costUsd: row.cost_usd,
  };
}

export function rowToSpan(row: SpanRow): Span {
  return {
    traceId: row.trace_id,
    spanId: row.span_id,
    parentSpanId: row.parent_span_id,
    type: toSpanType(row.type),
    name: row.name,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    durationMs: row.duration_ms,
    status: toSpanStatus(row.status),
    framework: toFramework(row.framework),
    agentId: row.agent_id,
    sessionId: row.session_id,
    parentTraceId: row.parent_trace_id,
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
            // Only present once a reasoning cost has been computed for the span,
            // so spans predating the column keep their original usage shape.
            ...(row.reasoning_cost_usd != null ? { reasoningCostUsd: row.reasoning_cost_usd } : {}),
          }
        : null,
    attributes: parseJson<Record<string, unknown>>(row.attributes),
    receivedAt: row.received_at,
  };
}
