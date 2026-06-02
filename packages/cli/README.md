# lookspan

**Local-first observability dashboard for AI agents. MCP-native. One command.**

```bash
npx lookspan          # → http://127.0.0.1:3100
```

Lookspan ingests spans/traces from your agents into a local SQLite database and
shows them in a real-time dashboard — traces, costs, latency stats and alerts.
Everything runs on your machine; data never leaves it; infra cost is zero.

## Send data

Any language, via HTTP:

```bash
curl -X POST http://127.0.0.1:3100/api/ingest \
  -H "Content-Type: application/json" \
  -d '{"spans":[{"traceId":"t1","spanId":"s1","parentSpanId":null,"type":"llm_call","name":"agent.run","startedAt":"2026-06-02T10:00:00Z","endedAt":"2026-06-02T10:00:01Z","status":"ok","framework":"custom","model":"gpt-4o","provider":"openai","usage":{"inputTokens":1000,"outputTokens":500,"costUsd":0}}]}'
```

- **MCP / TypeScript**: `npm i @lookspan/mcp` — wrap any MCP client.
- **Python** (LangGraph, CrewAI, generic): `pip install lookspan`.
- **OpenTelemetry**: point `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://127.0.0.1:3100/v1/traces` — no Lookspan SDK needed.

## Options

```
npx lookspan [options]
  -p, --port <port>        default 3100
      --host <host>        default 127.0.0.1
      --db <path>          default ~/.lookspan/lookspan.db
      --retention <dur>    prune traces older than e.g. 7d, 24h
      --token <token>      require Authorization: Bearer <token>
      --pricing <file>     custom model pricing table (JSON)
      --alert-error | --alert-cost <usd> | --alert-tokens <n> | --alert-duration <ms>
      --open               open the dashboard in your browser
```

MIT · [github.com/JoniMartin27/lookspan](https://github.com/JoniMartin27/lookspan)
