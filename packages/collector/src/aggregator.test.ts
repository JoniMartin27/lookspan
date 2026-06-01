import { type LookspanDatabase, migrate, openDatabase } from '@lookspan/storage';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isTraceComplete, recomputeTrace } from './aggregator.js';
import { Collector } from './collector.js';

let db: LookspanDatabase;

beforeEach(() => {
  db = openDatabase({ path: ':memory:' });
  migrate(db);
});
afterEach(() => db.close());

describe('recomputeTrace', () => {
  it('returns null for a trace with no spans', () => {
    expect(recomputeTrace(db, 'missing')).toBeNull();
  });

  it('leaves duration null when no span has ended', () => {
    new Collector({ db }).ingest({
      spans: [
        {
          traceId: 'tr_open',
          spanId: 'sp_1',
          parentSpanId: null,
          type: 'agent_step',
          name: 'open',
          startedAt: '2026-06-01T10:00:00Z',
          endedAt: null,
          status: 'ok',
          framework: 'custom',
        },
      ],
    });
    const trace = recomputeTrace(db, 'tr_open');
    expect(trace?.durationMs).toBeNull();
  });
});

describe('isTraceComplete', () => {
  const base = {
    traceId: 't',
    spanId: 's',
    parentSpanId: null,
    type: 'custom' as const,
    name: 'n',
    startedAt: '2026-06-01T10:00:00Z',
    status: 'ok' as const,
    framework: 'custom' as const,
    durationMs: 0,
    receivedAt: '2026-06-01T10:00:00Z',
  };

  it('is false for an empty list', () => {
    expect(isTraceComplete([])).toBe(false);
  });

  it('is false when any span is still open', () => {
    expect(isTraceComplete([{ ...base, endedAt: null }])).toBe(false);
  });

  it('is true when all spans have ended', () => {
    expect(isTraceComplete([{ ...base, endedAt: '2026-06-01T10:00:01Z' }])).toBe(true);
  });
});
