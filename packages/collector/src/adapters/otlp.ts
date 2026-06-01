import type { IngestPayload, SpanInput, SpanStatus, SpanType } from '@lookspan/types';

/**
 * Minimal OTLP/HTTP trace ingestion. Converts an OpenTelemetry
 * `ExportTraceServiceRequest` (JSON) into a Lookspan ingest payload so any
 * OTel-instrumented app can export with no Lookspan SDK.
 *
 * Field names are read in both camelCase (proto3 JSON default) and snake_case
 * (what several exporters emit). trace/span ids are passed through verbatim —
 * Lookspan only needs a stable string id, not the decoded bytes.
 */

// --- OTLP attribute decoding -------------------------------------------------

interface OtlpAnyValue {
  stringValue?: string;
  string_value?: string;
  boolValue?: boolean;
  bool_value?: boolean;
  intValue?: string | number;
  int_value?: string | number;
  doubleValue?: number;
  double_value?: number;
  arrayValue?: { values?: OtlpAnyValue[] };
  array_value?: { values?: OtlpAnyValue[] };
  kvlistValue?: { values?: OtlpKeyValue[] };
  kvlist_value?: { values?: OtlpKeyValue[] };
}

interface OtlpKeyValue {
  key?: string;
  value?: OtlpAnyValue;
}

function decodeValue(v: OtlpAnyValue | undefined): unknown {
  if (!v) return null;
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.string_value !== undefined) return v.string_value;
  if (v.boolValue !== undefined) return v.boolValue;
  if (v.bool_value !== undefined) return v.bool_value;
  const intVal = v.intValue ?? v.int_value;
  if (intVal !== undefined) return typeof intVal === 'string' ? Number(intVal) : intVal;
  if (v.doubleValue !== undefined) return v.doubleValue;
  if (v.double_value !== undefined) return v.double_value;
  const arr = v.arrayValue ?? v.array_value;
  if (arr) return (arr.values ?? []).map(decodeValue);
  const kv = v.kvlistValue ?? v.kvlist_value;
  if (kv) return decodeAttributes(kv.values ?? []);
  return null;
}

function decodeAttributes(attrs: OtlpKeyValue[] | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const a of attrs ?? []) {
    if (a.key) out[a.key] = decodeValue(a.value);
  }
  return out;
}

// --- span shape --------------------------------------------------------------

interface OtlpSpan {
  traceId?: string;
  trace_id?: string;
  spanId?: string;
  span_id?: string;
  parentSpanId?: string;
  parent_span_id?: string;
  name?: string;
  startTimeUnixNano?: string | number;
  start_time_unix_nano?: string | number;
  endTimeUnixNano?: string | number;
  end_time_unix_nano?: string | number;
  status?: { code?: number | string };
  attributes?: OtlpKeyValue[];
}

interface OtlpScopeSpans {
  spans?: OtlpSpan[];
}

interface OtlpResourceSpans {
  resource?: { attributes?: OtlpKeyValue[] };
  scopeSpans?: OtlpScopeSpans[];
  scope_spans?: OtlpScopeSpans[];
}

interface OtlpExportRequest {
  resourceSpans?: OtlpResourceSpans[];
  resource_spans?: OtlpResourceSpans[];
}

function nanosToIso(nanos: string | number | undefined): string | null {
  if (nanos === undefined || nanos === null) return null;
  const n = typeof nanos === 'string' ? Number(nanos) : nanos;
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n / 1_000_000).toISOString();
}

function spanType(attrs: Record<string, unknown>): SpanType {
  const hasGenAi = Object.keys(attrs).some((k) => k.startsWith('gen_ai.') || k.startsWith('llm.'));
  if (hasGenAi) return 'llm_call';
  if ('db.system' in attrs || 'retrieval.query' in attrs) return 'retrieval';
  if ('tool.name' in attrs || 'tool_name' in attrs) return 'tool_call';
  return 'custom';
}

function statusFromCode(code: number | string | undefined): SpanStatus {
  // OTLP StatusCode: 0=UNSET, 1=OK, 2=ERROR (numeric) or string enum.
  if (code === 2 || code === 'STATUS_CODE_ERROR') return 'error';
  return 'ok';
}

function num(attrs: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const k of keys) {
    const v = attrs[k];
    if (typeof v === 'number') return v;
    if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  }
  return undefined;
}

function str(attrs: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = attrs[k];
    if (typeof v === 'string' && v) return v;
  }
  return undefined;
}

function convertSpan(span: OtlpSpan): SpanInput | null {
  const traceId = span.traceId ?? span.trace_id;
  const spanId = span.spanId ?? span.span_id;
  const startedAt = nanosToIso(span.startTimeUnixNano ?? span.start_time_unix_nano);
  if (!traceId || !spanId || !startedAt) return null;

  const attrs = decodeAttributes(span.attributes);
  const parent = span.parentSpanId ?? span.parent_span_id;
  const inputTokens = num(attrs, 'gen_ai.usage.input_tokens', 'llm.usage.prompt_tokens');
  const outputTokens = num(attrs, 'gen_ai.usage.output_tokens', 'llm.usage.completion_tokens');

  return {
    traceId,
    spanId,
    parentSpanId: parent && parent.length > 0 ? parent : null,
    type: spanType(attrs),
    name: span.name ?? 'span',
    startedAt,
    endedAt: nanosToIso(span.endTimeUnixNano ?? span.end_time_unix_nano),
    status: statusFromCode(span.status?.code),
    framework: 'otlp',
    model: str(attrs, 'gen_ai.request.model', 'gen_ai.response.model', 'llm.model_name') ?? null,
    provider: str(attrs, 'gen_ai.system', 'llm.vendor') ?? null,
    usage:
      inputTokens !== undefined || outputTokens !== undefined
        ? { inputTokens: inputTokens ?? 0, outputTokens: outputTokens ?? 0, costUsd: 0 }
        : null,
    attributes: Object.keys(attrs).length > 0 ? attrs : null,
  };
}

/** Convert an OTLP ExportTraceServiceRequest into a Lookspan ingest payload. */
export function otlpToIngest(payload: unknown): IngestPayload {
  const req = (payload ?? {}) as OtlpExportRequest;
  const resourceSpans = req.resourceSpans ?? req.resource_spans ?? [];
  const spans: SpanInput[] = [];

  for (const rs of resourceSpans) {
    const scopeSpans = rs.scopeSpans ?? rs.scope_spans ?? [];
    for (const ss of scopeSpans) {
      for (const otlpSpan of ss.spans ?? []) {
        const converted = convertSpan(otlpSpan);
        if (converted) spans.push(converted);
      }
    }
  }

  return { spans, source: 'otlp' };
}
