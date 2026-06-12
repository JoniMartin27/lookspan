import { describe, expect, it } from 'vitest';
import { csvField, toCsv } from './csv.js';

describe('csvField', () => {
  it('leaves plain values unquoted', () => {
    expect(csvField('hello')).toBe('hello');
    expect(csvField(42)).toBe('42');
    expect(csvField(true)).toBe('true');
  });

  it('renders null/undefined as an empty field', () => {
    expect(csvField(null)).toBe('');
    expect(csvField(undefined)).toBe('');
  });

  it('quotes values containing a comma, quote, or newline', () => {
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField('line1\nline2')).toBe('"line1\nline2"');
    expect(csvField('he said "hi"')).toBe('"he said ""hi"""');
  });

  it('JSON-stringifies objects', () => {
    expect(csvField({ a: 1 })).toBe('"{""a"":1}"');
  });
});

describe('toCsv', () => {
  it('builds a CRLF-terminated document with a header row', () => {
    const csv = toCsv(['id', 'name'] as const, [
      { id: 1, name: 'a' },
      { id: 2, name: 'b,c' },
    ]);
    expect(csv).toBe('id,name\r\n1,a\r\n2,"b,c"\r\n');
  });

  it('emits just the header for an empty record set', () => {
    expect(toCsv(['id'] as const, [])).toBe('id\r\n');
  });
});
