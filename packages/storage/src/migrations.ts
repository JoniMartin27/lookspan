import type { LookspanDatabase } from './database.js';
import { openDatabase } from './database.js';

interface Migration {
  version: number;
  name: string;
  up: string;
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    up: `
      CREATE TABLE IF NOT EXISTS traces (
        trace_id TEXT PRIMARY KEY,
        root_name TEXT NOT NULL,
        framework TEXT NOT NULL,
        agent_id TEXT,
        session_id TEXT,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        duration_ms INTEGER,
        status TEXT NOT NULL,
        span_count INTEGER NOT NULL DEFAULT 0,
        error_count INTEGER NOT NULL DEFAULT 0,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        cached_input_tokens INTEGER NOT NULL DEFAULT 0,
        reasoning_tokens INTEGER NOT NULL DEFAULT 0,
        cost_usd REAL NOT NULL DEFAULT 0,
        attributes TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );

      CREATE INDEX IF NOT EXISTS idx_traces_started_at ON traces(started_at DESC);
      CREATE INDEX IF NOT EXISTS idx_traces_framework ON traces(framework, started_at DESC);
      CREATE INDEX IF NOT EXISTS idx_traces_session ON traces(session_id, started_at DESC);
      CREATE INDEX IF NOT EXISTS idx_traces_status ON traces(status, started_at DESC);

      CREATE TABLE IF NOT EXISTS spans (
        span_id TEXT PRIMARY KEY,
        trace_id TEXT NOT NULL REFERENCES traces(trace_id) ON DELETE CASCADE,
        parent_span_id TEXT,
        type TEXT NOT NULL,
        name TEXT NOT NULL,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        duration_ms INTEGER,
        status TEXT NOT NULL,
        framework TEXT NOT NULL,
        agent_id TEXT,
        session_id TEXT,
        model TEXT,
        provider TEXT,
        input TEXT,
        output TEXT,
        error TEXT,
        input_tokens INTEGER,
        output_tokens INTEGER,
        cached_input_tokens INTEGER,
        reasoning_tokens INTEGER,
        cost_usd REAL,
        attributes TEXT,
        received_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );

      CREATE INDEX IF NOT EXISTS idx_spans_trace ON spans(trace_id, started_at);
      CREATE INDEX IF NOT EXISTS idx_spans_parent ON spans(parent_span_id);
      CREATE INDEX IF NOT EXISTS idx_spans_type ON spans(type, started_at DESC);
      CREATE INDEX IF NOT EXISTS idx_spans_model ON spans(model, started_at DESC);
      CREATE INDEX IF NOT EXISTS idx_spans_framework_time ON spans(framework, started_at DESC);
    `,
  },
  {
    version: 2,
    name: 'alerts',
    up: `
      CREATE TABLE IF NOT EXISTS alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        rule_id TEXT NOT NULL,
        trace_id TEXT NOT NULL,
        condition TEXT NOT NULL,
        message TEXT NOT NULL,
        value REAL,
        threshold REAL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );

      CREATE INDEX IF NOT EXISTS idx_alerts_created ON alerts(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_alerts_trace ON alerts(trace_id);
    `,
  },
  {
    version: 3,
    name: 'scores',
    up: `
      CREATE TABLE IF NOT EXISTS scores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trace_id TEXT NOT NULL REFERENCES traces(trace_id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        value REAL NOT NULL,
        comment TEXT,
        source TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );

      CREATE INDEX IF NOT EXISTS idx_scores_trace ON scores(trace_id);
      CREATE INDEX IF NOT EXISTS idx_scores_name ON scores(name);
    `,
  },
  {
    version: 4,
    name: 'parent_trace_id',
    up: `
      ALTER TABLE traces ADD COLUMN parent_trace_id TEXT;
      ALTER TABLE spans ADD COLUMN parent_trace_id TEXT;
      CREATE INDEX IF NOT EXISTS idx_traces_parent_trace ON traces(parent_trace_id);
    `,
  },
  {
    version: 5,
    name: 'replays',
    up: `
      CREATE TABLE IF NOT EXISTS replays (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trace_id TEXT NOT NULL REFERENCES traces(trace_id) ON DELETE CASCADE,
        span_id TEXT,
        provider TEXT NOT NULL,
        original_model TEXT,
        replay_model TEXT NOT NULL,
        status TEXT NOT NULL,
        output TEXT,
        error TEXT,
        input_tokens INTEGER,
        output_tokens INTEGER,
        cost_usd REAL,
        duration_ms INTEGER,
        original_output TEXT,
        original_cost_usd REAL,
        original_duration_ms INTEGER,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );

      CREATE INDEX IF NOT EXISTS idx_replays_trace ON replays(trace_id, created_at DESC);
    `,
  },
  {
    version: 6,
    name: 'datasets',
    up: `
      CREATE TABLE IF NOT EXISTS datasets (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );

      CREATE TABLE IF NOT EXISTS dataset_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        dataset_id TEXT NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
        input TEXT NOT NULL,
        expected TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
      CREATE INDEX IF NOT EXISTS idx_dataset_items_ds ON dataset_items(dataset_id, id);

      CREATE TABLE IF NOT EXISTS runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        dataset_id TEXT NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
        model TEXT NOT NULL,
        provider TEXT NOT NULL,
        status TEXT NOT NULL,
        item_count INTEGER NOT NULL DEFAULT 0,
        ok_count INTEGER NOT NULL DEFAULT 0,
        error_count INTEGER NOT NULL DEFAULT 0,
        total_cost_usd REAL,
        avg_score REAL,
        judge_metric TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
      CREATE INDEX IF NOT EXISTS idx_runs_ds ON runs(dataset_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS run_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
        item_id INTEGER NOT NULL,
        status TEXT NOT NULL,
        output TEXT,
        error TEXT,
        cost_usd REAL,
        duration_ms INTEGER,
        score REAL,
        rationale TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
      CREATE INDEX IF NOT EXISTS idx_run_items_run ON run_items(run_id, id);
    `,
  },
];

export function getCurrentSchemaVersion(db: LookspanDatabase): number {
  const row = db.pragma('user_version', { simple: true });
  return typeof row === 'number' ? row : 0;
}

export function setSchemaVersion(db: LookspanDatabase, version: number): void {
  db.pragma(`user_version = ${version}`);
}

export function migrate(db: LookspanDatabase): { applied: number[]; current: number } {
  const current = getCurrentSchemaVersion(db);
  const pending = MIGRATIONS.filter((m) => m.version > current).sort(
    (a, b) => a.version - b.version,
  );
  const applied: number[] = [];

  for (const m of pending) {
    db.transaction(() => {
      db.exec(m.up);
      setSchemaVersion(db, m.version);
    })();
    applied.push(m.version);
  }

  return { applied, current: getCurrentSchemaVersion(db) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const db = openDatabase();
  const result = migrate(db);
  console.log(
    `[lookspan/storage] migrations applied: ${result.applied.length === 0 ? 'none' : result.applied.join(', ')} (schema v${result.current})`,
  );
  db.close();
}
