/**
 * `pragma()` interpolates its argument into a statement that SQLite runs
 * verbatim, and PRAGMA can read metadata, change database behaviour and, on
 * some builds, load extensions. Nothing external reaches it today — the only
 * caller is `migrations.ts` with literals — but the method is exported on a
 * driver interface, so both drivers refuse anything but the schema version.
 */
import { describe, expect, it } from 'vitest';
import { type LookspanDatabase, openDatabase, setSchemaVersion } from '../index.js';

const abrir = (): LookspanDatabase => openDatabase({ path: ':memory:' });

const PELIGROSOS = [
  'journal_mode = DELETE',
  'foreign_keys = OFF',
  'user_version; PRAGMA foreign_keys = OFF',
  'user_version = 1; PRAGMA journal_mode = DELETE',
  'table_info(traces)',
  '',
];

describe('the driver only lets the schema-version pragma through', () => {
  it('reads user_version', () => {
    const db = abrir();
    expect(() => db.pragma('user_version', { simple: true })).not.toThrow();
    db.close();
  });

  it('writes user_version', () => {
    const db = abrir();
    db.pragma('user_version = 3');
    expect(db.pragma('user_version', { simple: true })).toBe(3);
    db.close();
  });

  for (const source of PELIGROSOS) {
    it(`refuses ${JSON.stringify(source)}`, () => {
      const db = abrir();
      expect(() => db.pragma(source)).toThrow(/only user_version is allowed/);
      db.close();
    });
  }

  it('a chained statement runs nothing at all', () => {
    const db = abrir();
    db.pragma('user_version = 4');
    // The rejected call starts with a legitimate write; if it were passed
    // through, the version would have moved before the second statement ran.
    expect(() => db.pragma('user_version = 9; PRAGMA foreign_keys = OFF')).toThrow();
    expect(db.pragma('user_version', { simple: true })).toBe(4);
    db.close();
  });
});

describe('setSchemaVersion', () => {
  it('accepts a plain integer', () => {
    const db = abrir();
    setSchemaVersion(db, 7);
    expect(db.pragma('user_version', { simple: true })).toBe(7);
    db.close();
  });

  for (const bad of [1.5, -1, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 60]) {
    it(`refuses ${bad}`, () => {
      const db = abrir();
      expect(() => setSchemaVersion(db, bad)).toThrow(/invalid schema version/);
      db.close();
    });
  }
});
