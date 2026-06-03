import type { Replay, ReplayInput } from '@lookspan/types';
import type { LookspanDatabase } from '../database.js';
import type { ReplayRow } from '../schema.js';

function rowToReplay(row: ReplayRow): Replay {
  return {
    id: row.id,
    traceId: row.trace_id,
    spanId: row.span_id,
    provider: row.provider,
    originalModel: row.original_model,
    replayModel: row.replay_model,
    status: row.status === 'error' ? 'error' : 'ok',
    output: row.output,
    error: row.error,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    costUsd: row.cost_usd,
    durationMs: row.duration_ms,
    originalOutput: row.original_output,
    originalCostUsd: row.original_cost_usd,
    originalDurationMs: row.original_duration_ms,
    createdAt: row.created_at,
  };
}

export class ReplaysRepository {
  constructor(private readonly db: LookspanDatabase) {}

  insert(replay: ReplayInput, createdAt: string): Replay {
    const info = this.db
      .prepare(
        `INSERT INTO replays (
           trace_id, span_id, provider, original_model, replay_model, status,
           output, error, input_tokens, output_tokens, cost_usd, duration_ms,
           original_output, original_cost_usd, original_duration_ms, created_at
         ) VALUES (
           @traceId, @spanId, @provider, @originalModel, @replayModel, @status,
           @output, @error, @inputTokens, @outputTokens, @costUsd, @durationMs,
           @originalOutput, @originalCostUsd, @originalDurationMs, @createdAt
         )`,
      )
      .run({
        traceId: replay.traceId,
        spanId: replay.spanId ?? null,
        provider: replay.provider,
        originalModel: replay.originalModel ?? null,
        replayModel: replay.replayModel,
        status: replay.status,
        output: replay.output ?? null,
        error: replay.error ?? null,
        inputTokens: replay.inputTokens ?? null,
        outputTokens: replay.outputTokens ?? null,
        costUsd: replay.costUsd ?? null,
        durationMs: replay.durationMs ?? null,
        originalOutput: replay.originalOutput ?? null,
        originalCostUsd: replay.originalCostUsd ?? null,
        originalDurationMs: replay.originalDurationMs ?? null,
        createdAt,
      });
    return { ...replay, id: Number(info.lastInsertRowid), createdAt };
  }

  listByTrace(traceId: string): Replay[] {
    const rows = this.db
      .prepare('SELECT * FROM replays WHERE trace_id = ? ORDER BY created_at DESC, id DESC')
      .all(traceId) as ReplayRow[];
    return rows.map(rowToReplay);
  }
}
