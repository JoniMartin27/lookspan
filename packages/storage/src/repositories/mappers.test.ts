/**
 * A span's `framework` must come back exactly as it went in.
 *
 * Reported from a live instance: a real setup exporting from `inferbench`
 * filled the console with one line per row —
 *   [lookspan/storage] invalid span.framework "inferbench" from DB; using "custom"
 * — because ingest accepts any non-empty string while reading checked against a
 * closed enum. The log noise was the visible half; the damaging half was that
 * every one of those traces was reported to the dashboard as `custom`.
 */

import type { Span, Trace } from '@lookspan/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LookspanDatabase } from '../database.js';
import { migrate, openDatabase } from '../index.js';
import { SpansRepository } from './spans.js';
import { TracesRepository } from './traces.js';

let db: LookspanDatabase;
beforeEach(() => {
  db = openDatabase({ path: ':memory:' });
  migrate(db);
});
afterEach(() => db.close());

const trace = (framework: string): Trace => ({
  traceId: 'tr',
  rootName: 'root',
  framework,
  agentId: null,
  sessionId: null,
  parentTraceId: null,
  startedAt: '2026-06-01T10:00:00Z',
  endedAt: '2026-06-01T10:00:01Z',
  durationMs: 1000,
  status: 'ok',
  spanCount: 1,
  errorCount: 0,
  totalUsage: {
    inputTokens: 0,
    outputTokens: 0,
    cachedInputTokens: 0,
    reasoningTokens: 0,
    costUsd: 0,
  },
  costUsd: 0,
  attributes: null,
});

const span = (framework: string): Span => ({
  traceId: 'tr',
  spanId: 'sp',
  parentSpanId: null,
  type: 'llm_call',
  name: 'n',
  startedAt: '2026-06-01T10:00:00Z',
  endedAt: '2026-06-01T10:00:01Z',
  durationMs: 1000,
  status: 'ok',
  framework,
  agentId: null,
  sessionId: null,
  parentTraceId: null,
  model: null,
  provider: null,
  input: null,
  output: null,
  error: null,
  usage: null,
  attributes: null,
  receivedAt: '2026-06-01T10:00:02Z',
});

describe('framework survives the round trip', () => {
  for (const name of ['inferbench', 'mcp', 'mi-framework-raro', 'AgentOS-2']) {
    it(`keeps "${name}"`, () => {
      new TracesRepository(db).upsert(trace(name));
      expect(new TracesRepository(db).getById('tr')?.framework).toBe(name);
      expect(new TracesRepository(db).list({ limit: 10 })[0]?.framework).toBe(name);
    });
  }

  it('keeps it on spans too', () => {
    new TracesRepository(db).upsert(trace('inferbench'));
    new SpansRepository(db).insert(span('inferbench'), 'now');
    expect(new SpansRepository(db).listByTrace('tr')[0]?.framework).toBe('inferbench');
  });

  it('says nothing on the console about it', () => {
    // The warning fired once per row, so a listing buried everything else.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const traces = new TracesRepository(db);
    for (let i = 0; i < 25; i++) {
      traces.upsert({ ...trace('inferbench'), traceId: `tr${i}` });
    }
    traces.list({ limit: 50 });
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('still filters by an unknown framework', () => {
    const traces = new TracesRepository(db);
    traces.upsert({ ...trace('inferbench'), traceId: 'a' });
    traces.upsert({ ...trace('crewai'), traceId: 'b' });
    const found = traces.list({ limit: 10, framework: 'inferbench' });
    expect(found.map((t) => t.traceId)).toEqual(['a']);
  });
});

describe('type and status stay validated', () => {
  it('a corrupt status still falls back instead of reaching the UI', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    new TracesRepository(db).upsert(trace('mcp'));
    db.prepare("UPDATE traces SET status = 'basura' WHERE trace_id = 'tr'").run();
    expect(new TracesRepository(db).getById('tr')?.status).toBe('error');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
