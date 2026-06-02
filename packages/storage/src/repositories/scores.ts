import type { Score, ScoreInput } from '@lookspan/types';
import type { LookspanDatabase } from '../database.js';
import type { ScoreRow } from '../schema.js';

function rowToScore(row: ScoreRow): Score {
  return {
    id: row.id,
    traceId: row.trace_id,
    name: row.name,
    value: row.value,
    comment: row.comment,
    source: row.source,
    createdAt: row.created_at,
  };
}

export class ScoresRepository {
  constructor(private readonly db: LookspanDatabase) {}

  insert(score: ScoreInput, createdAt: string): Score {
    const info = this.db
      .prepare(
        `INSERT INTO scores (trace_id, name, value, comment, source, created_at)
         VALUES (@traceId, @name, @value, @comment, @source, @createdAt)`,
      )
      .run({
        traceId: score.traceId,
        name: score.name,
        value: score.value,
        comment: score.comment ?? null,
        source: score.source ?? null,
        createdAt,
      });
    return { ...score, id: Number(info.lastInsertRowid), createdAt };
  }

  listByTrace(traceId: string): Score[] {
    const rows = this.db
      .prepare('SELECT * FROM scores WHERE trace_id = ? ORDER BY created_at ASC, id ASC')
      .all(traceId) as ScoreRow[];
    return rows.map(rowToScore);
  }

  /** Average value per score name across all traces (for aggregate views). */
  averages(): { name: string; avg: number; count: number }[] {
    return this.db
      .prepare(
        'SELECT name, AVG(value) AS avg, COUNT(*) AS count FROM scores GROUP BY name ORDER BY name',
      )
      .all() as { name: string; avg: number; count: number }[];
  }
}
