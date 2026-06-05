import { describe, expect, it } from 'vitest';
import { otlpToIngest } from './otlp.js';

function req(spans: unknown[]) {
  return {
    resourceSpans: [{ resource: { attributes: [] }, scopeSpans: [{ spans }] }],
  };
}

const START = '1717236000000000000'; // 2024-06-01T10:00:00Z in unix nanos
const END = '1717236001000000000';

describe('otlpToIngest', () => {
  it('converts a minimal OTLP span', () => {
    const { spans, source } = otlpToIngest(
      req([
        {
          traceId: 'abc',
          spanId: 'def',
          name: 'op',
          startTimeUnixNano: START,
          endTimeUnixNano: END,
        },
      ]),
    );
    expect(source).toBe('otlp');
    expect(spans).toHaveLength(1);
    expect(spans[0]).toMatchObject({
      traceId: 'abc',
      spanId: 'def',
      parentSpanId: null,
      name: 'op',
      framework: 'otlp',
      type: 'custom',
      status: 'ok',
    });
    expect(spans[0].startedAt).toBe('2024-06-01T10:00:00.000Z');
    expect(spans[0].endedAt).toBe('2024-06-01T10:00:01.000Z');
  });

  it('maps ERROR status code to error', () => {
    const { spans } = otlpToIngest(
      req([
        { traceId: 't', spanId: 's', name: 'x', startTimeUnixNano: START, status: { code: 2 } },
      ]),
    );
    expect(spans[0].status).toBe('error');
  });

  it('classifies gen_ai spans as llm_call and extracts model/provider/tokens', () => {
    const { spans } = otlpToIngest(
      req([
        {
          traceId: 't',
          spanId: 's',
          name: 'chat',
          startTimeUnixNano: START,
          attributes: [
            { key: 'gen_ai.system', value: { stringValue: 'openai' } },
            { key: 'gen_ai.request.model', value: { stringValue: 'gpt-4o' } },
            { key: 'gen_ai.usage.input_tokens', value: { intValue: '100' } },
            { key: 'gen_ai.usage.output_tokens', value: { intValue: 50 } },
          ],
        },
      ]),
    );
    expect(spans[0].type).toBe('llm_call');
    expect(spans[0].model).toBe('gpt-4o');
    expect(spans[0].provider).toBe('openai');
    expect(spans[0].usage).toEqual({ inputTokens: 100, outputTokens: 50, costUsd: 0 });
  });

  it('decodes nested attribute value types', () => {
    const { spans } = otlpToIngest(
      req([
        {
          traceId: 't',
          spanId: 's',
          name: 'x',
          startTimeUnixNano: START,
          attributes: [
            { key: 'flag', value: { boolValue: true } },
            { key: 'count', value: { doubleValue: 1.5 } },
            {
              key: 'tags',
              value: { arrayValue: { values: [{ stringValue: 'a' }, { stringValue: 'b' }] } },
            },
          ],
        },
      ]),
    );
    expect(spans[0].attributes).toMatchObject({ flag: true, count: 1.5, tags: ['a', 'b'] });
  });

  it('reads snake_case field names too', () => {
    const payload = {
      resource_spans: [
        {
          scope_spans: [
            { spans: [{ trace_id: 't', span_id: 's', name: 'x', start_time_unix_nano: START }] },
          ],
        },
      ],
    };
    const { spans } = otlpToIngest(payload);
    expect(spans).toHaveLength(1);
    expect(spans[0].traceId).toBe('t');
  });

  it('skips spans missing required ids or start time', () => {
    const { spans } = otlpToIngest(
      req([
        { spanId: 's', name: 'no-trace', startTimeUnixNano: START },
        { traceId: 't', spanId: 's2', name: 'no-start' },
      ]),
    );
    expect(spans).toHaveLength(0);
  });

  it('drops an out-of-range timestamp without throwing', () => {
    // nanos so large that ms exceeds the max representable Date; the old code
    // threw RangeError from toISOString() and 500'd the ingest.
    expect(() =>
      otlpToIngest(
        req([{ traceId: 't', spanId: 's', name: 'huge', startTimeUnixNano: `9${'0'.repeat(21)}` }]),
      ),
    ).not.toThrow();
    const { spans } = otlpToIngest(
      req([{ traceId: 't', spanId: 's', name: 'huge', startTimeUnixNano: `9${'0'.repeat(21)}` }]),
    );
    expect(spans).toHaveLength(0); // dropped because startedAt is null
  });

  it('returns an empty payload for junk input', () => {
    expect(otlpToIngest(null).spans).toEqual([]);
    expect(otlpToIngest({}).spans).toEqual([]);
  });
});
