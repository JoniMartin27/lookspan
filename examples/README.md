# Examples

Start Lookspan first:

```bash
npx lookspan            # http://127.0.0.1:3100
```

Then try any of these (each is self-contained):

| File | What it shows |
|------|---------------|
| [`01-http-curl.sh`](./01-http-curl.sh) | Ingest a span from any language via raw HTTP `POST /api/ingest`. |
| [`02-otel.mjs`](./02-otel.mjs) | Send an OpenTelemetry trace to the OTLP endpoint `POST /v1/traces` — no Lookspan SDK needed. |
| [`03-mcp.mjs`](./03-mcp.mjs) | Instrument an MCP client with `@lookspan/mcp` so every tool call emits a span. |
| [`pricing.example.json`](./pricing.example.json) | A custom pricing table — run `npx lookspan --pricing examples/pricing.example.json`. |

Open the dashboard at http://127.0.0.1:3100 to watch traces, costs, stats and alerts in real time.
