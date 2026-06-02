import type { SpanInput } from '@lookspan/types';
import { describe, expect, it } from 'vitest';
import { observeAnthropic } from './index.js';

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

function fakeClient(impl?: { create?: (args: unknown) => Promise<unknown> }) {
  return {
    messages: {
      create:
        impl?.create ??
        (async () => ({
          model: 'claude-sonnet-4-6',
          usage: { input_tokens: 200, output_tokens: 80 },
          content: [{ type: 'text', text: 'hi' }],
        })),
    },
    models: { list: async () => ['claude-sonnet-4-6'] },
  };
}

describe('observeAnthropic', () => {
  it('emits an llm_call span on messages.create', async () => {
    const { spans, exporter } = captureExporter();
    const client = observeAnthropic(fakeClient(), { exporter, agentId: 'a1' });
    const res = await client.messages.create({ model: 'claude-sonnet-4-6', messages: [] });
    expect((res as { content: unknown[] }).content).toHaveLength(1);
    expect(spans[0]).toMatchObject({
      type: 'llm_call',
      name: 'messages.create',
      status: 'ok',
      model: 'claude-sonnet-4-6',
      provider: 'anthropic',
      agentId: 'a1',
    });
    expect(spans[0].usage).toMatchObject({ inputTokens: 200, outputTokens: 80 });
  });

  it('merges streaming usage across message_start and message_delta events', async () => {
    const { spans, exporter } = captureExporter();
    const streamClient = {
      messages: {
        create: async () => {
          async function* gen() {
            yield {
              type: 'message_start',
              message: { usage: { input_tokens: 50, output_tokens: 0 } },
            };
            yield { type: 'content_block_delta', delta: { text: 'hi' } };
            yield { type: 'message_delta', usage: { output_tokens: 25 } };
          }
          return gen();
        },
      },
    };
    const client = observeAnthropic(streamClient, { exporter });
    const stream = await client.messages.create({ model: 'claude-sonnet-4-6', stream: true });
    expect(spans).toHaveLength(0);
    for await (const _ of stream as AsyncIterable<unknown>) {
      /* consume */
    }
    expect(spans).toHaveLength(1);
    expect(spans[0].usage).toMatchObject({ inputTokens: 50, outputTokens: 25 });
  });

  it('records an error span and rethrows', async () => {
    const { spans, exporter } = captureExporter();
    const boom = fakeClient({
      create: async () => {
        throw new Error('overloaded');
      },
    });
    const client = observeAnthropic(boom, { exporter });
    await expect(client.messages.create({ model: 'claude-sonnet-4-6' })).rejects.toThrow(
      'overloaded',
    );
    expect(spans[0]).toMatchObject({ status: 'error' });
    expect(spans[0].error?.message).toBe('overloaded');
  });

  it('leaves untraced methods working', async () => {
    const { exporter, spans } = captureExporter();
    const client = observeAnthropic(fakeClient(), { exporter });
    expect(await client.models.list()).toEqual(['claude-sonnet-4-6']);
    expect(spans).toHaveLength(0);
  });
});
