import { clearListeners, type LookspanEvent, subscribe } from '@lookspan/events';
import { type LookspanDatabase, migrate, openDatabase, TracesRepository } from '@lookspan/storage';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Collector } from './collector.js';

let db: LookspanDatabase;
let collector: Collector;

beforeEach(() => {
  db = openDatabase({ path: ':memory:' });
  migrate(db);
  collector = new Collector({ db });
});

afterEach(() => {
  clearListeners();
  db.close();
});

function span(overrides: Record<string, unknown> = {}) {
  return {
    traceId: 'tr_1',
    spanId: 'sp_1',
    parentSpanId: null,
    type: 'llm_call',
    name: 'root.completion',
    startedAt: '2026-06-01T10:00:00Z',
    endedAt: '2026-06-01T10:00:01Z',
    status: 'ok',
    framework: 'custom',
    ...overrides,
  };
}

describe('Collector.ingest', () => {
  it('accepts a valid span and persists the trace (FK placeholder works)', () => {
    const res = collector.ingest({ spans: [span()] });
    expect(res.accepted).toBe(1);
    expect(res.rejected).toBe(0);

    const trace = new TracesRepository(db).getById('tr_1');
    expect(trace).not.toBeNull();
    expect(trace?.rootName).toBe('root.completion');
    expect(trace?.spanCount).toBe(1);
    expect(trace?.durationMs).toBe(1000);
  });

  it('reports per-span rejections without dropping valid spans', () => {
    const res = collector.ingest({
      spans: [span(), span({ spanId: 'sp_2', type: 'not_a_type' })],
    });
    expect(res.accepted).toBe(1);
    expect(res.rejected).toBe(1);
    expect(res.errors?.[0].index).toBe(1);
  });

  it('inserts child spans whose parent arrives in the same batch', () => {
    const res = collector.ingest({
      spans: [
        span(),
        span({ spanId: 'sp_2', parentSpanId: 'sp_1', name: 'child', type: 'tool_call' }),
      ],
    });
    expect(res.accepted).toBe(2);
    const trace = new TracesRepository(db).getById('tr_1');
    expect(trace?.spanCount).toBe(2);
    // root_name comes from the parent-less span
    expect(trace?.rootName).toBe('root.completion');
  });

  it('marks the trace as error when any span errored', () => {
    collector.ingest({
      spans: [span(), span({ spanId: 'sp_2', status: 'error', error: { message: 'boom' } })],
    });
    const trace = new TracesRepository(db).getById('tr_1');
    expect(trace?.status).toBe('error');
    expect(trace?.errorCount).toBe(1);
  });

  it('aggregates token usage and computed cost onto the trace', () => {
    collector.ingest({
      spans: [
        span({
          model: 'claude-sonnet-4-6',
          provider: 'anthropic',
          usage: { inputTokens: 1_000_000, outputTokens: 1_000_000, costUsd: 0 },
        }),
      ],
    });
    const trace = new TracesRepository(db).getById('tr_1');
    // claude-sonnet-4: $3 in + $15 out per 1M
    expect(trace?.costUsd).toBe(18);
    expect(trace?.totalUsage.inputTokens).toBe(1_000_000);
  });

  it('returns accepted:0 when every span is invalid', () => {
    const res = collector.ingest({ spans: [span({ type: 'bogus' })] });
    expect(res.accepted).toBe(0);
    expect(res.rejected).toBe(1);
  });

  it('emits span.ingested and trace.updated events', () => {
    const events: LookspanEvent[] = [];
    subscribe((e) => events.push(e));
    collector.ingest({ spans: [span()] });

    const types = events.map((e) => e.type);
    expect(types).toContain('trace.updated');
    expect(types).toContain('span.ingested');
  });

  it('upserts a span by spanId rather than duplicating it', () => {
    collector.ingest({ spans: [span({ endedAt: null, status: 'ok' })] });
    collector.ingest({ spans: [span({ endedAt: '2026-06-01T10:00:02Z' })] });
    const trace = new TracesRepository(db).getById('tr_1');
    expect(trace?.spanCount).toBe(1);
    expect(trace?.durationMs).toBe(2000);
  });

  it('rolls back the trace placeholder when the span insert fails (atomic ingest)', () => {
    // redact:false so a circular `input` survives to the DB layer, where
    // JSON.stringify throws — failing the insert *after* the trace placeholder
    // would have been seeded. With seed+insert in one transaction, nothing is
    // left behind.
    const raw = new Collector({ db, redact: false });
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() =>
      raw.ingest({ spans: [span({ traceId: 'tr_atomic', input: circular })] }),
    ).toThrow();
    expect(new TracesRepository(db).getById('tr_atomic')).toBeNull(); // no orphan placeholder
  });

  it('rejects an oversized span but keeps valid ones in the same batch', () => {
    const big = 'x'.repeat(2000);
    const small = new Collector({ db, maxSpanBytes: 1000 });
    const res = small.ingest({
      spans: [span(), span({ spanId: 'sp_big', traceId: 'tr_big', output: big })],
    });
    expect(res.accepted).toBe(1);
    expect(res.rejected).toBe(1);
    expect(res.errors?.[0].index).toBe(1);
    expect(res.errors?.[0].reason).toMatch(/per-span limit/);
    expect(new TracesRepository(db).getById('tr_big')).toBeNull(); // oversized span not stored
  });

  it('disables the per-span size limit when maxSpanBytes is 0', () => {
    const unbounded = new Collector({ db, maxSpanBytes: 0 });
    const res = unbounded.ingest({ spans: [span({ output: 'y'.repeat(50_000) })] });
    expect(res.accepted).toBe(1);
  });

  it('rejects a batch that exceeds the span limit', () => {
    const small = new Collector({ db, maxSpansPerBatch: 3 });
    const spans = Array.from({ length: 5 }, (_, i) => span({ spanId: `sp_${i}` }));
    const res = small.ingest({ spans });
    expect(res.accepted).toBe(0);
    expect(res.rejected).toBe(5);
    expect(res.errors?.[0].reason).toMatch(/exceeds the limit/);
    expect(new TracesRepository(db).getById('tr_1')).toBeNull(); // nothing persisted
  });
});

describe('ingest on the Postgres driver', () => {
  // The bug this covers: `insertMany` opens its own transaction, so the
  // collector's seed-and-insert wrapper nests one. The Postgres driver used to
  // emit a SAVEPOINT for the inner block, which pg-mem cannot even parse — so
  // *every* write to a Postgres-backed Lookspan failed with a 400 that blamed
  // the caller's payload. The parity suite missed it because it only ever
  // called repositories at the top level, never inside a transaction.
  let pg: LookspanDatabase;
  let pgCollector: Collector;

  beforeEach(() => {
    pg = openDatabase({ path: 'postgres://lookspan:lookspan@localhost:5432/lookspan_test' });
    migrate(pg);
    pgCollector = new Collector({ db: pg });
  });
  afterEach(() => pg.close());

  it('accepts a span and aggregates its trace', () => {
    const res = pgCollector.ingest({ spans: [span()] });

    expect(res.rejected).toBe(0);
    expect(res.accepted).toBe(1);
    const trace = new TracesRepository(pg).getById('tr_1');
    expect(trace).not.toBeNull();
    expect(trace?.spanCount).toBe(1);
  });

  it('accepts a multi-span batch', () => {
    const res = pgCollector.ingest({
      spans: [span({ spanId: 'a' }), span({ spanId: 'b' }), span({ spanId: 'c' })],
    });

    expect(res.accepted).toBe(3);
    expect(new TracesRepository(pg).getById('tr_1')?.spanCount).toBe(3);
  });

  it('upserts a repeated span id instead of duplicating it, same as SQLite', () => {
    pgCollector.ingest({ spans: [span({ spanId: 'dup', name: 'primero' })] });
    pgCollector.ingest({ spans: [span({ spanId: 'dup', name: 'segundo' })] });

    const sqlite = new Collector({ db });
    sqlite.ingest({ spans: [span({ spanId: 'dup', name: 'primero' })] });
    sqlite.ingest({ spans: [span({ spanId: 'dup', name: 'segundo' })] });

    expect(new TracesRepository(pg).getById('tr_1')?.spanCount).toBe(1);
    expect(new TracesRepository(pg).getById('tr_1')?.spanCount).toBe(
      new TracesRepository(db).getById('tr_1')?.spanCount,
    );
  });
});
