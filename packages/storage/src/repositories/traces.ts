import type { SessionSummary, Trace, TraceListItem } from '@lookspan/types';
import type { LookspanDatabase } from '../database.js';
import type { TraceRow } from '../schema.js';
import { rowToTrace, rowToTraceListItem } from './mappers.js';

export interface ListTracesOptions {
  limit?: number;
  cursor?: string;
  framework?: string;
  status?: string;
  sessionId?: string;
}

export class TracesRepository {
  constructor(private readonly db: LookspanDatabase) {}

  list(options: ListTracesOptions = {}): TraceListItem[] {
    const limit = Math.min(options.limit ?? 50, 500);
    const where: string[] = [];
    const params: Record<string, unknown> = { limit };

    if (options.framework) {
      where.push('framework = @framework');
      params.framework = options.framework;
    }
    if (options.status) {
      where.push('status = @status');
      params.status = options.status;
    }
    if (options.sessionId) {
      where.push('session_id = @sessionId');
      params.sessionId = options.sessionId;
    }
    if (options.cursor) {
      where.push('started_at < @cursor');
      params.cursor = options.cursor;
    }

    const sql = `
      SELECT * FROM traces
      ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY started_at DESC
      LIMIT @limit
    `;
    const rows = this.db.prepare(sql).all(params) as TraceRow[];
    return rows.map(rowToTraceListItem);
  }

  getById(traceId: string): Trace | null {
    const row = this.db.prepare('SELECT * FROM traces WHERE trace_id = ?').get(traceId) as
      | TraceRow
      | undefined;
    return row ? rowToTrace(row) : null;
  }

  upsert(trace: Trace): void {
    this.db
      .prepare(
        `
      INSERT INTO traces (
        trace_id, root_name, framework, agent_id, session_id, parent_trace_id,
        started_at, ended_at, duration_ms, status, span_count, error_count,
        input_tokens, output_tokens, cached_input_tokens, reasoning_tokens,
        cost_usd, attributes
      ) VALUES (
        @traceId, @rootName, @framework, @agentId, @sessionId, @parentTraceId,
        @startedAt, @endedAt, @durationMs, @status, @spanCount, @errorCount,
        @inputTokens, @outputTokens, @cachedInputTokens, @reasoningTokens,
        @costUsd, @attributes
      )
      ON CONFLICT(trace_id) DO UPDATE SET
        parent_trace_id = COALESCE(excluded.parent_trace_id, traces.parent_trace_id),
        ended_at = excluded.ended_at,
        duration_ms = excluded.duration_ms,
        status = excluded.status,
        span_count = excluded.span_count,
        error_count = excluded.error_count,
        input_tokens = excluded.input_tokens,
        output_tokens = excluded.output_tokens,
        cached_input_tokens = excluded.cached_input_tokens,
        reasoning_tokens = excluded.reasoning_tokens,
        cost_usd = excluded.cost_usd,
        attributes = excluded.attributes
    `,
      )
      .run({
        traceId: trace.traceId,
        rootName: trace.rootName,
        framework: trace.framework,
        agentId: trace.agentId,
        sessionId: trace.sessionId,
        parentTraceId: trace.parentTraceId ?? null,
        startedAt: trace.startedAt,
        endedAt: trace.endedAt,
        durationMs: trace.durationMs,
        status: trace.status,
        spanCount: trace.spanCount,
        errorCount: trace.errorCount,
        inputTokens: trace.totalUsage.inputTokens,
        outputTokens: trace.totalUsage.outputTokens,
        cachedInputTokens: trace.totalUsage.cachedInputTokens ?? 0,
        reasoningTokens: trace.totalUsage.reasoningTokens ?? 0,
        costUsd: trace.costUsd,
        attributes: trace.attributes ? JSON.stringify(trace.attributes) : null,
      });
  }

  delete(traceId: string): void {
    this.db.prepare('DELETE FROM traces WHERE trace_id = ?').run(traceId);
  }

  countSince(isoTimestamp: string): number {
    const row = this.db
      .prepare('SELECT COUNT(*) as n FROM traces WHERE started_at >= ?')
      .get(isoTimestamp) as { n: number };
    return row.n;
  }

  private static readonly SESSION_SELECT = `
    SELECT
      session_id AS sessionId,
      COUNT(*) AS traceCount,
      COUNT(DISTINCT agent_id) AS agentCount,
      COALESCE(SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END), 0) AS errorCount,
      COALESCE(SUM(cost_usd), 0) AS totalCostUsd,
      MIN(started_at) AS startedAt,
      MAX(COALESCE(ended_at, started_at)) AS endedAt
    FROM traces
    WHERE session_id IS NOT NULL`;

  /** Sessions ordered by most recent activity. */
  listSessions(limit = 100): SessionSummary[] {
    const max = Math.min(limit, 500);
    return this.db
      .prepare(
        `${TracesRepository.SESSION_SELECT}
         GROUP BY session_id
         ORDER BY MAX(started_at) DESC
         LIMIT ?`,
      )
      .all(max) as SessionSummary[];
  }

  /** Aggregate summary for a single session, or null if it has no traces. */
  sessionSummary(sessionId: string): SessionSummary | null {
    const row = this.db
      .prepare(`${TracesRepository.SESSION_SELECT} AND session_id = @sessionId GROUP BY session_id`)
      .get({ sessionId }) as SessionSummary | undefined;
    return row ?? null;
  }
}
