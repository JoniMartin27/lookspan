import { describe, expect, it } from 'vitest';
import { IngestValidationError, validatePayload, validateSpan } from './normalize.js';

function validSpan(overrides: Record<string, unknown> = {}) {
  return {
    traceId: 'tr_1',
    spanId: 'sp_1',
    parentSpanId: null,
    type: 'llm_call',
    name: 'completion',
    startedAt: '2026-06-01T10:00:00Z',
    status: 'ok',
    framework: 'custom',
    ...overrides,
  };
}

describe('validateSpan', () => {
  it('accepts a well-formed span', () => {
    expect(() => validateSpan(validSpan(), 0)).not.toThrow();
  });

  it('rejects a non-object', () => {
    expect(() => validateSpan(null, 0)).toThrow(IngestValidationError);
    expect(() => validateSpan('nope', 0)).toThrow(IngestValidationError);
  });

  it.each([
    'traceId',
    'spanId',
    'type',
    'name',
    'startedAt',
    'status',
    'framework',
  ])('rejects when required field %s is missing', (field) => {
    const span = validSpan();
    delete (span as Record<string, unknown>)[field];
    expect(() => validateSpan(span, 0)).toThrow(/non-empty string/);
  });

  it('rejects empty-string required fields', () => {
    expect(() => validateSpan(validSpan({ name: '' }), 0)).toThrow(/non-empty string/);
  });

  it('rejects an unrecognized span type', () => {
    expect(() => validateSpan(validSpan({ type: 'wat' }), 0)).toThrow(/not recognized/);
  });

  it('rejects an unrecognized status', () => {
    expect(() => validateSpan(validSpan({ status: 'maybe' }), 0)).toThrow(/not recognized/);
  });

  it('accepts string or null parentSpanId but rejects other types', () => {
    expect(() => validateSpan(validSpan({ parentSpanId: 'sp_0' }), 0)).not.toThrow();
    expect(() => validateSpan(validSpan({ parentSpanId: null }), 0)).not.toThrow();
    expect(() => validateSpan(validSpan({ parentSpanId: 42 }), 0)).toThrow(/string or null/);
  });

  it('carries the span index on the error', () => {
    try {
      validateSpan(validSpan({ name: '' }), 7);
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(IngestValidationError);
      expect((err as IngestValidationError).index).toBe(7);
    }
  });
});

describe('validatePayload', () => {
  it('accepts a payload with a spans array', () => {
    expect(() => validatePayload({ spans: [] })).not.toThrow();
  });

  it('rejects a non-object payload', () => {
    expect(() => validatePayload(null)).toThrow(/payload must be an object/);
  });

  it('rejects when spans is not an array', () => {
    expect(() => validatePayload({ spans: 'x' })).toThrow(/spans must be an array/);
  });
});
