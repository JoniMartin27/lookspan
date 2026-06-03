import type { Span, SpanInput } from '@lookspan/types';
import type { LookspanDatabase } from '../database.js';
import type { SpanRow } from '../schema.js';
import { rowToSpan } from './mappers.js';

export class SpansRepository {
  constructor(private readonly db: LookspanDatabase) {}

  insert(span: SpanInput, receivedAt: string): Span {
    const durationMs =
      span.endedAt && span.startedAt
        ? new Date(span.endedAt).getTime() - new Date(span.startedAt).getTime()
        : null;

    this.db
      .prepare(
        `
      INSERT INTO spans (
        span_id, trace_id, parent_span_id, type, name,
        started_at, ended_at, duration_ms, status, framework,
        agent_id, session_id, model, provider, parent_trace_id,
        input, output, error,
        input_tokens, output_tokens, cached_input_tokens, reasoning_tokens, cost_usd,
        attributes, received_at
      ) VALUES (
        @spanId, @traceId, @parentSpanId, @type, @name,
        @startedAt, @endedAt, @durationMs, @status, @framework,
        @agentId, @sessionId, @model, @provider, @parentTraceId,
        @input, @output, @error,
        @inputTokens, @outputTokens, @cachedInputTokens, @reasoningTokens, @costUsd,
        @attributes, @receivedAt
      )
      ON CONFLICT(span_id) DO UPDATE SET
        ended_at = excluded.ended_at,
        duration_ms = excluded.duration_ms,
        status = excluded.status,
        output = excluded.output,
        error = excluded.error,
        input_tokens = excluded.input_tokens,
        output_tokens = excluded.output_tokens,
        cached_input_tokens = excluded.cached_input_tokens,
        reasoning_tokens = excluded.reasoning_tokens,
        cost_usd = excluded.cost_usd,
        attributes = excluded.attributes
    `,
      )
      .run({
        spanId: span.spanId,
        traceId: span.traceId,
        parentSpanId: span.parentSpanId,
        type: span.type,
        name: span.name,
        startedAt: span.startedAt,
        endedAt: span.endedAt,
        durationMs,
        status: span.status,
        framework: span.framework,
        agentId: span.agentId ?? null,
        sessionId: span.sessionId ?? null,
        model: span.model ?? null,
        provider: span.provider ?? null,
        parentTraceId: span.parentTraceId ?? null,
        input: span.input ? JSON.stringify(span.input) : null,
        output: span.output ?? null,
        error: span.error ? JSON.stringify(span.error) : null,
        inputTokens: span.usage?.inputTokens ?? null,
        outputTokens: span.usage?.outputTokens ?? null,
        cachedInputTokens: span.usage?.cachedInputTokens ?? null,
        reasoningTokens: span.usage?.reasoningTokens ?? null,
        costUsd: span.usage?.costUsd ?? null,
        attributes: span.attributes ? JSON.stringify(span.attributes) : null,
        receivedAt,
      });

    return { ...span, durationMs, receivedAt };
  }

  insertMany(spans: SpanInput[], receivedAt: string): Span[] {
    const insertOne = this.db.transaction((batch: SpanInput[]) =>
      batch.map((s) => this.insert(s, receivedAt)),
    );
    return insertOne(spans);
  }

  listByTrace(traceId: string): Span[] {
    const rows = this.db
      .prepare('SELECT * FROM spans WHERE trace_id = ? ORDER BY started_at ASC')
      .all(traceId) as SpanRow[];
    return rows.map(rowToSpan);
  }

  getById(spanId: string): Span | null {
    const row = this.db.prepare('SELECT * FROM spans WHERE span_id = ?').get(spanId) as
      | SpanRow
      | undefined;
    return row ? rowToSpan(row) : null;
  }

  /** Recent tool_call spans across all traces (for the Tools / MCP inspector). */
  listRecentToolCalls(limit = 100, framework?: string): Span[] {
    const max = Math.min(limit, 500);
    const rows = framework
      ? (this.db
          .prepare(
            "SELECT * FROM spans WHERE type = 'tool_call' AND framework = ? ORDER BY started_at DESC LIMIT ?",
          )
          .all(framework, max) as SpanRow[])
      : (this.db
          .prepare("SELECT * FROM spans WHERE type = 'tool_call' ORDER BY started_at DESC LIMIT ?")
          .all(max) as SpanRow[]);
    return rows.map(rowToSpan);
  }
}
