import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { ExternalPostgresDriver } from './drivers/external-postgres.js';
import { isPostgresConnectionString, PostgresDriver } from './drivers/postgres.js';
import { SqliteDriver } from './drivers/sqlite.js';
import type { SqlDriver } from './drivers/types.js';

/**
 * The synchronous database handle used throughout Lookspan. Historically this
 * was better-sqlite3's `Database`; it is now the dialect-agnostic
 * {@link SqlDriver}, satisfied by both the SQLite (default) and external
 * Postgres drivers. Repositories are unchanged.
 */
export type LookspanDatabase = SqlDriver;

export type { RunResult, SqlDialect, SqlDriver, SqlStatement } from './drivers/types.js';

export interface OpenDatabaseOptions {
  /**
   * SQLite file path (default) OR a Postgres connection string
   * (`postgres://…` / `postgresql://…`). Selects the driver automatically.
   */
  path?: string;
  readonly?: boolean;
  fileMustExist?: boolean;
  /** Use the in-memory dialect harness only for tests; production defaults to the wire client. */
  postgresMode?: 'external' | 'memory';
  /** Worker wait bound, exposed for deterministic driver tests. */
  postgresTimeoutMs?: number;
}

export function defaultDatabasePath(): string {
  return resolve(homedir(), '.lookspan', 'lookspan.db');
}

/** True when `path` selects the Postgres driver rather than SQLite. */
export function isPostgresTarget(path: string): boolean {
  return isPostgresConnectionString(path);
}

export function openDatabase(options: OpenDatabaseOptions = {}): LookspanDatabase {
  const path = options.path ?? defaultDatabasePath();

  if (isPostgresConnectionString(path)) {
    const driver =
      options.postgresMode === 'memory'
        ? new PostgresDriver({ connectionString: path })
        : new ExternalPostgresDriver({
            connectionString: path,
            timeoutMs: options.postgresTimeoutMs,
          });
    driver.ensureMeta();
    return driver;
  }

  return new SqliteDriver({
    path,
    readonly: options.readonly,
    fileMustExist: options.fileMustExist,
  });
}

export function closeDatabase(db: LookspanDatabase): void {
  db.close();
}
