import { describe, expect, it } from 'vitest';
import { csvField, toCsv, UTF8_BOM } from './csv.js';

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

  describe('CSV/formula injection guard (CWE-1236)', () => {
    it("prefixes a leading = + - @ on string values with a single quote", () => {
      expect(csvField('=cmd|/c calc')).toBe("'=cmd|/c calc");
      expect(csvField('+1+2')).toBe("'+1+2");
      expect(csvField('-2-3')).toBe("'-2-3");
      expect(csvField('@SUM(A1)')).toBe("'@SUM(A1)");
    });

    it('prefixes a leading TAB or CR on string values', () => {
      // TAB triggers the injection prefix but is not in the RFC-quoting set,
      // so no surrounding quotes are added.
      expect(csvField('\t=evil')).toBe("'\t=evil");
      // CR triggers both the prefix AND RFC 4180 quoting.
      expect(csvField('\rdanger')).toBe('"\'\rdanger"');
    });

    it('still applies RFC 4180 quoting after the injection prefix', () => {
      // Leading "=" plus an embedded comma: prefix then quote.
      expect(csvField('=a,b')).toBe('"\'=a,b"');
      // Leading "=" plus an embedded quote: prefix, then double the quote.
      expect(csvField('="x"')).toBe('"\'=""x"""');
    });

    it('does NOT prefix numbers/booleans even when stringified to a leading "-"', () => {
      // String(-5) === "-5" starts with "-", but numbers are trusted producers.
      expect(csvField(-5)).toBe('-5');
      expect(csvField(-0.25)).toBe('-0.25');
      expect(csvField(false)).toBe('false');
    });

    it('leaves normal string values untouched', () => {
      expect(csvField('langgraph')).toBe('langgraph');
      expect(csvField('tr_abc123')).toBe('tr_abc123');
      expect(csvField('2026-06-01T10:00:00Z')).toBe('2026-06-01T10:00:00Z');
    });
  });
});

describe('toCsv', () => {
  it('builds a BOM-prefixed, CRLF-terminated document with a header row', () => {
    const csv = toCsv(['id', 'name'] as const, [
      { id: 1, name: 'a' },
      { id: 2, name: 'b,c' },
    ]);
    expect(csv).toBe(`${UTF8_BOM}id,name\r\n1,a\r\n2,"b,c"\r\n`);
  });

  it('starts with a UTF-8 BOM so Excel reads accents correctly', () => {
    const csv = toCsv(['n'] as const, [{ n: 'café' }]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('café');
  });

  it('emits just the header (after the BOM) for an empty record set', () => {
    expect(toCsv(['id'] as const, [])).toBe(`${UTF8_BOM}id\r\n`);
  });
});
