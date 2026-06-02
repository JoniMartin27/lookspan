// OpenTelemetry → Lookspan, no Lookspan SDK required.
//
// Lookspan exposes the standard OTLP/HTTP trace endpoint at POST /v1/traces, so
// any OpenTelemetry exporter can point at it:
//
//   OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://127.0.0.1:3100/v1/traces
//   OTEL_EXPORTER_OTLP_PROTOCOL=http/json
//
// This script sends a raw OTLP JSON ExportTraceServiceRequest with the
// `gen_ai.*` semantic-convention attributes, which Lookspan maps to
// provider/model/tokens and prices automatically.
//
// Run:  node examples/02-otel.mjs
const ENDPOINT = process.env.LOOKSPAN_OTLP ?? 'http://127.0.0.1:3100/v1/traces';
const now = Date.now();
const nanos = (ms) => String(ms * 1_000_000);

const body = {
  resourceSpans: [
    {
      resource: { attributes: [{ key: 'service.name', value: { stringValue: 'otel-example' } }] },
      scopeSpans: [
        {
          spans: [
            {
              traceId: 'otelexampletrace000000000000001',
              spanId: 'otelspan00000001',
              name: 'chat.completions',
              startTimeUnixNano: nanos(now),
              endTimeUnixNano: nanos(now + 1500),
              status: { code: 1 },
              attributes: [
                { key: 'gen_ai.system', value: { stringValue: 'openai' } },
                { key: 'gen_ai.request.model', value: { stringValue: 'gpt-4o' } },
                { key: 'gen_ai.usage.input_tokens', value: { intValue: '900' } },
                { key: 'gen_ai.usage.output_tokens', value: { intValue: '120' } },
              ],
            },
          ],
        },
      ],
    },
  ],
};

const res = await fetch(ENDPOINT, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});
console.log('OTLP status', res.status, await res.json());
console.log('→ open http://127.0.0.1:3100 — the trace shows framework "otlp" with a computed cost');
