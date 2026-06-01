import type { SpanInput } from '@lookspan/types';
import { describe, expect, it } from 'vitest';
import { REDACTED, redactObject, redactSpan } from './redact.js';

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

  it('honors a custom pattern list', () => {
    const out = redactObject({ ssn: '1', api_key: '2' }, { patterns: ['ssn'] });
    expect(out).toEqual({ ssn: REDACTED, api_key: '2' });
  });

  it('honors extra patterns alongside defaults', () => {
    const out = redactObject({ ssn: '1', token: '2' }, { extraPatterns: ['ssn'] });
    expect(out).toEqual({ ssn: REDACTED, token: REDACTED });
  });

  it('stops recursing past maxDepth', () => {
    const out = redactObject({ a: { b: { secret: 'x' } } }, { maxDepth: 1 }) as Record<
      string,
      unknown
    >;
    // depth 0 = root, depth 1 = a; b is at depth 2 ≥ maxDepth so it is returned as-is
    expect(out).toEqual({ a: { b: { secret: 'x' } } });
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
