import { describe, expect, it } from 'vitest';
import { openDatabase } from '../database.js';
import { migrate } from '../migrations.js';
import { ExternalPostgresDriver } from './external-postgres.js';

const externalUrl = process.env.LOOKSPAN_TEST_POSTGRES_URL;

describe('external Postgres driver', () => {
  it('bounds a worker startup failure instead of hanging', () => {
    const driver = new ExternalPostgresDriver({
      connectionString: 'postgres://lookspan:lookspan@192.0.2.1:5432/lookspan',
      timeoutMs: 100,
    });
    try {
      expect(() => driver.prepare('SELECT 1').get()).toThrow(/timed out|failed|connect/i);
    } finally {
      driver.close();
    }
  });

  it.skipIf(!externalUrl)('persists rows across driver instances', () => {
    const traceId = `external-driver-test-${process.pid}-${Date.now()}`;
    const first = openDatabase({ path: externalUrl as string });
    try {
      migrate(first);
      first.transaction(() => {
        first
          .prepare(
            `INSERT INTO traces (trace_id, root_name, framework, started_at, status)
             VALUES (?, ?, ?, ?, ?)`,
          )
          .run(traceId, 'external-test', 'custom', new Date().toISOString(), 'ok');
      })();
    } finally {
      first.close();
    }

    const second = openDatabase({ path: externalUrl as string });
    try {
      expect(
        second.prepare('SELECT trace_id, root_name FROM traces WHERE trace_id = ?').get(traceId),
      ).toEqual({
        trace_id: traceId,
        root_name: 'external-test',
      });
      expect(second.prepare('SELECT 9007199254740993::bigint AS value').get()).toEqual({
        value: '9007199254740993',
      });
      expect(() => second.prepare('SELECT pg_terminate_backend(pg_backend_pid())').get()).toThrow();
      expect(second.prepare('SELECT 1 AS value').get()).toEqual({ value: 1 });
      second.prepare('DELETE FROM traces WHERE trace_id = ?').run(traceId);
    } finally {
      second.close();
    }
  });
});
