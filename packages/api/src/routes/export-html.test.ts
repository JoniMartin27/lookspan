import type { Trace } from '@lookspan/types';
import { describe, expect, it } from 'vitest';
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
});
