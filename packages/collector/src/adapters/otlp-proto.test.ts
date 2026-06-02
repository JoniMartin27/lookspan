import protobuf from 'protobufjs';
import { describe, expect, it } from 'vitest';
import { otlpToIngest } from './otlp.js';
import { decodeOtlpProtobuf } from './otlp-proto.js';

// Encoder mirroring the official OTLP field numbers, used to produce a real
// protobuf body that the decoder must read.
const ENCODE_PROTO = `
syntax = "proto3";
package t;
message Req { repeated RS resource_spans = 1; }
message RS { repeated SS scope_spans = 2; }
message SS { repeated Span spans = 2; }
message Span {
  bytes trace_id = 1; bytes span_id = 2; bytes parent_span_id = 4;
  string name = 5; fixed64 start_time_unix_nano = 7; fixed64 end_time_unix_nano = 8;
  repeated KV attributes = 9; Status status = 15;
}
message Status { uint32 code = 3; }
message KV { string key = 1; AV value = 2; }
message AV { string string_value = 1; int64 int_value = 3; }
`;
const Req = protobuf.parse(ENCODE_PROTO).root.lookupType('t.Req');

describe('decodeOtlpProtobuf', () => {
  it('decodes a protobuf request into the JSON OTLP shape (ids hex, times string)', () => {
    const buffer = Req.encode(
      Req.create({
        resourceSpans: [
          {
            scopeSpans: [
              {
                spans: [
                  {
                    traceId: Uint8Array.from([0xab, 0xcd, 0x01]),
                    spanId: Uint8Array.from([0x10, 0x20]),
                    name: 'chat',
                    startTimeUnixNano: 1717236000000000000,
                    endTimeUnixNano: 1717236001000000000,
                    status: { code: 2 },
                    attributes: [
                      { key: 'gen_ai.request.model', value: { stringValue: 'gpt-4o' } },
                      { key: 'gen_ai.usage.input_tokens', value: { intValue: 100 } },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      }),
    ).finish();

    const decoded = decodeOtlpProtobuf(buffer);
    const { spans, source } = otlpToIngest(decoded);

    expect(source).toBe('otlp');
    expect(spans).toHaveLength(1);
    expect(spans[0]).toMatchObject({
      traceId: 'abcd01',
      spanId: '1020',
      name: 'chat',
      status: 'error',
      type: 'llm_call',
      model: 'gpt-4o',
      framework: 'otlp',
    });
    expect(spans[0].startedAt).toBe('2024-06-01T10:00:00.000Z');
    expect(spans[0].usage).toMatchObject({ inputTokens: 100 });
  });

  it('handles an empty request', () => {
    const buffer = Req.encode(Req.create({})).finish();
    expect(otlpToIngest(decodeOtlpProtobuf(buffer)).spans).toEqual([]);
  });
});
