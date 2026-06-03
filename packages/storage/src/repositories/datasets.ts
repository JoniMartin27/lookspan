import type {
  Dataset,
  DatasetItem,
  DatasetItemInput,
  Run,
  RunItem,
  RunStatus,
} from '@lookspan/types';
import type { LookspanDatabase } from '../database.js';
import type { DatasetItemRow, DatasetRow, RunItemRow, RunRow } from '../schema.js';

function parseInput(raw: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function rowToItem(row: DatasetItemRow): DatasetItem {
  return {
    id: row.id,
    datasetId: row.dataset_id,
    input: parseInput(row.input),
    expected: row.expected,
    createdAt: row.created_at,
  };
}

function rowToRun(row: RunRow): Run {
  return {
    id: row.id,
    datasetId: row.dataset_id,
    model: row.model,
    provider: row.provider,
    status: row.status as RunStatus,
    itemCount: row.item_count,
    okCount: row.ok_count,
    errorCount: row.error_count,
    totalCostUsd: row.total_cost_usd,
    avgScore: row.avg_score,
    judgeMetric: row.judge_metric,
    createdAt: row.created_at,
  };
}

function rowToRunItem(row: RunItemRow): RunItem {
  return {
    id: row.id,
    runId: row.run_id,
    itemId: row.item_id,
    status: row.status === 'error' ? 'error' : 'ok',
    output: row.output,
    error: row.error,
    costUsd: row.cost_usd,
    durationMs: row.duration_ms,
    score: row.score,
    rationale: row.rationale,
    createdAt: row.created_at,
  };
}

export class DatasetsRepository {
  constructor(private readonly db: LookspanDatabase) {}

  create(id: string, name: string, description: string | null, createdAt: string): Dataset {
    this.db
      .prepare(
        'INSERT INTO datasets (id, name, description, created_at) VALUES (@id, @name, @description, @createdAt)',
      )
      .run({ id, name, description, createdAt });
    return { id, name, description, itemCount: 0, runCount: 0, createdAt };
  }

  get(id: string): Dataset | null {
    const row = this.db.prepare('SELECT * FROM datasets WHERE id = ?').get(id) as
      | DatasetRow
      | undefined;
    if (!row) return null;
    const counts = this.db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM dataset_items WHERE dataset_id = @id) AS items,
           (SELECT COUNT(*) FROM runs WHERE dataset_id = @id) AS runs`,
      )
      .get({ id }) as { items: number; runs: number };
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      itemCount: counts.items,
      runCount: counts.runs,
      createdAt: row.created_at,
    };
  }

  list(): Dataset[] {
    const rows = this.db
      .prepare(
        `SELECT d.*,
           (SELECT COUNT(*) FROM dataset_items i WHERE i.dataset_id = d.id) AS item_count,
           (SELECT COUNT(*) FROM runs r WHERE r.dataset_id = d.id) AS run_count
         FROM datasets d ORDER BY d.created_at DESC`,
      )
      .all() as (DatasetRow & { item_count: number; run_count: number })[];
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      itemCount: row.item_count,
      runCount: row.run_count,
      createdAt: row.created_at,
    }));
  }

  addItem(datasetId: string, item: DatasetItemInput, createdAt: string): DatasetItem {
    const info = this.db
      .prepare(
        'INSERT INTO dataset_items (dataset_id, input, expected, created_at) VALUES (@datasetId, @input, @expected, @createdAt)',
      )
      .run({
        datasetId,
        input: JSON.stringify(item.input ?? {}),
        expected: item.expected ?? null,
        createdAt,
      });
    return {
      id: Number(info.lastInsertRowid),
      datasetId,
      input: item.input ?? {},
      expected: item.expected ?? null,
      createdAt,
    };
  }

  addItems(datasetId: string, items: DatasetItemInput[], createdAt: string): DatasetItem[] {
    const insertAll = this.db.transaction((batch: DatasetItemInput[]) =>
      batch.map((it) => this.addItem(datasetId, it, createdAt)),
    );
    return insertAll(items);
  }

  listItems(datasetId: string): DatasetItem[] {
    const rows = this.db
      .prepare('SELECT * FROM dataset_items WHERE dataset_id = ? ORDER BY id ASC')
      .all(datasetId) as DatasetItemRow[];
    return rows.map(rowToItem);
  }
}

export class RunsRepository {
  constructor(private readonly db: LookspanDatabase) {}

  create(
    run: {
      datasetId: string;
      model: string;
      provider: string;
      status: RunStatus;
      itemCount: number;
      judgeMetric: string | null;
    },
    createdAt: string,
  ): Run {
    const info = this.db
      .prepare(
        `INSERT INTO runs (dataset_id, model, provider, status, item_count, judge_metric, created_at)
         VALUES (@datasetId, @model, @provider, @status, @itemCount, @judgeMetric, @createdAt)`,
      )
      .run({ ...run, createdAt });
    return {
      id: Number(info.lastInsertRowid),
      datasetId: run.datasetId,
      model: run.model,
      provider: run.provider,
      status: run.status,
      itemCount: run.itemCount,
      okCount: 0,
      errorCount: 0,
      totalCostUsd: null,
      avgScore: null,
      judgeMetric: run.judgeMetric,
      createdAt,
    };
  }

  finalize(
    runId: number,
    agg: {
      status: RunStatus;
      okCount: number;
      errorCount: number;
      totalCostUsd: number | null;
      avgScore: number | null;
    },
  ): void {
    this.db
      .prepare(
        `UPDATE runs SET status = @status, ok_count = @okCount, error_count = @errorCount,
           total_cost_usd = @totalCostUsd, avg_score = @avgScore WHERE id = @runId`,
      )
      .run({ runId, ...agg });
  }

  insertRunItem(item: Omit<RunItem, 'id' | 'createdAt'>, createdAt: string): RunItem {
    const info = this.db
      .prepare(
        `INSERT INTO run_items (run_id, item_id, status, output, error, cost_usd, duration_ms, score, rationale, created_at)
         VALUES (@runId, @itemId, @status, @output, @error, @costUsd, @durationMs, @score, @rationale, @createdAt)`,
      )
      .run({
        runId: item.runId,
        itemId: item.itemId,
        status: item.status,
        output: item.output ?? null,
        error: item.error ?? null,
        costUsd: item.costUsd ?? null,
        durationMs: item.durationMs ?? null,
        score: item.score ?? null,
        rationale: item.rationale ?? null,
        createdAt,
      });
    return { ...item, id: Number(info.lastInsertRowid), createdAt };
  }

  get(runId: number): Run | null {
    const row = this.db.prepare('SELECT * FROM runs WHERE id = ?').get(runId) as RunRow | undefined;
    return row ? rowToRun(row) : null;
  }

  listByDataset(datasetId: string): Run[] {
    const rows = this.db
      .prepare('SELECT * FROM runs WHERE dataset_id = ? ORDER BY created_at DESC, id DESC')
      .all(datasetId) as RunRow[];
    return rows.map(rowToRun);
  }

  listItems(runId: number): RunItem[] {
    const rows = this.db
      .prepare('SELECT * FROM run_items WHERE run_id = ? ORDER BY id ASC')
      .all(runId) as RunItemRow[];
    return rows.map(rowToRunItem);
  }
}
