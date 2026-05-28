import type { Trace, TraceListItem } from '@lookspan/types';
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
        trace_id, root_name, framework, agent_id, session_id,
        started_at, ended_at, duration_ms, status, span_count, error_count,
        input_tokens, output_tokens, cached_input_tokens, reasoning_tokens,
        cost_usd, attributes
      ) VALUES (
        @traceId, @rootName, @framework, @agentId, @sessionId,
        @startedAt, @endedAt, @durationMs, @status, @spanCount, @errorCount,
        @inputTokens, @outputTokens, @cachedInputTokens, @reasoningTokens,
        @costUsd, @attributes
      )
      ON CONFLICT(trace_id) DO UPDATE SET
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
}
