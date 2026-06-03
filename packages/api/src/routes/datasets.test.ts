import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { migrate, openDatabase } from '@lookspan/storage';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import { type CreateContextOptions, createContext } from '../context.js';

// Mock providers so dataset runs work without network or real keys.
vi.mock('openai', () => ({
  default: class {
    chat = {
      completions: {
        create: vi.fn(async (params: Record<string, unknown>) => {
          if (params.response_format) {
            return {
              model: params.model,
              usage: { prompt_tokens: 8, completion_tokens: 4 },
              choices: [{ message: { content: '{"score":0.9,"rationale":"good"}' } }],
            };
          }
          return {
            model: params.model,
            usage: { prompt_tokens: 15, completion_tokens: 6 },
            choices: [{ message: { content: 'an answer' } }],
          };
        }),
      },
    };
  },
}));
vi.mock('@anthropic-ai/sdk', () => ({ default: class {} }));

let server: Server;
let base: string;

function start(options: CreateContextOptions = {}) {
  const db = openDatabase({ path: ':memory:' });
  migrate(db);
  const app = createApp({ context: createContext(db, options) });
  return new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      resolve();
    });
  });
}

afterEach(() => new Promise<void>((resolve) => server.close(() => resolve())));

const json = (path: string, body: unknown) =>
  fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('datasets CRUD', () => {
  it('creates, lists, adds items and reads a dataset', async () => {
    await start();
    const created = await (await json('/api/datasets', { name: 'My set' })).json();
    expect(created.dataset).toMatchObject({ name: 'My set', itemCount: 0 });
    const id = created.dataset.id;

    const add = await json(`/api/datasets/${id}/items`, {
      items: [
        {
          input: { model: 'gpt-4o', messages: [{ role: 'user', content: 'hi' }] },
          expected: 'hello',
        },
        { input: { model: 'gpt-4o', messages: [{ role: 'user', content: '2+2' }] } },
      ],
    });
    expect(add.status).toBe(201);
    expect((await add.json()).items).toHaveLength(2);

    const list = await (await fetch(`${base}/api/datasets`)).json();
    expect(list.items[0]).toMatchObject({ id, itemCount: 2 });

    const detail = await (await fetch(`${base}/api/datasets/${id}`)).json();
    expect(detail.items).toHaveLength(2);
    expect(detail.runs).toEqual([]);
  });

  it('seeds an item from a trace', async () => {
    await start();
    await json('/api/ingest', {
      spans: [
        {
          traceId: 'tr_ds',
          spanId: 'sp_ds',
          parentSpanId: null,
          type: 'llm_call',
          name: 'x',
          startedAt: '2026-06-01T10:00:00Z',
          endedAt: '2026-06-01T10:00:01Z',
          status: 'ok',
          framework: 'custom',
          model: 'gpt-4o',
          provider: 'openai',
          input: { model: 'gpt-4o', messages: [{ role: 'user', content: 'seed me' }] },
          output: 'seeded output',
        },
      ],
    });
    const { dataset } = await (await json('/api/datasets', { name: 'Seeded' })).json();
    const res = await json(`/api/datasets/${dataset.id}/items/from-trace`, { traceId: 'tr_ds' });
    expect(res.status).toBe(201);
    const { item } = await res.json();
    expect(item.input).toMatchObject({ model: 'gpt-4o' });
    expect(item.expected).toBe('seeded output');
  });
});

describe('dataset runs', () => {
  it('runs items against a model with the judge and aggregates results', async () => {
    await start({ inferenceKeys: { openai: 'sk-test' } });
    const { dataset } = await (await json('/api/datasets', { name: 'Run set' })).json();
    await json(`/api/datasets/${dataset.id}/items`, {
      items: [
        { input: { messages: [{ role: 'user', content: 'a' }] } },
        { input: { messages: [{ role: 'user', content: 'b' }] } },
      ],
    });

    const res = await json(`/api/datasets/${dataset.id}/run`, {
      model: 'gpt-4o-mini',
      judge: true,
      metric: 'correctness',
    });
    expect(res.status).toBe(201);
    const { run, items } = await res.json();
    expect(run).toMatchObject({
      model: 'gpt-4o-mini',
      provider: 'openai',
      status: 'done',
      itemCount: 2,
      okCount: 2,
      errorCount: 0,
      judgeMetric: 'correctness',
    });
    expect(run.avgScore).toBeCloseTo(0.9, 5);
    expect(run.totalCostUsd).toBeGreaterThan(0);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ status: 'ok', output: 'an answer', score: 0.9 });

    const fetched = await (await fetch(`${base}/api/runs/${run.id}`)).json();
    expect(fetched.run.id).toBe(run.id);
    expect(fetched.items).toHaveLength(2);
  });

  it('400s a run with no provider key', async () => {
    await start();
    const { dataset } = await (await json('/api/datasets', { name: 'No key' })).json();
    await json(`/api/datasets/${dataset.id}/items`, {
      input: { messages: [{ role: 'user', content: 'a' }] },
    });
    const res = await json(`/api/datasets/${dataset.id}/run`, { model: 'gpt-4o' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('no_api_key');
  });

  it('400s a run on an empty dataset', async () => {
    await start({ inferenceKeys: { openai: 'sk-test' } });
    const { dataset } = await (await json('/api/datasets', { name: 'Empty' })).json();
    const res = await json(`/api/datasets/${dataset.id}/run`, { model: 'gpt-4o' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('empty_dataset');
  });
});
