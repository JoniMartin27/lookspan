/**
 * Synchronous SQL driver abstraction shared by every Lookspan repository.
 *
 * The repositories were originally written directly against better-sqlite3's
 * synchronous API. This interface captures exactly the surface they use so we
 * can back it with either SQLite (the default) or Postgres without touching a
 * single repository or any of the synchronous callers in the API/collector.
 *
 * Param binding mirrors better-sqlite3: a statement accepts either a single
 * object of named params (`@name` placeholders) OR positional args (`?`
 * placeholders). Drivers normalise both to their native dialect.
 */

export type SqlDialect = 'sqlite' | 'postgres';

/** Result of a write statement, matching better-sqlite3's `RunResult`. */
export interface RunResult {
  /** Auto-increment id of the last inserted row (0 when not applicable). */
  lastInsertRowid: number | bigint;
  /** Number of rows the statement changed. */
  changes: number;
}

/** A prepared, reusable statement. Bindings are passed per-execution. */
export interface SqlStatement {
  /** Run a write (INSERT/UPDATE/DELETE) and return row counts / last id. */
  run(...params: unknown[]): RunResult;
  /** Fetch the first matching row, or `undefined` when there is none. */
  get(...params: unknown[]): unknown;
  /** Fetch every matching row. */
  all(...params: unknown[]): unknown[];
}

/**
 * A callable transaction wrapper, matching better-sqlite3's `transaction()`:
 * `db.transaction(fn)` returns a function that runs `fn` inside a transaction
 * (or a SAVEPOINT when already inside one) and returns its result.
 */
export type TransactionFn = <A extends unknown[], R>(fn: (...args: A) => R) => (...args: A) => R;

/**
 * The synchronous database handle every repository depends on. Both the
 * SQLite and Postgres drivers implement this identically from the caller's
 * point of view.
 */
export interface SqlDriver {
  readonly dialect: SqlDialect;
  prepare(sql: string): SqlStatement;
  exec(sql: string): void;
  transaction: TransactionFn;
  /**
   * SQLite-style pragma. On Postgres this only services the two pragmas the
   * codebase actually uses: reading/writing the schema version
   * (`user_version`). Connection pragmas (WAL etc.) are no-ops on Postgres.
   */
  pragma(source: string, options?: { simple?: boolean }): unknown;
  close(): void;
}
