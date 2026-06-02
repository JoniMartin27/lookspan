import type { LookspanDatabase } from '@lookspan/storage';
import type { Span, Trace } from '@lookspan/types';
import { type FrameworkName, SpanStatus } from '@lookspan/types';

export interface TraceAggregate {
  rootName: string;
  framework: FrameworkName;
  agentId: string | null;
  sessionId: string | null;
  startedAt: string;
  endedAt: string | null;
  durationMs: number | null;
  status: typeof SpanStatus.Ok | typeof SpanStatus.Error | typeof SpanStatus.Cancelled;
  spanCount: number;
  errorCount: number;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  reasoningTokens: number;
  costUsd: number;
  attributes: Record<string, unknown> | null;
}

interface AggregateRow {
  span_count: number;
  error_count: number;
  min_started: string;
  max_ended: string | null;
  input_tokens: number;
  output_tokens: number;
  cached_input_tokens: number;
  reasoning_tokens: number;
  cost_usd: number;
  framework: string;
  agent_id: string | null;
  session_id: string | null;
  parent_trace_id: string | null;
}

export function recomputeTrace(db: LookspanDatabase, traceId: string): Trace | null {
  const agg = db
    .prepare(
      `
      SELECT
        COUNT(*) as span_count,
        SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error_count,
        MIN(started_at) as min_started,
        MAX(ended_at) as max_ended,
        COALESCE(SUM(input_tokens), 0) as input_tokens,
        COALESCE(SUM(output_tokens), 0) as output_tokens,
        COALESCE(SUM(cached_input_tokens), 0) as cached_input_tokens,
        COALESCE(SUM(reasoning_tokens), 0) as reasoning_tokens,
        COALESCE(SUM(cost_usd), 0) as cost_usd,
        framework,
        agent_id,
        session_id,
        MAX(parent_trace_id) as parent_trace_id
      FROM spans
      WHERE trace_id = ?
      GROUP BY trace_id
    `,
    )
    .get(traceId) as AggregateRow | undefined;

  if (!agg || agg.span_count === 0) return null;

  const root = db
    .prepare('SELECT name FROM spans WHERE trace_id = ? AND parent_span_id IS NULL LIMIT 1')
    .get(traceId) as { name: string } | undefined;

  const rootName = root?.name ?? 'unknown';

  const startedAt = agg.min_started;
  const endedAt = agg.max_ended;
  const durationMs =
    endedAt && startedAt ? new Date(endedAt).getTime() - new Date(startedAt).getTime() : null;

  const status: Trace['status'] =
    agg.error_count > 0 ? SpanStatus.Error : endedAt ? SpanStatus.Ok : SpanStatus.Ok;

  const trace: Trace = {
    traceId,
    rootName,
    framework: agg.framework as FrameworkName,
    agentId: agg.agent_id,
    sessionId: agg.session_id,
    parentTraceId: agg.parent_trace_id,
    startedAt,
    endedAt,
    durationMs,
    status,
    spanCount: agg.span_count,
    errorCount: agg.error_count,
    totalUsage: {
      inputTokens: agg.input_tokens,
      outputTokens: agg.output_tokens,
      cachedInputTokens: agg.cached_input_tokens,
      reasoningTokens: agg.reasoning_tokens,
      costUsd: agg.cost_usd,
    },
    costUsd: agg.cost_usd,
    attributes: null,
  };

  return trace;
}

export function isTraceComplete(spans: Span[]): boolean {
  return spans.length > 0 && spans.every((s) => s.endedAt !== null);
}
