import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { migrate, openDatabase } from '@lookspan/storage';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import { type CreateContextOptions, createContext } from '../context.js';

// Mock the provider SDKs so replay/judge run without network or real keys.
vi.mock('openai', () => ({
  default: class {
    chat = {
      completions: {
        create: vi.fn(async (params: Record<string, unknown>) => {
          if (params.response_format) {
            // judge call → return a JSON verdict
            return {
              model: params.model,
              usage: { prompt_tokens: 10, completion_tokens: 5 },
              choices: [
                { message: { content: '```json\n{"score":0.8,"rationale":"solid"}\n```' } },
              ],
            };
          }
          return {
            model: params.model,
            usage: { prompt_tokens: 12, completion_tokens: 7 },
            choices: [{ message: { content: 'replayed answer' } }],
          };
        }),
      },
    };
  },
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = {
      create: vi.fn(async (params: Record<string, unknown>) => ({
        model: params.model,
        usage: { input_tokens: 20, output_tokens: 9 },
        content: [{ type: 'text', text: 'claude replay' }],
      })),
    };
  },
}));

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

async function seedLlmTrace(traceId: string, withContent = true) {
  await fetch(`${base}/api/ingest`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      spans: [
        {
          traceId,
          spanId: `${traceId}_sp`,
          parentSpanId: null,
          type: 'llm_call',
          name: 'chat.completions.create',
          startedAt: '2026-06-01T10:00:00Z',
          endedAt: '2026-06-01T10:00:01Z',
          status: 'ok',
          framework: 'custom',
          model: 'gpt-4o',
          provider: 'openai',
          usage: { inputTokens: 100, outputTokens: 40, costUsd: 0 },
          ...(withContent
            ? {
                input: { model: 'gpt-4o', messages: [{ role: 'user', content: 'What is 2+2?' }] },
                output: 'The answer is 4.',
              }
            : {}),
        },
      ],
    }),
  });
}

const json = (path: string, body: unknown) =>
  fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('replay & judge with a provider key', () => {
  it('replays the captured prompt and stores a diffable result', async () => {
    await start({ inferenceKeys: { openai: 'sk-test' } });
    await seedLlmTrace('tr_r');

    const res = await json('/api/traces/tr_r/replay', {});
    expect(res.status).toBe(201);
    const { replay } = await res.json();
    expect(replay).toMatchObject({
      status: 'ok',
      provider: 'openai',
      replayModel: 'gpt-4o',
      output: 'replayed answer',
      inputTokens: 12,
      outputTokens: 7,
    });
    expect(replay.costUsd).toBeGreaterThan(0);
    expect(replay.originalOutput).toBe('The answer is 4.');

    const list = await (await fetch(`${base}/api/traces/tr_r/replays`)).json();
    expect(list.items).toHaveLength(1);
  });

  it('replays against a different model when one is given', async () => {
    await start({ inferenceKeys: { anthropic: 'sk-ant' } });
    await seedLlmTrace('tr_m');

    const res = await json('/api/traces/tr_m/replay', { model: 'claude-3-5-haiku-latest' });
    const { replay } = await res.json();
    expect(replay).toMatchObject({
      status: 'ok',
      provider: 'anthropic',
      replayModel: 'claude-3-5-haiku-latest',
      output: 'claude replay',
    });
  });

  it('judges input/output and stores an llm-judge score', async () => {
    await start({ inferenceKeys: { openai: 'sk-test' } });
    await seedLlmTrace('tr_j');

    const res = await json('/api/traces/tr_j/judge', { metric: 'correctness' });
    expect(res.status).toBe(201);
    const { score, judge } = await res.json();
    expect(score).toMatchObject({ name: 'correctness', value: 0.8, source: 'llm-judge' });
    expect(score.comment).toBe('solid');
    expect(judge.provider).toBe('openai');

    const detail = await (await fetch(`${base}/api/traces/tr_j`)).json();
    expect(detail.scores).toHaveLength(1);
  });
});

describe('replay & judge guardrails', () => {
  it('404s for an unknown trace', async () => {
    await start({ inferenceKeys: { openai: 'sk-test' } });
    expect((await json('/api/traces/nope/replay', {})).status).toBe(404);
  });

  it('400s when no provider key is configured', async () => {
    await start();
    await seedLlmTrace('tr_k');
    const replay = await json('/api/traces/tr_k/replay', {});
    expect(replay.status).toBe(400);
    expect((await replay.json()).error).toBe('no_api_key');

    const judge = await json('/api/traces/tr_k/judge', {});
    expect(judge.status).toBe(400);
    expect((await judge.json()).error).toBe('no_api_key');
  });

  it('400s when the span has no captured prompt', async () => {
    await start({ inferenceKeys: { openai: 'sk-test' } });
    await seedLlmTrace('tr_n', false);
    const replay = await json('/api/traces/tr_n/replay', {});
    expect(replay.status).toBe(400);
    expect((await replay.json()).error).toBe('no_replayable_span');

    const judge = await json('/api/traces/tr_n/judge', {});
    expect(judge.status).toBe(400);
    expect((await judge.json()).error).toBe('no_content_to_judge');
  });

  it('returns empty replays for a trace with none', async () => {
    await start({ inferenceKeys: { openai: 'sk-test' } });
    await seedLlmTrace('tr_e');
    const list = await (await fetch(`${base}/api/traces/tr_e/replays`)).json();
    expect(list.items).toEqual([]);
  });
});
