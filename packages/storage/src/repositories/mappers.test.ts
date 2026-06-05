import { FrameworkName, SpanStatus, SpanType } from '@lookspan/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SpanRow, TraceRow } from '../schema.js';
import { rowToSpan, rowToTrace, rowToTraceListItem } from './mappers.js';

function traceRow(overrides: Partial<TraceRow> = {}): TraceRow {
  return {
    trace_id: 'tr_1',
    root_name: 'root',
    framework: 'mcp',
    agent_id: null,
    session_id: null,
    started_at: '2026-06-01T10:00:00Z',
    ended_at: null,
    duration_ms: null,
    status: 'ok',
    parent_trace_id: null,
    span_count: 1,
    error_count: 0,
    input_tokens: 0,
    output_tokens: 0,
    cached_input_tokens: 0,
    reasoning_tokens: 0,
    cost_usd: 0,
    attributes: null,
    created_at: '2026-06-01T10:00:00Z',
    ...overrides,
  };
}

function spanRow(overrides: Partial<SpanRow> = {}): SpanRow {
  return {
    span_id: 'sp_1',
    trace_id: 'tr_1',
    parent_span_id: null,
    type: 'llm_call',
    name: 'completion',
    started_at: '2026-06-01T10:00:00Z',
    ended_at: null,
    duration_ms: null,
    status: 'ok',
    framework: 'mcp',
    agent_id: null,
    session_id: null,
    model: null,
    provider: null,
    parent_trace_id: null,
    input: null,
    output: null,
    error: null,
    input_tokens: null,
    output_tokens: null,
    cached_input_tokens: null,
    reasoning_tokens: null,
    cost_usd: null,
    attributes: null,
    received_at: '2026-06-01T10:00:00Z',
    created_at: '2026-06-01T10:00:00Z',
    ...overrides,
  };
}

describe('enum coercion in mappers', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('passes valid enum values through unchanged', () => {
    const span = rowToSpan(spanRow({ type: 'tool_call', status: 'error', framework: 'langgraph' }));
    expect(span.type).toBe(SpanType.ToolCall);
    expect(span.status).toBe(SpanStatus.Error);
    expect(span.framework).toBe(FrameworkName.LangGraph);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('falls back to safe defaults for corrupt span enums and warns', () => {
    const span = rowToSpan(spanRow({ type: 'bogus', status: 'weird', framework: 'unknown' }));
    expect(span.type).toBe(SpanType.Custom);
    expect(span.status).toBe(SpanStatus.Error);
    expect(span.framework).toBe(FrameworkName.Custom);
    expect(console.warn).toHaveBeenCalledTimes(3);
  });

  it('coerces corrupt trace + trace-list enums without throwing', () => {
    expect(() => rowToTrace(traceRow({ framework: 'x', status: 'y' }))).not.toThrow();
    const item = rowToTraceListItem(traceRow({ framework: 'x', status: 'y' }));
    expect(item.framework).toBe(FrameworkName.Custom);
    expect(item.status).toBe(SpanStatus.Error);
  });
});
