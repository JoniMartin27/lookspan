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
  cancelled_count: number;
  min_started: string;
  max_ended: string | null;
  input_tokens: number;
  output_tokens: number;
  cached_input_tokens: number;
  reasoning_tokens: number;
  cost_usd: number;
  parent_trace_id: string | null;
}

/** The span a trace takes its identity from: its root, or its earliest span. */
interface IdentityRow {
  name: string;
  framework: string;
  agent_id: string | null;
  session_id: string | null;
}

export function recomputeTrace(db: LookspanDatabase, traceId: string): Trace | null {
  const agg = db
    .prepare(
      `
      SELECT
        COUNT(*) as span_count,
        SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error_count,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_count,
        MIN(started_at) as min_started,
        MAX(ended_at) as max_ended,
        COALESCE(SUM(input_tokens), 0) as input_tokens,
        COALESCE(SUM(output_tokens), 0) as output_tokens,
        COALESCE(SUM(cached_input_tokens), 0) as cached_input_tokens,
        COALESCE(SUM(reasoning_tokens), 0) as reasoning_tokens,
        COALESCE(SUM(cost_usd), 0) as cost_usd,
        MAX(parent_trace_id) as parent_trace_id
      FROM spans
      WHERE trace_id = ?
      GROUP BY trace_id
    `,
    )
    .get(traceId) as AggregateRow | undefined;

  if (!agg || agg.span_count === 0) return null;

  // A span tree closes its root LAST, so a trace legitimately spends time with
  // only children in the database. Until the root lands, the earliest span is
  // the best name available — but the moment it does land it must win, which is
  // why this is recomputed (and re-persisted) on every ingest.
  //
  // ORDER BY makes both queries deterministic: a bare LIMIT 1 let SQLite pick
  // any row, so a trace with two roots could rename itself between ingests.
  //
  // name/framework/agent/session come from HERE and not from the aggregate:
  // they used to be bare columns under a `GROUP BY trace_id`, which SQLite
  // tolerates (arbitrary row) and Postgres does not — on the Postgres driver
  // they came back NULL every time, and only the placeholder row hid it.
  const IDENTITY = 'name, framework, agent_id, session_id';
  const identity =
    (db
      .prepare(
        `SELECT ${IDENTITY} FROM spans
         WHERE trace_id = ? AND parent_span_id IS NULL
         ORDER BY started_at, span_id LIMIT 1`,
      )
      .get(traceId) as IdentityRow | undefined) ??
    (db
      .prepare(
        `SELECT ${IDENTITY} FROM spans
         WHERE trace_id = ? ORDER BY started_at, span_id LIMIT 1`,
      )
      .get(traceId) as IdentityRow | undefined);

  const rootName = identity?.name ?? 'unknown';

  const startedAt = agg.min_started;
  const endedAt = agg.max_ended;
  // Clamp at 0: clock skew or out-of-order spans can make the trace's max ended
  // precede its min started, and a negative duration would skew reports.
  const durationMs =
    endedAt && startedAt
      ? Math.max(0, new Date(endedAt).getTime() - new Date(startedAt).getTime())
      : null;

  // Status precedence mirrors the error rule: an error anywhere in the trace
  // dominates; otherwise a cancelled span anywhere marks the whole trace as
  // cancelled; everything else is ok (including still-open traces, which stay
  // ok until a terminal span lands). Previously this branch could only ever
  // yield ok, so cancelled traces were silently reported as successful.
  const status: Trace['status'] =
    agg.error_count > 0
      ? SpanStatus.Error
      : agg.cancelled_count > 0
        ? SpanStatus.Cancelled
        : SpanStatus.Ok;

  const trace: Trace = {
    traceId,
    rootName,
    framework: identity?.framework as FrameworkName,
    agentId: identity?.agent_id ?? null,
    sessionId: identity?.session_id ?? null,
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
