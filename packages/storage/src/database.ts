import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import Database from 'better-sqlite3';

export type LookspanDatabase = Database.Database;

export interface OpenDatabaseOptions {
  path?: string;
  readonly?: boolean;
  fileMustExist?: boolean;
}

export function defaultDatabasePath(): string {
  return resolve(homedir(), '.lookspan', 'lookspan.db');
}

export function openDatabase(options: OpenDatabaseOptions = {}): LookspanDatabase {
  const path = options.path ?? defaultDatabasePath();
  if (!options.readonly) {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new Database(path, {
    readonly: options.readonly ?? false,
    fileMustExist: options.fileMustExist ?? false,
  });
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('temp_store = MEMORY');
  db.pragma('mmap_size = 268435456');
  return db;
}

export function closeDatabase(db: LookspanDatabase): void {
  db.close();
}
