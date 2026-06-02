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
