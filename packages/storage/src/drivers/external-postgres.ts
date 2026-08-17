import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TextDecoder, TextEncoder } from 'node:util';
import { Worker } from 'node:worker_threads';
import { translateStatement } from './translate.js';
import type { RunResult, SqlDriver, SqlStatement } from './types.js';

const INSERT_RE = /^\s*INSERT\s+INTO\b/i;
const HAS_RETURNING_RE = /\bRETURNING\b/i;
const ID_TABLES = new Set(['alerts', 'scores', 'dataset_items', 'runs', 'run_items', 'replays']);
const INSERT_TABLE_RE = /^\s*INSERT\s+INTO\s+"?([A-Za-z_][A-Za-z0-9_]*)"?/i;
const REQUEST_BYTES = 4 * 1024 * 1024;
const RESPONSE_BYTES = 64 * 1024 * 1024;

export interface ExternalPostgresDriverOptions {
  connectionString: string;
  timeoutMs?: number;
}

interface QueryResponse {
  ok: boolean;
  rows?: Record<string, unknown>[];
  rowCount?: number;
  error?: string;
}

/**
 * Synchronous facade over node-postgres.
 *
 * Lookspan's repositories deliberately expose better-sqlite3's synchronous
 * API. A real PostgreSQL wire client is asynchronous, so this driver keeps a
 * single pg Client in a worker thread and uses a SharedArrayBuffer for the
 * request/response hand-off. The main thread remains synchronous to callers,
 * while the network socket and pg event loop stay off the API thread.
 */
export class ExternalPostgresDriver implements SqlDriver {
  readonly dialect = 'postgres' as const;
  private readonly worker: Worker;
  private readonly control: Int32Array;
  private readonly request: Uint8Array;
  private readonly response: Uint8Array;
  private readonly requestEncoder = new TextEncoder();
  private readonly responseDecoder = new TextDecoder();
  private depth = 0;
  private closed = false;
  private workerError: Error | undefined;
  private readonly timeoutMs: number;

  constructor(options: ExternalPostgresDriverOptions) {
    this.timeoutMs = options.timeoutMs ?? 15_000;
    const controlBuffer = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * 2);
    const requestBuffer = new SharedArrayBuffer(REQUEST_BYTES);
    const responseBuffer = new SharedArrayBuffer(RESPONSE_BYTES);
    this.control = new Int32Array(controlBuffer);
    this.request = new Uint8Array(requestBuffer);
    this.response = new Uint8Array(responseBuffer);
    const bundledWorkerUrl = new URL('./external-postgres-worker.js', import.meta.url);
    const compiledSourceWorkerUrl = new URL(
      '../../dist/drivers/external-postgres-worker.js',
      import.meta.url,
    );
    const sourceWorkerUrl = new URL('./external-postgres-worker.ts', import.meta.url);
    const workerUrl = existsSync(fileURLToPath(bundledWorkerUrl))
      ? bundledWorkerUrl
      : existsSync(fileURLToPath(compiledSourceWorkerUrl))
        ? compiledSourceWorkerUrl
        : sourceWorkerUrl;
    this.worker = new Worker(workerUrl, {
      execArgv: process.execArgv,
      workerData: {
        connectionString: options.connectionString,
        controlBuffer,
        requestBuffer,
        responseBuffer,
      },
    });
    this.worker.on('error', (error) => {
      this.workerError = error instanceof Error ? error : new Error(String(error));
    });
    this.worker.unref();
  }

  private call(message: { op: 'query' | 'close'; sql?: string }): QueryResponse {
    if (this.closed) throw new Error('Postgres driver is closed');
    if (this.workerError) throw new Error(`Postgres worker failed: ${this.workerError.message}`);
    const bytes = this.requestEncoder.encode(JSON.stringify(message));
    if (bytes.length > this.request.byteLength) {
      throw new Error('Postgres request exceeded worker buffer');
    }
    this.request.set(bytes);
    Atomics.store(this.control, 1, bytes.length);
    Atomics.store(this.control, 0, 0);
    try {
      this.worker.postMessage(null);
    } catch (error) {
      this.closed = true;
      throw error;
    }
    if (Atomics.wait(this.control, 0, 0, this.timeoutMs) === 'timed-out') {
      this.closed = true;
      void this.worker.terminate();
      throw new Error(`Postgres worker timed out after ${this.timeoutMs}ms`);
    }
    const length = Atomics.load(this.control, 1);
    const result = JSON.parse(
      this.responseDecoder.decode(this.response.subarray(0, length)),
    ) as QueryResponse;
    if (!result.ok) throw new Error(result.error ?? 'Postgres query failed');
    return result;
  }

  private query(sql: string): QueryResponse {
    return this.call({ op: 'query', sql });
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
        const result = driver.query(text);
        const rawId = wantsId ? result.rows?.[0]?.id : undefined;
        const lastInsertRowid =
          typeof rawId === 'bigint'
            ? rawId
            : typeof rawId === 'number'
              ? rawId
              : typeof rawId === 'string'
                ? Number.isSafeInteger(Number(rawId))
                  ? Number(rawId)
                  : BigInt(rawId)
                : 0;
        return { lastInsertRowid, changes: result.rowCount ?? 0 };
      },
      get(...params: unknown[]): unknown {
        return driver.query(translateStatement(sql, params)).rows?.[0];
      },
      all(...params: unknown[]): unknown[] {
        return driver.query(translateStatement(sql, params)).rows ?? [];
      },
    };
  }

  exec(sql: string): void {
    this.query(translateStatement(sql, []));
  }

  transaction = <A extends unknown[], R>(fn: (...args: A) => R): ((...args: A) => R) => {
    return (...args: A): R => {
      if (this.depth > 0) {
        this.depth += 1;
        try {
          return fn(...args);
        } finally {
          this.depth -= 1;
        }
      }

      this.query('BEGIN');
      this.depth = 1;
      try {
        const result = fn(...args);
        this.query('COMMIT');
        return result;
      } catch (error) {
        try {
          this.query('ROLLBACK');
        } catch {
          // Preserve the original application error if the connection is gone.
        }
        throw error;
      } finally {
        this.depth = 0;
      }
    };
  };

  pragma(source: string, options?: { simple?: boolean }): unknown {
    const read = /^\s*user_version\s*$/i.test(source);
    if (read) {
      const row = this.query("SELECT value FROM lookspan_meta WHERE key = 'user_version'")
        .rows?.[0];
      const version = row ? Number(row.value) : 0;
      return options?.simple ? version : [{ user_version: version }];
    }
    const write = /^\s*user_version\s*=\s*(\d+)\s*$/i.exec(source);
    if (write) {
      const version = Number(write[1]);
      this.query(
        `INSERT INTO lookspan_meta(key, value) VALUES('user_version', ${version})
         ON CONFLICT(key) DO UPDATE SET value = ${version}`,
      );
      return undefined;
    }
    throw new Error(`refusing to run pragma "${source}": only user_version is supported`);
  }

  ensureMeta(): void {
    this.exec(`
      CREATE OR REPLACE FUNCTION lookspan_now()
      RETURNS text
      LANGUAGE SQL
      VOLATILE
      AS $$ SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') $$
    `);
    this.exec(
      'CREATE TABLE IF NOT EXISTS lookspan_meta (key text PRIMARY KEY, value bigint NOT NULL)',
    );
  }

  close(): void {
    if (this.closed) return;
    this.call({ op: 'close' });
    this.closed = true;
    void this.worker.terminate();
  }
}
