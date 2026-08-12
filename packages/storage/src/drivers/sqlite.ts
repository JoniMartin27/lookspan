import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import type { RunResult, SqlDriver, SqlStatement } from './types.js';

export interface SqliteDriverOptions {
  path: string;
  readonly?: boolean;
  fileMustExist?: boolean;
}

/**
 * The default driver: a thin pass-through over better-sqlite3. Behaviour is
 * identical to using better-sqlite3 directly — the wrapper exists only so the
 * Postgres driver can satisfy the same {@link SqlDriver} interface.
 */
export class SqliteDriver implements SqlDriver {
  readonly dialect = 'sqlite' as const;
  private readonly db: Database.Database;

  constructor(options: SqliteDriverOptions) {
    if (!options.readonly && options.path !== ':memory:') {
      mkdirSync(dirname(options.path), { recursive: true });
    }
    this.db = new Database(options.path, {
      readonly: options.readonly ?? false,
      fileMustExist: options.fileMustExist ?? false,
    });
    if (options.path !== ':memory:') {
      this.db.pragma('journal_mode = WAL');
    }
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('temp_store = MEMORY');
    this.db.pragma('mmap_size = 268435456');
  }

  prepare(sql: string): SqlStatement {
    const stmt = this.db.prepare(sql);
    return {
      run: (...params: unknown[]): RunResult => {
        const info = stmt.run(...(params as never[]));
        return { lastInsertRowid: info.lastInsertRowid, changes: info.changes };
      },
      get: (...params: unknown[]): unknown => stmt.get(...(params as never[])),
      all: (...params: unknown[]): unknown[] => stmt.all(...(params as never[])),
    };
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  transaction = <A extends unknown[], R>(fn: (...args: A) => R): ((...args: A) => R) => {
    return this.db.transaction(fn) as (...args: A) => R;
  };

  /**
   * Only the schema-version pragma is allowed through this interface.
   *
   * The argument is interpolated into a PRAGMA statement, which `better-sqlite3`
   * runs verbatim — and PRAGMA can read metadata, change database behaviour and,
   * on some builds, load extensions. Every caller today passes a literal
   * (`migrations.ts` is the only one), so nothing external reaches it, but the
   * method is exported on a driver interface and a future caller might be less
   * careful. The Postgres driver already accepts exactly these two shapes, so
   * whitelisting here also keeps the two drivers honest about being equivalent.
   *
   * Connection pragmas (WAL, synchronous, foreign_keys) are set in the
   * constructor against the underlying handle and never come through here.
   */
  pragma(source: string, options?: { simple?: boolean }): unknown {
    const allowed = /^\s*user_version\s*(=\s*\d+\s*)?$/i.test(source);
    if (!allowed) {
      throw new Error(
        `refusing to run pragma "${source}": only user_version is allowed through the driver`,
      );
    }
    return this.db.pragma(source, options);
  }

  close(): void {
    this.db.close();
  }
}
