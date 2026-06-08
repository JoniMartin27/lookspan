import { describe, expect, it } from 'vitest';
import {
  bindParams,
  isInsertOrIgnore,
  quoteLiteral,
  translateDdl,
  translateStatement,
} from './translate.js';

describe('quoteLiteral', () => {
  it('renders NULL for null/undefined', () => {
    expect(quoteLiteral(null)).toBe('NULL');
    expect(quoteLiteral(undefined)).toBe('NULL');
  });

  it('renders numbers bare and rejects non-finite', () => {
    expect(quoteLiteral(42)).toBe('42');
    expect(quoteLiteral(1.5)).toBe('1.5');
    expect(() => quoteLiteral(Number.NaN)).toThrow();
    expect(() => quoteLiteral(Number.POSITIVE_INFINITY)).toThrow();
  });

  it('escapes single quotes in strings to prevent injection', () => {
    expect(quoteLiteral("o'brien")).toBe("'o''brien'");
    expect(quoteLiteral("'; DROP TABLE traces; --")).toBe("'''; DROP TABLE traces; --'");
  });

  it('renders booleans and bigints', () => {
    expect(quoteLiteral(true)).toBe('TRUE');
    expect(quoteLiteral(false)).toBe('FALSE');
    expect(quoteLiteral(10n)).toBe('10');
  });
});

describe('translateDdl', () => {
  it('rewrites AUTOINCREMENT integer PK to a Postgres identity column', () => {
    const out = translateDdl('id INTEGER PRIMARY KEY AUTOINCREMENT');
    expect(out).toMatch(/BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY/);
  });

  it('rewrites REAL to DOUBLE PRECISION', () => {
    expect(translateDdl('cost_usd REAL NOT NULL DEFAULT 0')).toContain('DOUBLE PRECISION');
  });

  it('rewrites the strftime created_at default to lookspan_now()', () => {
    const out = translateDdl(
      "created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
    );
    expect(out).toContain('DEFAULT lookspan_now()');
    expect(out).not.toContain('strftime');
  });

  it('strips OR IGNORE from INSERT', () => {
    expect(translateDdl('INSERT OR IGNORE INTO traces (a) VALUES (1)')).toMatch(
      /^INSERT INTO traces/,
    );
  });
});

describe('bindParams', () => {
  it('binds named @params from an object', () => {
    expect(bindParams('SELECT * FROM t WHERE a = @a AND b = @b', [{ a: 1, b: 'x' }])).toBe(
      "SELECT * FROM t WHERE a = 1 AND b = 'x'",
    );
  });

  it('throws on a missing named param', () => {
    expect(() => bindParams('@missing', [{ other: 1 }])).toThrow(/missing bind param/);
  });

  it('binds positional ? params in order', () => {
    expect(bindParams('SELECT * FROM t WHERE a = ? AND b = ?', [1, 'x'])).toBe(
      "SELECT * FROM t WHERE a = 1 AND b = 'x'",
    );
  });

  it('throws when positional params run out', () => {
    expect(() => bindParams('? ?', [1])).toThrow(/not enough positional/);
  });
});

describe('isInsertOrIgnore / translateStatement', () => {
  it('detects INSERT OR IGNORE', () => {
    expect(isInsertOrIgnore('insert or ignore into t (a) values (1)')).toBe(true);
    expect(isInsertOrIgnore('INSERT INTO t (a) VALUES (1)')).toBe(false);
  });

  it('appends ON CONFLICT DO NOTHING for INSERT OR IGNORE', () => {
    const out = translateStatement('INSERT OR IGNORE INTO t (a) VALUES (@a)', [{ a: 1 }]);
    expect(out).toBe('INSERT INTO t (a) VALUES (1) ON CONFLICT DO NOTHING');
  });

  it('leaves a plain insert untouched aside from binding', () => {
    const out = translateStatement('INSERT INTO t (a) VALUES (@a)', [{ a: 2 }]);
    expect(out).toBe('INSERT INTO t (a) VALUES (2)');
  });
});
