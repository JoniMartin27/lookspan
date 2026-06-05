import { describe, expect, it } from 'vitest';
import { parseLimit } from './query.js';

describe('parseLimit', () => {
  it('parses a valid positive integer string', () => {
    expect(parseLimit('25')).toBe(25);
  });

  it('floors a fractional value', () => {
    expect(parseLimit('10.9')).toBe(10);
  });

  it('returns undefined for non-numeric input', () => {
    expect(parseLimit('abc')).toBeUndefined();
  });

  it('returns undefined for empty, missing, or array values', () => {
    expect(parseLimit('')).toBeUndefined();
    expect(parseLimit(undefined)).toBeUndefined();
    expect(parseLimit(['1', '2'])).toBeUndefined();
  });

  it('returns undefined for zero, negative, and non-finite values', () => {
    expect(parseLimit('0')).toBeUndefined();
    expect(parseLimit('-5')).toBeUndefined();
    expect(parseLimit('Infinity')).toBeUndefined();
    expect(parseLimit('NaN')).toBeUndefined();
  });
});
