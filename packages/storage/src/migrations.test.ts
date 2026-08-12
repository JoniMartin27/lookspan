/**
 * Migrations run against databases that already hold somebody's traces — and
 * nothing here checked that.
 *
 * Every other suite migrates an empty `:memory:` database and only then
 * inserts, so all seven migrations have only ever been exercised against
 * nothing. A future `ALTER TABLE` that recreates a table to change a
 * constraint — the usual way to do it in SQLite — would drop every row and no
 * test would notice.
 *
 * Verified by hand alongside these: a database created by the published 0.4.1,
 * with a trace in it, opened by the current build. Migration 7 applied, the
 * trace came back with its prompt, output and cost intact, and the new
 * per-day rollups worked on it. The downgrade direction too — 0.4.1 reads and
 * writes a v7 database, because migration 7 only adds a nullable column.
 */
import { describe, expect, it } from 'vitest';
import { openDatabase } from './database.js';
import { getCurrentSchemaVersion, MIGRATIONS, migrate, setSchemaVersion } from './migrations.js';

const HEAD = MIGRATIONS[MIGRATIONS.length - 1]?.version ?? 0;

/** Apply migrations up to and including `version`, as an older release would. */
function databaseAt(version: number) {
  const db = openDatabase({ path: ':memory:' });
  for (const m of MIGRATIONS.filter((x) => x.version <= version)) {
    db.exec(m.up);
    setSchemaVersion(db, m.version);
  }
  return db;
}

/** Columns present on `traces` since the very first migration. */
const V1_INSERT = `INSERT INTO traces
  (trace_id, root_name, framework, started_at, status, cost_usd)
  VALUES ('tr_old', 'la traza de alguien', 'custom', '2026-06-01T10:00:00Z', 'ok', 1.25)`;

describe('the migration list itself', () => {
  it('has migrations to check', () => {
    expect(MIGRATIONS.length).toBeGreaterThan(0);
    expect(HEAD).toBe(MIGRATIONS.length);
  });

  it('numbers them uniquely and contiguously from 1', () => {
    // A duplicate number would silently skip a migration for everyone sitting
    // on that version: `migrate()` selects `version > current`, so the second
    // one with the same number never runs for them.
    const versions = MIGRATIONS.map((m) => m.version);
    expect(versions).toEqual([...new Set(versions)]);
    expect(versions).toEqual([...versions].sort((a, b) => a - b));
    expect(versions).toEqual(Array.from({ length: versions.length }, (_, i) => i + 1));
  });

  it('gives every migration a name and something to run', () => {
    for (const m of MIGRATIONS) {
      expect(m.name, `migration ${m.version}`).toBeTruthy();
      expect(m.up.trim().length, `migration ${m.version}`).toBeGreaterThan(0);
    }
  });
});

describe('upgrading a database that already has data', () => {
  for (let from = 1; from < HEAD; from++) {
    it(`keeps the rows when upgrading from v${from}`, () => {
      const db = databaseAt(from);
      db.exec(V1_INSERT);

      const result = migrate(db);

      expect(result.current).toBe(HEAD);
      expect(result.applied).toEqual(Array.from({ length: HEAD - from }, (_, i) => from + i + 1));

      const row = db
        .prepare(`SELECT trace_id, root_name, cost_usd FROM traces WHERE trace_id = 'tr_old'`)
        .get() as { trace_id: string; root_name: string; cost_usd: number } | undefined;
      expect(row, `data lost upgrading from v${from}`).toBeDefined();
      expect(row?.root_name).toBe('la traza de alguien');
      expect(row?.cost_usd).toBe(1.25);
      db.close();
    });
  }

  it('is a no-op the second time, and leaves the data alone', () => {
    const db = openDatabase({ path: ':memory:' });
    migrate(db);
    db.exec(V1_INSERT);

    const again = migrate(db);
    expect(again.applied).toEqual([]);
    expect(again.current).toBe(HEAD);
    expect((db.prepare(`SELECT COUNT(*) AS n FROM traces`).get() as { n: number }).n).toBe(1);
    db.close();
  });

  it('applies nothing to a database from a newer release', () => {
    // Someone keeps an old shortcut, or rolls back after a bad release. The
    // old binary must not try to "upgrade" a schema it does not understand,
    // and must not rewrite the version marker.
    const db = openDatabase({ path: ':memory:' });
    migrate(db);
    setSchemaVersion(db, HEAD + 5);

    const result = migrate(db);
    expect(result.applied).toEqual([]);
    expect(getCurrentSchemaVersion(db)).toBe(HEAD + 5);
    db.close();
  });
});
