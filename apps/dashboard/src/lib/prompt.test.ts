import { describe, expect, it } from 'vitest';
import { promptPreview, toMessages, tracePrompt } from './prompt.ts';

describe('toMessages', () => {
  it('reads the OpenAI shape', () => {
    expect(
      toMessages({
        messages: [
          { role: 'system', content: 'be brief' },
          { role: 'user', content: 'name the planets' },
        ],
      }),
    ).toEqual([
      { role: 'system', text: 'be brief' },
      { role: 'user', text: 'name the planets' },
    ]);
  });

  it('reads a message list that arrived JSON-stringified', () => {
    // The Python tracer can only store scalars, so it stringifies the list.
    const input = { messages: JSON.stringify([{ role: 'user', content: 'que hora es' }]) };
    expect(toMessages(input)).toEqual([{ role: 'user', text: 'que hora es' }]);
  });

  it('keeps a truncated message list as text instead of losing it', () => {
    const input = { messages: '[{"role": "user", "content": "cuenta… (+900 car.)' };
    const messages = toMessages(input);
    expect(messages).toHaveLength(1);
    expect(messages?.[0].text).toContain('+900 car.');
  });

  it('treats a lone prompt field as the user turn', () => {
    expect(toMessages({ mensaje: 'que hora es' })).toEqual([{ role: 'user', text: 'que hora es' }]);
    expect(toMessages({ prompt: 'name the planets' })).toEqual([
      { role: 'user', text: 'name the planets' },
    ]);
  });

  it('falls back to the only field when its key is unknown', () => {
    expect(toMessages({ pelicula: 'Interstellar' })).toEqual([
      { role: 'user', text: 'Interstellar' },
    ]);
  });

  it('never mistakes an identifier for a prompt', () => {
    expect(toMessages({ prompt_id: 'chat' })).toBeNull();
    expect(toMessages({ runId: 'r_12' })).toBeNull();
  });

  it('is null for tool arguments and empty inputs', () => {
    expect(toMessages({ name: 'docker', action: 'status' })).toBeNull();
    expect(toMessages({})).toBeNull();
    expect(toMessages(null)).toBeNull();
  });

  it('renders content parts and tool calls', () => {
    const messages = toMessages({
      messages: [
        { role: 'user', content: [{ type: 'text', text: 'look' }, { type: 'image' }] },
        { role: 'assistant', tool_calls: [{ function: { name: 'search', arguments: '{"q":1}' } }] },
      ],
    });
    expect(messages?.[0].text).toBe('look\n「image」');
    expect(messages?.[1].text).toContain('🔧 search({"q":1})');
  });
});

describe('tracePrompt', () => {
  const span = (over: Partial<Parameters<typeof tracePrompt>[0][number]>) => ({
    spanId: 's1',
    parentSpanId: null,
    startedAt: '2026-08-12T11:00:00.000Z',
    input: null,
    ...over,
  });

  it('prefers the root span — the actual trigger of the trace', () => {
    const prompt = tracePrompt([
      span({
        spanId: 'child',
        parentSpanId: 'root',
        startedAt: '2026-08-12T11:00:01.000Z',
        input: { messages: [{ role: 'user', content: 'system-built prompt' }] },
      }),
      span({ spanId: 'root', input: { mensaje: 'que hora es' } }),
    ]);
    expect(prompt).toEqual({ spanId: 'root', text: 'que hora es', fromRoot: true });
  });

  it('falls through to the first child that has one when the root has no input', () => {
    const prompt = tracePrompt([
      span({ spanId: 'root' }),
      span({
        spanId: 'late',
        parentSpanId: 'root',
        startedAt: '2026-08-12T11:00:09.000Z',
        input: { prompt: 'later' },
      }),
      span({
        spanId: 'early',
        parentSpanId: 'root',
        startedAt: '2026-08-12T11:00:02.000Z',
        input: { prompt: 'first' },
      }),
    ]);
    expect(prompt).toMatchObject({ spanId: 'early', text: 'first', fromRoot: false });
  });

  it('takes the last user turn of a conversation, not the system preamble', () => {
    const prompt = tracePrompt([
      span({
        input: {
          messages: [
            { role: 'system', content: 'you are a robot' },
            { role: 'user', content: 'hola' },
            { role: 'assistant', content: 'dime' },
            { role: 'user', content: 'apaga la tele' },
          ],
        },
      }),
    ]);
    expect(prompt?.text).toBe('apaga la tele');
  });

  it('is null when nothing in the trace captured a prompt', () => {
    expect(tracePrompt([span({ input: { prompt_id: 'chat' } })])).toBeNull();
    expect(tracePrompt([])).toBeNull();
  });
});

describe('promptPreview', () => {
  it('flattens whitespace and truncates', () => {
    expect(promptPreview('  hola\n\n  mundo ')).toBe('hola mundo');
    expect(promptPreview('abcdef', 4)).toBe('abc…');
  });
});
