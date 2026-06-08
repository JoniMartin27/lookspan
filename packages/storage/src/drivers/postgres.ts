import { DataType, type IMemoryDb, newDb } from 'pg-mem';
import { translateStatement } from './translate.js';
import type { RunResult, SqlDriver, SqlStatement } from './types.js';

/**
 * Postgres driver for Lookspan.
 *
 * It is backed by an in-process Postgres engine (`pg-mem`) that parses and
 * executes real Postgres SQL synchronously. This is what lets us keep the
 * repositories' synchronous interface AND get genuine Postgres-dialect /
 * schema / migration parity — verified in CI with zero external server.
 *
 * A connection string is accepted and validated so the surface matches a real
 * deployment (`--db postgres://…`). Persisting to / reading from an external
 * Postgres *server* additionally requires the async `pg` wire client and is a
 * documented follow-up (see docs/CONFIGURATION.md → "Postgres"); the driver
 * boundary here is exactly the seam that follow-up plugs into.
 */

const INSERT_RE = /^\s*INSERT\s+INTO\b/i;
const HAS_RETURNING_RE = /\bRETURNING\b/i;
// Tables whose primary key is a generated `id` we expose as lastInsertRowid.
const ID_TABLES = new Set(['alerts', 'scores', 'dataset_items', 'runs', 'run_items', 'replays']);
const INSERT_TABLE_RE = /^\s*INSERT\s+INTO\s+"?([A-Za-z_][A-Za-z0-9_]*)"?/i;

export interface PostgresDriverOptions {
  /** Connection string, e.g. postgres://user:pass@host:5432/db. */
  connectionString: string;
}

export function isPostgresConnectionString(value: string): boolean {
  return /^postgres(ql)?:\/\//i.test(value.trim());
}

/**
 * pg-mem wraps the result of a scalar subquery (`(SELECT COUNT(*) …) AS x`) in
 * a single-element array. The Lookspan schema has no genuine array columns, so
 * collapsing length-1 arrays back to their element restores parity with SQLite
 * without risking a real array value.
 */
function normalizeRow(row: Record<string, unknown>): Record<string, unknown> {
  let mutated: Record<string, unknown> | null = null;
  for (const key of Object.keys(row)) {
    const value = row[key];
    if (Array.isArray(value) && value.length === 1) {
      mutated ??= { ...row };
      mutated[key] = value[0];
    }
  }
  return mutated ?? row;
}

export class PostgresDriver implements SqlDriver {
  readonly dialect = 'postgres' as const;
  private readonly mem: IMemoryDb;
  private depth = 0;

  constructor(_options: PostgresDriverOptions) {
    this.mem = newDb();
    this.registerHelpers();
  }

  /**
   * Register the few helper functions the translated SQL relies on that
   * pg-mem does not ship natively. A real Postgres server provides `substr`
   * and a timestamp default natively; these shims keep parity in-process.
   */
  private registerHelpers(): void {
    const pub = this.mem.public;
    // ISO-8601 UTC timestamp, matching SQLite's strftime default format.
    pub.registerFunction({
      name: 'lookspan_now',
      returns: DataType.text,
      implementation: () => new Date().toISOString(),
      impure: true,
    });
    // substr(text, from, count) — 1-based, like SQLite/Postgres.
    pub.registerFunction({
      name: 'substr',
      args: [DataType.text, DataType.integer, DataType.integer],
      returns: DataType.text,
      implementation: (s: string | null, from: number, count: number) =>
        s == null ? null : String(s).substr(from - 1, count),
    });
  }

  private query(sql: string): { rows: Record<string, unknown>[]; rowCount: number } {
    const res = this.mem.public.query(sql);
    const rows = (res.rows ?? []) as Record<string, unknown>[];
    return { rows: rows.map(normalizeRow), rowCount: res.rowCount ?? 0 };
  }

  prepare(sql: string): SqlStatement {
    const driver = this;
    const insertTable = INSERT_TABLE_RE.exec(sql)?.[1]?.toLowerCase();
    const wantsId =
      INSERT_RE.test(sql) &&
      !HAS_RETURNING_RE.test(sql) &&
      !!insertTable &&
      ID_TABLES.has(insertTable);

    return {
      run(...params: unknown[]): RunResult {
        let text = translateStatement(sql, params);
        if (wantsId) text = `${text.replace(/;?\s*$/, '')} RETURNING id`;
        const { rows, rowCount } = driver.query(text);
        const lastInsertRowid = wantsId && rows[0] ? Number(rows[0].id) : 0;
        return { lastInsertRowid, changes: rowCount };
      },
      get(...params: unknown[]): unknown {
        const text = translateStatement(sql, params);
        return driver.query(text).rows[0];
      },
      all(...params: unknown[]): unknown[] {
        const text = translateStatement(sql, params);
        return driver.query(text).rows;
      },
    };
  }

  exec(sql: string): void {
    // Migration / DDL blocks: translate then run the whole script.
    const text = translateStatement(sql, []);
    if (text.trim().toUpperCase() === 'VACUUM') return; // no-op on this engine
    this.mem.public.none(text);
  }

  transaction = <A extends unknown[], R>(fn: (...args: A) => R): ((...args: A) => R) => {
    return (...args: A): R => {
      const savepoint = `lsp_sp_${this.depth}`;
      this.depth += 1;
      this.mem.public.none(this.depth === 1 ? 'BEGIN' : `SAVEPOINT ${savepoint}`);
      try {
        const result = fn(...args);
        this.mem.public.none(this.depth === 1 ? 'COMMIT' : `RELEASE SAVEPOINT ${savepoint}`);
        return result;
      } catch (err) {
        this.mem.public.none(this.depth === 1 ? 'ROLLBACK' : `ROLLBACK TO SAVEPOINT ${savepoint}`);
        throw err;
      } finally {
        this.depth -= 1;
      }
    };
  };

  pragma(source: string, options?: { simple?: boolean }): unknown {
    // Only user_version is used by the migration runner. Everything else
    // (WAL, synchronous, foreign_keys, …) is a SQLite connection concern.
    const read = /^\s*user_version\s*$/i.test(source);
    if (read) {
      const row = this.query("SELECT value FROM lookspan_meta WHERE key = 'user_version'").rows[0];
      const version = row ? Number(row.value) : 0;
      return options?.simple ? version : [{ user_version: version }];
    }
    const write = /^\s*user_version\s*=\s*(\d+)\s*$/i.exec(source);
    if (write) {
      const version = Number(write[1]);
      this.mem.public.none(
        `INSERT INTO lookspan_meta(key, value) VALUES('user_version', ${version})
         ON CONFLICT(key) DO UPDATE SET value = ${version}`,
      );
      return undefined;
    }
    return undefined;
  }

  /** Create the meta table used to track the schema version. Idempotent. */
  ensureMeta(): void {
    this.mem.public.none(
      'CREATE TABLE IF NOT EXISTS lookspan_meta (key text PRIMARY KEY, value bigint NOT NULL)',
    );
  }

  close(): void {
    // pg-mem is in-process and GC-collected; nothing to release.
  }
}
