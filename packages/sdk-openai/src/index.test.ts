import type { SpanInput } from '@lookspan/types';
import { describe, expect, it } from 'vitest';
import { observeOpenAI } from './index.js';

// Minimal exporter that captures spans instead of sending them.
function captureExporter() {
  const spans: SpanInput[] = [];
  return {
    spans,
    exporter: {
      send: async (batch: SpanInput[]) => {
        spans.push(...batch);
      },
      flush: async () => {},
    },
  };
}

// A fake OpenAI-shaped client.
function fakeClient(impl?: { create?: (args: unknown) => Promise<unknown> }) {
  return {
    chat: {
      completions: {
        create:
          impl?.create ??
          (async (_args: unknown) => ({
            model: 'gpt-4o',
            usage: { prompt_tokens: 100, completion_tokens: 40 },
            choices: [{ message: { content: 'hi' } }],
          })),
      },
    },
    embeddings: {
      create: async () => ({ model: 'text-embedding-3-small', usage: { prompt_tokens: 5 } }),
    },
    models: { list: async () => ['gpt-4o'] }, // untraced method, must still work
  };
}

describe('observeOpenAI', () => {
  it('emits an llm_call span on chat.completions.create and returns the result', async () => {
    const { spans, exporter } = captureExporter();
    const client = observeOpenAI(fakeClient(), { exporter, agentId: 'a1' });

    const res = await client.chat.completions.create({ model: 'gpt-4o', messages: [] });
    expect((res as { choices: unknown[] }).choices).toHaveLength(1);

    expect(spans).toHaveLength(1);
    expect(spans[0]).toMatchObject({
      type: 'llm_call',
      name: 'chat.completions.create',
      status: 'ok',
      model: 'gpt-4o',
      provider: 'openai',
      agentId: 'a1',
    });
    expect(spans[0].usage).toMatchObject({ inputTokens: 100, outputTokens: 40 });
  });

  it('traces embeddings as an embedding span', async () => {
    const { spans, exporter } = captureExporter();
    const client = observeOpenAI(fakeClient(), { exporter });
    await client.embeddings.create({ model: 'text-embedding-3-small', input: 'x' });
    expect(spans[0]).toMatchObject({ type: 'embedding', name: 'embeddings.create' });
    expect(spans[0].usage).toMatchObject({ inputTokens: 5 });
  });

  it('records an error span and rethrows', async () => {
    const { spans, exporter } = captureExporter();
    const boom = fakeClient({
      create: async () => {
        throw new Error('rate limited');
      },
    });
    const client = observeOpenAI(boom, { exporter });
    await expect(client.chat.completions.create({ model: 'gpt-4o' })).rejects.toThrow(
      'rate limited',
    );
    expect(spans[0]).toMatchObject({ status: 'error', model: 'gpt-4o' });
    expect(spans[0].error?.message).toBe('rate limited');
  });

  it('traces a streaming call when the stream is consumed (usage from final chunk)', async () => {
    const { spans, exporter } = captureExporter();
    const streamClient = {
      chat: {
        completions: {
          create: async (_args: unknown) => {
            async function* gen() {
              yield { choices: [{ delta: { content: 'hi' } }] };
              yield {
                choices: [{ delta: { content: '!' } }],
                usage: { prompt_tokens: 7, completion_tokens: 3 },
              };
            }
            return gen();
          },
        },
      },
    };
    const client = observeOpenAI(streamClient, { exporter });
    const stream = await client.chat.completions.create({ model: 'gpt-4o', stream: true });

    // no span until the stream is consumed
    expect(spans).toHaveLength(0);
    const chunks = [];
    for await (const c of stream as AsyncIterable<unknown>) chunks.push(c);

    expect(chunks).toHaveLength(2);
    expect(spans).toHaveLength(1);
    expect(spans[0]).toMatchObject({ status: 'ok', model: 'gpt-4o', type: 'llm_call' });
    expect(spans[0].usage).toMatchObject({ inputTokens: 7, outputTokens: 3 });
  });

  it('captures request input and reply output by default (for replay/judge)', async () => {
    const { spans, exporter } = captureExporter();
    const client = observeOpenAI(fakeClient(), { exporter });
    const messages = [{ role: 'user', content: 'hello' }];
    await client.chat.completions.create({ model: 'gpt-4o', messages });
    expect(spans[0].input).toMatchObject({ model: 'gpt-4o', messages });
    expect(spans[0].output).toBe('hi');
  });

  it('accumulates streamed output text into the span', async () => {
    const { spans, exporter } = captureExporter();
    const streamClient = {
      chat: {
        completions: {
          create: async () => {
            async function* gen() {
              yield { choices: [{ delta: { content: 'hi' } }] };
              yield {
                choices: [{ delta: { content: '!' } }],
                usage: { prompt_tokens: 7, completion_tokens: 3 },
              };
            }
            return gen();
          },
        },
      },
    };
    const client = observeOpenAI(streamClient, { exporter });
    const stream = await client.chat.completions.create({ model: 'gpt-4o', stream: true });
    for await (const _ of stream as AsyncIterable<unknown>) {
      /* consume */
    }
    expect(spans[0].output).toBe('hi!');
  });

  it('omits content when captureContent is false', async () => {
    const { spans, exporter } = captureExporter();
    const client = observeOpenAI(fakeClient(), { exporter, captureContent: false });
    await client.chat.completions.create({ model: 'gpt-4o', messages: [{ role: 'user' }] });
    expect(spans[0].input).toBeNull();
    expect(spans[0].output).toBeNull();
  });

  it('leaves untraced methods working', async () => {
    const { exporter, spans } = captureExporter();
    const client = observeOpenAI(fakeClient(), { exporter });
    expect(await client.models.list()).toEqual(['gpt-4o']);
    expect(spans).toHaveLength(0);
  });
});
