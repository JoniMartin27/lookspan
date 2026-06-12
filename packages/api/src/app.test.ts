import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { migrate, openDatabase } from '@lookspan/storage';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { createContext } from './context.js';

let server: Server;
let base: string;

function start(authToken?: string) {
  const db = openDatabase({ path: ':memory:' });
  migrate(db);
  const app = createApp({ context: createContext(db), authToken });
  return new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      base = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
}

afterEach(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe('createApp routing (no auth)', () => {
  beforeEach(() => start());

  it('serves health', async () => {
    const res = await fetch(`${base}/api/health`);
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });

  it('ingests and reads back a trace', async () => {
    const res = await fetch(`${base}/api/ingest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        spans: [
          {
            traceId: 'tr_1',
            spanId: 'sp_1',
            parentSpanId: null,
            type: 'llm_call',
            name: 'x',
            startedAt: '2026-06-01T10:00:00Z',
            endedAt: '2026-06-01T10:00:01Z',
            status: 'ok',
            framework: 'custom',
          },
        ],
      }),
    });
    expect(res.status).toBe(200);
    const list = await (await fetch(`${base}/api/traces`)).json();
    expect(list.items).toHaveLength(1);
  });

  it('404s unknown /api routes as JSON', async () => {
    const res = await fetch(`${base}/api/nope`);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('not_found');
  });

  it('attaches and returns scores on a trace', async () => {
    await fetch(`${base}/api/ingest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        spans: [
          {
            traceId: 'tr_s',
            spanId: 'sp_s',
            parentSpanId: null,
            type: 'llm_call',
            name: 'x',
            startedAt: '2026-06-01T10:00:00Z',
            endedAt: '2026-06-01T10:00:01Z',
            status: 'ok',
            framework: 'custom',
          },
        ],
      }),
    });

    const add = await fetch(`${base}/api/traces/tr_s/scores`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'correctness', value: 1, source: 'llm-judge' }),
    });
    expect(add.status).toBe(201);

    const bad = await fetch(`${base}/api/traces/tr_s/scores`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'x' }),
    });
    expect(bad.status).toBe(400);

    const missing = await fetch(`${base}/api/traces/nope/scores`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'x', value: 1 }),
    });
    expect(missing.status).toBe(404);

    const detail = await (await fetch(`${base}/api/traces/tr_s`)).json();
    expect(detail.scores).toHaveLength(1);
    expect(detail.scores[0]).toMatchObject({ name: 'correctness', value: 1 });
  });

  it('exports traces as CSV (default) and JSON, honouring filters', async () => {
    await fetch(`${base}/api/ingest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        spans: [
          {
            traceId: 'tr_csv1',
            spanId: 'sp1',
            parentSpanId: null,
            type: 'llm_call',
            name: 'one',
            startedAt: '2026-06-01T10:00:00Z',
            endedAt: '2026-06-01T10:00:01Z',
            status: 'ok',
            framework: 'mcp',
          },
          {
            traceId: 'tr_csv2',
            spanId: 'sp2',
            parentSpanId: null,
            type: 'llm_call',
            name: 'two',
            startedAt: '2026-06-01T11:00:00Z',
            endedAt: '2026-06-01T11:00:02Z',
            status: 'error',
            framework: 'langgraph',
          },
        ],
      }),
    });

    // CSV is the default format.
    const csvRes = await fetch(`${base}/api/export/traces`);
    expect(csvRes.status).toBe(200);
    expect(csvRes.headers.get('content-type')).toContain('text/csv');
    expect(csvRes.headers.get('content-disposition')).toMatch(/attachment; filename=".*\.csv"/);
    // UTF-8 BOM so Excel reads accents correctly (point 2). `fetch().text()`
    // strips a leading BOM per the Encoding Standard, so check the raw bytes.
    const csvBytes = new Uint8Array(await csvRes.clone().arrayBuffer());
    expect([csvBytes[0], csvBytes[1], csvBytes[2]]).toEqual([0xef, 0xbb, 0xbf]);
    const csv = await csvRes.text();
    const lines = csv.trim().split('\r\n');
    expect(lines[0]).toContain('traceId');
    expect(lines).toHaveLength(3); // header + 2 traces
    expect(csv).toContain('tr_csv1');
    expect(csv).toContain('tr_csv2');

    // Provenance/integrity headers (points 4 & 5).
    expect(csvRes.headers.get('x-lookspan-export-truncated')).toBe('false');
    expect(csvRes.headers.get('x-lookspan-export-count')).toBe('2');
    expect(csvRes.headers.get('x-lookspan-export-sha256')).toMatch(/^[0-9a-f]{64}$/);

    // JSON format returns full trace objects with a provenance block.
    const jsonRes = await fetch(`${base}/api/export/traces?format=json`);
    expect(jsonRes.headers.get('content-type')).toContain('application/json');
    const body = await jsonRes.json();
    expect(body.count).toBe(2);
    expect(body.traces).toHaveLength(2);
    expect(body.traces[0]).toHaveProperty('totalUsage');
    // Provenance fields (point 5).
    expect(body.tool).toBe('lookspan');
    expect(typeof body.version).toBe('string');
    expect(body.truncated).toBe(false);
    expect(body.totalAvailable).toBe(2);
    expect(body.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(typeof body.exportedAt).toBe('string');
    // PII redaction by default (point 6): attributes are dropped.
    expect(body.traces[0]).not.toHaveProperty('attributes');
    expect(body.raw).toBe(false);

    // ?raw=1 returns attributes in the clear.
    const rawBody = await (await fetch(`${base}/api/export/traces?format=json&raw=1`)).json();
    expect(rawBody.raw).toBe(true);
    expect(rawBody.traces[0]).toHaveProperty('attributes');

    // The status filter narrows the export.
    const filtered = await (
      await fetch(`${base}/api/export/traces?format=json&status=error`)
    ).json();
    expect(filtered.count).toBe(1);
    expect(filtered.traces[0].traceId).toBe('tr_csv2');
    expect(filtered.filters).toEqual({ status: 'error' });

    // HTML audit report (point 7).
    const htmlRes = await fetch(`${base}/api/export/traces?format=html`);
    expect(htmlRes.headers.get('content-type')).toContain('text/html');
    expect(htmlRes.headers.get('content-disposition')).toMatch(/attachment; filename=".*\.html"/);
    const html = await htmlRes.text();
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('Lookspan');
    expect(html).toContain('<svg'); // hand-drawn charts
    expect(html).toContain('tr_csv1'); // trace table
    expect(html).toContain(htmlRes.headers.get('x-lookspan-export-sha256') ?? 'NO_HASH');
  });

  it('reports truncation explicitly when the export limit drops rows', async () => {
    await fetch(`${base}/api/ingest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        spans: [
          {
            traceId: 'tr_t1',
            spanId: 'spt1',
            parentSpanId: null,
            type: 'llm_call',
            name: 'one',
            startedAt: '2026-06-01T10:00:00Z',
            endedAt: '2026-06-01T10:00:01Z',
            status: 'ok',
            framework: 'mcp',
          },
          {
            traceId: 'tr_t2',
            spanId: 'spt2',
            parentSpanId: null,
            type: 'llm_call',
            name: 'two',
            startedAt: '2026-06-01T11:00:00Z',
            endedAt: '2026-06-01T11:00:02Z',
            status: 'ok',
            framework: 'mcp',
          },
        ],
      }),
    });

    const res = await fetch(`${base}/api/export/traces?format=json&limit=1`);
    expect(res.headers.get('x-lookspan-export-truncated')).toBe('true');
    const body = await res.json();
    expect(body.count).toBe(1);
    expect(body.truncated).toBe(true);
    expect(body.totalAvailable).toBe(2);
  });

  it('neutralises CSV formula injection in exported string fields', async () => {
    await fetch(`${base}/api/ingest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        spans: [
          {
            traceId: 'tr_inj',
            spanId: 'spinj',
            parentSpanId: null,
            type: 'llm_call',
            name: '=cmd|/c calc',
            startedAt: '2026-06-01T10:00:00Z',
            endedAt: '2026-06-01T10:00:01Z',
            status: 'ok',
            framework: 'custom',
          },
        ],
      }),
    });

    const csv = await (await fetch(`${base}/api/export/traces`)).text();
    // The dangerous rootName is neutralised with a leading single quote.
    expect(csv).toContain("'=cmd|/c calc");
    expect(csv).not.toMatch(/,=cmd/);
  });
});

describe('aggregation & session routes', () => {
  beforeEach(async () => {
    await start();
    // two traces in one session, two agents, with cost
    await fetch(`${base}/api/ingest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        spans: [
          {
            traceId: 'tr_a',
            spanId: 'sp_a',
            parentSpanId: null,
            type: 'llm_call',
            name: 'a',
            startedAt: '2026-06-01T10:00:00Z',
            endedAt: '2026-06-01T10:00:01Z',
            status: 'ok',
            framework: 'mcp',
            agentId: 'ag1',
            sessionId: 'sess',
            model: 'gpt-4o',
            provider: 'openai',
            usage: { inputTokens: 1000000, outputTokens: 0, costUsd: 0 },
          },
          {
            traceId: 'tr_b',
            spanId: 'sp_b',
            parentSpanId: null,
            type: 'llm_call',
            name: 'b',
            startedAt: '2026-06-01T11:00:00Z',
            endedAt: '2026-06-01T11:00:02Z',
            status: 'error',
            framework: 'mcp',
            agentId: 'ag2',
            sessionId: 'sess',
          },
        ],
      }),
    });
  });

  it('GET /api/stats returns totals, error rate and latency', async () => {
    const s = await (await fetch(`${base}/api/stats`)).json();
    expect(s.totalTraces).toBe(2);
    expect(s.errorTraces).toBe(1);
    expect(s.errorRate).toBe(0.5);
    expect(s.latencyMs).not.toBeNull();
  });

  it('GET /api/costs/summary breaks cost down', async () => {
    const c = await (await fetch(`${base}/api/costs/summary`)).json();
    expect(c.total).toBe(2.5); // 1M input gpt-4o @ $2.5
    expect(c.byProvider.openai).toBe(2.5);
  });

  it('GET /api/sessions lists the session with its agents', async () => {
    const { items } = await (await fetch(`${base}/api/sessions`)).json();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ sessionId: 'sess', traceCount: 2, agentCount: 2 });
  });

  it('GET /api/sessions/:id returns summary + traces; 404 for unknown', async () => {
    const res = await (await fetch(`${base}/api/sessions/sess`)).json();
    expect(res.session).toMatchObject({ sessionId: 'sess', traceCount: 2 });
    expect(res.traces).toHaveLength(2);
    expect((await fetch(`${base}/api/sessions/nope`)).status).toBe(404);
  });

  it('GET /api/alerts returns an items array', async () => {
    const a = await (await fetch(`${base}/api/alerts`)).json();
    expect(Array.isArray(a.items)).toBe(true);
  });

  it('GET /api/scores/summary averages scores by name', async () => {
    await fetch(`${base}/api/traces/tr_a/scores`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'quality', value: 1 }),
    });
    await fetch(`${base}/api/traces/tr_b/scores`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'quality', value: 0 }),
    });
    const { items } = await (await fetch(`${base}/api/scores/summary`)).json();
    const q = items.find((i: { name: string }) => i.name === 'quality');
    expect(q).toMatchObject({ name: 'quality', avg: 0.5, count: 2 });
  });
});

describe('createApp auth token', () => {
  beforeEach(() => start('secret123'));

  it('allows health without a token', async () => {
    expect((await fetch(`${base}/api/health`)).status).toBe(200);
  });

  it('rejects API requests without a token', async () => {
    expect((await fetch(`${base}/api/traces`)).status).toBe(401);
  });

  it('accepts a valid Bearer token', async () => {
    const res = await fetch(`${base}/api/traces`, {
      headers: { authorization: 'Bearer secret123' },
    });
    expect(res.status).toBe(200);
  });

  it('accepts a token via query string', async () => {
    expect((await fetch(`${base}/api/traces?token=secret123`)).status).toBe(200);
  });

  it('rejects a wrong token', async () => {
    const res = await fetch(`${base}/api/traces`, {
      headers: { authorization: 'Bearer nope' },
    });
    expect(res.status).toBe(401);
  });

  it('guards the OTLP endpoint too', async () => {
    const res = await fetch(`${base}/v1/traces`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ resourceSpans: [] }),
    });
    expect(res.status).toBe(401);
  });
});
