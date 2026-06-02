import protobuf from 'protobufjs';

// Minimal subset of opentelemetry/proto/.../trace.proto + common.proto, with the
// official field numbers. Protobuf skips unknown fields, so decoding only the
// fields `otlpToIngest` reads is safe and forward-compatible.
const OTLP_PROTO = `
syntax = "proto3";
package lookspan.otlp;

message ExportTraceServiceRequest { repeated ResourceSpans resource_spans = 1; }
message ResourceSpans {
  Resource resource = 1;
  repeated ScopeSpans scope_spans = 2;
}
message Resource { repeated KeyValue attributes = 1; }
message ScopeSpans { repeated Span spans = 2; }
message Span {
  bytes trace_id = 1;
  bytes span_id = 2;
  string trace_state = 3;
  bytes parent_span_id = 4;
  string name = 5;
  uint32 kind = 6;
  fixed64 start_time_unix_nano = 7;
  fixed64 end_time_unix_nano = 8;
  repeated KeyValue attributes = 9;
  Status status = 15;
}
message Status { string message = 2; uint32 code = 3; }
message KeyValue { string key = 1; AnyValue value = 2; }
message AnyValue {
  string string_value = 1;
  bool bool_value = 2;
  int64 int_value = 3;
  double double_value = 4;
  ArrayValue array_value = 5;
  KeyValueList kvlist_value = 6;
  bytes bytes_value = 7;
}
message ArrayValue { repeated AnyValue values = 1; }
message KeyValueList { repeated KeyValue values = 1; }
`;

const root = protobuf.parse(OTLP_PROTO).root;
const ExportTraceServiceRequest = root.lookupType('lookspan.otlp.ExportTraceServiceRequest');

function hex(bytes: Uint8Array | undefined): string {
  if (!bytes || bytes.length === 0) return '';
  let s = '';
  for (const b of bytes) s += b.toString(16).padStart(2, '0');
  return s;
}

// biome-ignore lint/suspicious/noExplicitAny: protobuf.js decoded messages are dynamic
type Any = any;

/**
 * Decode an OTLP/HTTP protobuf `ExportTraceServiceRequest` body into the same
 * shape `otlpToIngest` consumes from JSON. trace/span ids become hex strings,
 * fixed64 timestamps become numeric strings.
 */
export function decodeOtlpProtobuf(buffer: Uint8Array): unknown {
  const msg = ExportTraceServiceRequest.decode(buffer);
  const obj = ExportTraceServiceRequest.toObject(msg, {
    longs: String, // fixed64 → numeric string
    enums: Number,
    bytes: Array, // bytes → number[]; we hex-encode ids below
    defaults: false,
    arrays: true,
    objects: true,
  }) as Any;

  for (const rs of obj.resourceSpans ?? []) {
    for (const ss of rs.scopeSpans ?? []) {
      for (const span of ss.spans ?? []) {
        span.traceId = hex(span.traceId);
        span.spanId = hex(span.spanId);
        if (span.parentSpanId) span.parentSpanId = hex(span.parentSpanId);
      }
    }
  }
  return obj;
}
