import type { Trace } from '@lookspan/types';
import { describe, expect, it } from 'vitest';
import { CSV_COLUMNS, toCsvRow } from './export.js';
import { type ExportProvenance, renderHtmlReport } from './export-html.js';

function trace(over: Partial<Trace> = {}): Trace {
  return {
    traceId: 'tr_x',
    rootName: 'root',
    framework: 'mcp',
    agentId: null,
    sessionId: null,
    parentTraceId: null,
    startedAt: '2026-06-01T10:00:00Z',
    endedAt: '2026-06-01T10:00:01Z',
    durationMs: 1000,
    status: 'ok',
    spanCount: 1,
    errorCount: 0,
    totalUsage: { inputTokens: 100, outputTokens: 50 },
    costUsd: 0.01,
    attributes: null,
    ...over,
  };
}

const provenance: ExportProvenance = {
  tool: 'lookspan',
  version: '9.9.9',
  exportedAt: '2026-06-12T00:00:00.000Z',
  filters: { framework: 'mcp' },
  count: 2,
  truncated: false,
  totalAvailable: 2,
  sha256: 'a'.repeat(64),
};

const columns = ['traceId', 'framework', 'status', 'costUsd'] as const;

function rowsFor(traces: Trace[]): Record<string, unknown>[] {
  return traces.map((t) => ({
    traceId: t.traceId,
    framework: t.framework,
    status: t.status,
    costUsd: t.costUsd,
  }));
}

describe('renderHtmlReport', () => {
  const traces = [
    trace({ traceId: 'tr_1', status: 'ok', framework: 'mcp', costUsd: 0.02 }),
    trace({
      traceId: 'tr_2',
      status: 'error',
      framework: 'langgraph',
      costUsd: 0.05,
      startedAt: '2026-06-02T10:00:00Z',
    }),
  ];

  it('produces a self-contained HTML document with no external resources', () => {
    const html = renderHtmlReport(traces, rowsFor(traces), columns, provenance);
    expect(html.startsWith('<!doctype html>')).toBe(true);
    // Zero client deps / CDN.
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).not.toContain('<script');
  });

  it('embeds the provenance block including the CSV sha256', () => {
    const html = renderHtmlReport(traces, rowsFor(traces), columns, provenance);
    expect(html).toContain('lookspan');
    expect(html).toContain('9.9.9');
    expect(html).toContain('2026-06-12T00:00:00.000Z');
    expect(html).toContain('framework=mcp');
    expect(html).toContain('a'.repeat(64));
  });

  it('draws hand-rolled SVG charts (no chart library)', () => {
    const html = renderHtmlReport(traces, rowsFor(traces), columns, provenance);
    expect(html).toContain('<svg');
    expect(html).toContain('Traces per day');
    expect(html).toContain('Cost per framework');
    expect(html).toContain('Status breakdown');
    expect(html).toContain('Tokens in vs out');
  });

  it('renders the trace table rows', () => {
    const html = renderHtmlReport(traces, rowsFor(traces), columns, provenance);
    expect(html).toContain('tr_1');
    expect(html).toContain('tr_2');
    expect(html).toContain('langgraph');
  });

  it('shows a truncation banner when truncated', () => {
    const truncated = { ...provenance, truncated: true, totalAvailable: 99 };
    const html = renderHtmlReport(traces, rowsFor(traces), columns, truncated);
    expect(html).toContain('Truncated');
    expect(html).toContain('99');
  });

  it('escapes HTML in trace fields to prevent injection', () => {
    const evil = [trace({ traceId: '<script>alert(1)</script>', rootName: 'x' })];
    const html = renderHtmlReport(evil, rowsFor(evil), columns, provenance);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  /**
   * The report is a file that leaves the machine: it gets downloaded, archived
   * and opened, sometimes by somebody who was not there when it was made. An
   * agent does not control what a user types at it, so any of these fields can
   * carry whatever a prompt put in them.
   *
   * The check above only ever covered `traceId`. Attacking the running server
   * with five payloads and opening the report in a browser showed the escaping
   * is correct today — nothing executed, no `<img>`, no `<svg onload>` — so
   * this is here to keep it that way when a column is added.
   */
  describe('escaping covers every text field the table renders', () => {
    const PAYLOADS = [
      ['a script tag', '<script>window.PWNED=1</script>'],
      ['an attribute break-out', '"><img src=x onerror="window.PWNED=1">'],
      ['a single-quote break-out', "'><svg onload='window.PWNED=1'>"],
      ['a bare closing tag', '</td></tr><script>window.PWNED=1</script>'],
    ] as const;

    const TEXT_FIELDS = [
      'traceId',
      'rootName',
      'framework',
      'agentId',
      'sessionId',
      'parentTraceId',
      'status',
    ] as const;

    /** Rows built the way the export route builds them — all seventeen columns. */
    const realRows = (ts: Trace[]) => ts.map(toCsvRow) as Record<string, unknown>[];

    for (const field of TEXT_FIELDS) {
      for (const [label, payload] of PAYLOADS) {
        it(`${field} — ${label}`, () => {
          const evil = [trace({ [field]: payload } as Partial<Trace>)];
          const html = renderHtmlReport(evil, realRows(evil), CSV_COLUMNS, provenance);
          expect(html, `${field} rendered ${label} unescaped`).not.toContain(payload);
          // And the value is not simply dropped: an audit report that quietly
          // omits a field is its own kind of wrong.
          expect(html, `${field} was not rendered at all`).toContain('&lt;');
        });
      }
    }

    it('escapes quotes, even though nothing depends on it yet', () => {
      // No trace-derived value is currently interpolated into an attribute —
      // the only attribute built from a variable is the charts' `aria-label`,
      // and those titles are hardcoded. So removing the `"` → `&quot;` rule
      // leaves every other assertion here green: verified, the mutant lives.
      //
      // It stops being harmless the moment a field moves into an attribute, at
      // which point `" onmouseover=…` needs no `<` at all. Pinned so that the
      // rule cannot be dropped as dead weight on the way there.
      const evil = [trace({ rootName: 'say "hello" now' })];
      const html = renderHtmlReport(evil, realRows(evil), CSV_COLUMNS, provenance);
      expect(html).toContain('&quot;');
      expect(html).not.toContain('say "hello" now');
    });

    it('escapes the provenance block too', () => {
      // `filters` comes from the query string, so it is caller-controlled.
      const html = renderHtmlReport([], [], columns, {
        ...provenance,
        filters: { framework: '<script>window.PWNED=1</script>' },
      });
      expect(html).not.toContain('<script>window.PWNED=1</script>');
    });

    it('renders no script tag of its own', () => {
      // The report is meant to be self-contained and inert; if it ever grows a
      // legitimate `<script>`, the assertions above stop being sufficient.
      const evil = [trace({ rootName: 'x' })];
      expect(renderHtmlReport(evil, rowsFor(evil), columns, provenance)).not.toContain('<script');
    });
  });
});
