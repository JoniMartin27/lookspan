import { clearListeners, type LookspanEvent, subscribe } from '@lookspan/events';
import { AlertsRepository, type LookspanDatabase, migrate, openDatabase } from '@lookspan/storage';
import { AlertCondition } from '@lookspan/types';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Collector } from './collector.js';

let db: LookspanDatabase;

beforeEach(() => {
  db = openDatabase({ path: ':memory:' });
  migrate(db);
});
afterEach(() => {
  clearListeners();
  db.close();
});

function errorSpan(traceId: string) {
  return {
    traceId,
    spanId: `${traceId}_s`,
    parentSpanId: null,
    type: 'llm_call',
    name: 'failing.call',
    startedAt: '2026-06-01T10:00:00Z',
    endedAt: '2026-06-01T10:00:01Z',
    status: 'error',
    framework: 'custom',
  };
}

describe('Collector alerting', () => {
  it('does not alert when no rules are configured', () => {
    const c = new Collector({ db });
    c.ingest({ spans: [errorSpan('t1')] });
    expect(new AlertsRepository(db).list()).toHaveLength(0);
  });

  it('persists and emits an alert when a rule matches', () => {
    const events: LookspanEvent[] = [];
    subscribe((e) => events.push(e));

    const c = new Collector({ db, alertRules: [{ id: 'error', condition: AlertCondition.Error }] });
    c.ingest({ spans: [errorSpan('t1')] });

    const stored = new AlertsRepository(db).list();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ ruleId: 'error', traceId: 't1', condition: 'error' });

    const alertEvents = events.filter((e) => e.type === 'alert.triggered');
    expect(alertEvents).toHaveLength(1);
  });

  it('does not duplicate an alert across re-ingests of the same trace', () => {
    const c = new Collector({ db, alertRules: [{ id: 'error', condition: AlertCondition.Error }] });
    c.ingest({ spans: [errorSpan('t1')] });
    c.ingest({ spans: [errorSpan('t1')] }); // upsert, same trace
    expect(new AlertsRepository(db).list()).toHaveLength(1);
  });
});
