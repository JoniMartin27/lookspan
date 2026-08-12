/**
 * Opening a SQLite database must not drag pg-mem in.
 *
 * `postgres.ts` used to import pg-mem at module scope, and `database.ts`
 * imports `postgres.ts` to pick a driver — so every SQLite user, which is
 * everyone by default, paid ~93 ms of a ~293 ms startup and executed 2 MB of
 * code for a driver they never selected. The check runs in a child process
 * because module loading is global and one-way.
 */
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

const storage = pathToFileURL(
  resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist', 'index.js'),
).href;

function pgMemLoadedFor(target: string): string {
  const code = `
    (async () => {
      const { openDatabase } = await import(${JSON.stringify(storage)});
      const db = openDatabase({ path: ${JSON.stringify(target)} });
      const loaded =
        process.moduleLoadList.some((m) => m.includes('pg-mem')) ||
        Object.keys(require('module')._cache).some((k) => k.includes('pg-mem'));
      console.log(loaded ? 'yes' : 'no');
      db.close();
    })();
  `;
  return execFileSync(process.execPath, ['-e', code], { encoding: 'utf8' }).trim();
}

describe('the Postgres engine loads only when it is used', () => {
  it('is not loaded by opening SQLite', () => {
    expect(pgMemLoadedFor(':memory:')).toBe('no');
  });

  it('is loaded by opening a postgres:// target', () => {
    // Guards the other direction: if this said "no" too, the first assertion
    // would be passing for the wrong reason.
    expect(pgMemLoadedFor('postgres://u:p@host/db')).toBe('yes');
  });
});
