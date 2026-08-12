import type { SpanInput } from '@lookspan/types';
import { describe, expect, it } from 'vitest';
import { REDACTED, REDACTED_DEEP, redactObject, redactSpan } from './redact.js';

describe('redactObject', () => {
  it('masks values of sensitive keys', () => {
    const out = redactObject({ api_key: 'sk-123', name: 'ok', authorization: 'Bearer x' });
    expect(out).toEqual({ api_key: REDACTED, name: 'ok', authorization: REDACTED });
  });

  it('matches case-insensitively and as a substring', () => {
    const out = redactObject({ 'X-Api-Key': 'a', openai_token: 'b', Password: 'c' });
    expect(out).toEqual({ 'X-Api-Key': REDACTED, openai_token: REDACTED, Password: REDACTED });
  });

  it('recurses into nested objects and arrays', () => {
    const out = redactObject({
      headers: [{ authorization: 'x' }],
      nested: { secret: 'y', keep: 1 },
    });
    expect(out).toEqual({
      headers: [{ authorization: REDACTED }],
      nested: { secret: REDACTED, keep: 1 },
    });
  });

  it('leaves non-sensitive data untouched', () => {
    const input = { prompt: 'hello', count: 3, ok: true };
    expect(redactObject(input)).toEqual(input);
  });

  it('scrubs secret-looking values even under innocent keys', () => {
    const out = redactObject({
      prompt: 'use key sk-proj-ABCDEFGHIJKLMNOP1234 please',
      header: 'Authorization: Bearer abcdef12345678ghijkl',
      note: 'all good',
    }) as Record<string, string>;
    expect(out.prompt).toContain(REDACTED);
    expect(out.prompt).not.toContain('sk-proj-ABCDEFGHIJKLMNOP1234');
    expect(out.header).toContain(REDACTED);
    expect(out.note).toBe('all good');
  });

  it('can disable value scrubbing', () => {
    const out = redactObject(
      { prompt: 'sk-proj-ABCDEFGHIJKLMNOP1234' },
      { scrubValues: false },
    ) as Record<string, string>;
    expect(out.prompt).toBe('sk-proj-ABCDEFGHIJKLMNOP1234');
  });

  it('honors a custom pattern list', () => {
    const out = redactObject({ ssn: '1', api_key: '2' }, { patterns: ['ssn'] });
    expect(out).toEqual({ ssn: REDACTED, api_key: '2' });
  });

  it('honors extra patterns alongside defaults', () => {
    const out = redactObject({ ssn: '1', token: '2' }, { extraPatterns: ['ssn'] });
    expect(out).toEqual({ ssn: REDACTED, token: REDACTED });
  });

  it('replaces a subtree past maxDepth instead of storing it unscanned', () => {
    // This test used to assert the opposite — that `{ secret: 'x' }` came back
    // untouched — which is how the leak survived: the scan gave up *and* waved
    // the payload through, key names unchecked and strings unscrubbed.
    // Depth 0 is the root; its values are visited at depth 1, so with
    // `maxDepth: 1` the value of `a` is the first thing left unscanned.
    const out = redactObject({ a: { b: { secret: 'x' } } }, { maxDepth: 1 }) as Record<
      string,
      unknown
    >;
    expect(out).toEqual({ a: REDACTED_DEEP });
    expect(JSON.stringify(out)).not.toContain('"x"');

    // One level further down and the secret is reached and masked.
    expect(redactObject({ a: { b: { secret: 'x' } } }, { maxDepth: 3 })).toEqual({
      a: { b: { secret: REDACTED } },
    });
  });

  it('scans a real OpenAI tool call all the way down', () => {
    // `input.messages[0].tool_calls[0].function.arguments.api_key` is six
    // levels down. With the old default of 6 the credential was stored in the
    // clear — not an edge case, but the shape the OpenAI SDK produces.
    const payload = {
      messages: [
        {
          role: 'assistant',
          tool_calls: [
            {
              type: 'function',
              function: { name: 'call_api', arguments: { api_key: 'hunter2' } },
            },
          ],
        },
      ],
    };
    expect(JSON.stringify(redactObject(payload))).not.toContain('hunter2');
  });

  it('scrubs secret-looking values below the old limit too', () => {
    // The walk bailing out early meant value scrubbing never reached these
    // strings either, so a provider key pasted deep in a payload survived.
    const deep = {
      a: { b: { c: { d: { e: { f: { note: 'use sk-proj-AbCdEfGhIjKlMnOpQr1234' } } } } } },
    };
    expect(JSON.stringify(redactObject(deep))).not.toContain('sk-proj-');
  });

  it('keeps ordinary deep data rather than blanking it', () => {
    // Failing closed must not cost legitimate telemetry: twelve levels covers
    // the payloads this product exists to ingest.
    const deep = { a: { b: { c: { d: { e: { f: { g: { note: 'todo bien' } } } } } } } };
    expect(JSON.stringify(redactObject(deep))).toContain('todo bien');
  });
});

function span(overrides: Partial<SpanInput> = {}): SpanInput {
  return {
    traceId: 'tr_1',
    spanId: 'sp_1',
    parentSpanId: null,
    type: 'llm_call',
    name: 'completion',
    startedAt: '2026-06-01T10:00:00Z',
    endedAt: null,
    status: 'ok',
    framework: 'custom',
    ...overrides,
  };
}

describe('redactSpan', () => {
  it('redacts input and attributes', () => {
    const s = redactSpan(
      span({
        input: { messages: 'hi', api_key: 'sk-1' },
        attributes: { 'http.authorization': 'Bearer z', model: 'gpt-4o' },
      }),
    );
    expect((s.input as Record<string, unknown>).api_key).toBe(REDACTED);
    expect((s.input as Record<string, unknown>).messages).toBe('hi');
    expect((s.attributes as Record<string, unknown>)['http.authorization']).toBe(REDACTED);
  });

  it('is a no-op when there is nothing to redact', () => {
    const s = redactSpan(span());
    expect(s.input).toBeUndefined();
    expect(s.attributes).toBeUndefined();
  });
});
