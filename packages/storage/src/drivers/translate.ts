/**
 * Translate the SQLite-flavoured SQL the repositories emit into Postgres SQL.
 *
 * The repositories speak one SQL dialect (SQLite's). Rather than fork every
 * query, we translate at the driver boundary. The translation is deliberately
 * narrow: it only covers the constructs Lookspan actually uses, all of which
 * are exercised by the repository test-suite running against this driver.
 *
 * Two responsibilities:
 *   1. Rewrite dialect differences (`INSERT OR IGNORE`, `AUTOINCREMENT`, …).
 *   2. Bind params. better-sqlite3 supports `@name` and positional `?`; the
 *      synchronous pg-mem backend takes a plain SQL string, so we inline the
 *      values as safely-quoted literals.
 */

/** Quote a JS value as a Postgres SQL literal. */
export function quoteLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`cannot bind non-finite number: ${value}`);
    return String(value);
  }
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (value instanceof Date) return `'${value.toISOString()}'`;
  // Everything else is treated as text. Escape single quotes by doubling them.
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return `'${text.replace(/'/g, "''")}'`;
}

/**
 * Rewrite the static (param-free) portions of a statement from SQLite dialect
 * to Postgres dialect. Idempotent for already-portable SQL.
 */
export function translateDdl(sql: string): string {
  let out = sql;

  // Auto-increment integer PK → Postgres identity column.
  out = out.replace(
    /\bINTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT\b/gi,
    'BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY',
  );

  // SQLite REAL → Postgres double precision.
  out = out.replace(/\bREAL\b/gi, 'DOUBLE PRECISION');

  // strftime(...) default for created_at columns → portable now() helper.
  // Matches: DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  out = out.replace(/DEFAULT\s*\(\s*strftime\([^)]*\)\s*\)/gi, 'DEFAULT lookspan_now()');

  // INSERT OR IGNORE → INSERT ... ON CONFLICT DO NOTHING (appended later).
  // Marked here; the ON CONFLICT clause is added in translateStatement so it
  // lands after the VALUES list.
  out = out.replace(/\bINSERT\s+OR\s+IGNORE\s+INTO\b/gi, 'INSERT INTO');

  // Postgres folds unquoted identifiers to lower-case, so `... AS sessionId`
  // would come back as `sessionid` and break the row mappers (SQLite preserves
  // the case). Double-quote any mixed-case `AS <alias>` so the column name
  // survives. Double-quoting is accepted identically by SQLite, so this stays
  // dialect-neutral.
  out = out.replace(/\bAS\s+([A-Za-z_][A-Za-z0-9_]*)/g, (match, alias: string) => {
    if (alias === alias.toLowerCase() || alias === alias.toUpperCase()) return match;
    return `AS "${alias}"`;
  });

  return out;
}

/** True when the statement was an `INSERT OR IGNORE` needing a conflict clause. */
export function isInsertOrIgnore(sql: string): boolean {
  return /\bINSERT\s+OR\s+IGNORE\s+INTO\b/i.test(sql);
}

/**
 * Bind params into a SQL string, producing Postgres-ready SQL with inlined
 * literals. Handles both `@name` (object params) and `?` (positional params).
 */
export function bindParams(sql: string, params: unknown[]): string {
  // Named-param object form: a single object argument that is not an array.
  const named =
    params.length === 1 &&
    params[0] !== null &&
    typeof params[0] === 'object' &&
    !Array.isArray(params[0]);

  if (named) {
    const obj = params[0] as Record<string, unknown>;
    return sql.replace(/@([A-Za-z_][A-Za-z0-9_]*)/g, (_m, name: string) => {
      if (!(name in obj)) throw new Error(`missing bind param: @${name}`);
      return quoteLiteral(obj[name]);
    });
  }

  // Positional `?` form.
  let i = 0;
  return sql.replace(/\?/g, () => {
    if (i >= params.length) throw new Error('not enough positional params');
    return quoteLiteral(params[i++]);
  });
}

/**
 * Full translation of a runtime statement: dialect rewrite + param binding +
 * `ON CONFLICT DO NOTHING` for `INSERT OR IGNORE`.
 */
export function translateStatement(sql: string, params: unknown[]): string {
  const orIgnore = isInsertOrIgnore(sql);
  let out = translateDdl(sql);
  out = bindParams(out, params);
  if (orIgnore) {
    out = `${out.replace(/;?\s*$/, '')} ON CONFLICT DO NOTHING`;
  }
  return out;
}
