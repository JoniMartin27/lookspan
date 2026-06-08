---
title: HTTP API
description: The full Lookspan ingest and query API, including the OTLP receiver.
---

Lookspan's API is served on the same port as the dashboard (default `3100`). All
`/api/*` and `/v1/*` routes can be protected with a
[bearer token](/lookspan/reference/configuration/) (`/api/health` is always
exempt).

## Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Service status. |
| `POST` | `/api/ingest` | Ingest spans (body: `IngestPayload`). |
| `GET` | `/api/traces` | List traces (paginated; filter by `framework`, `status`, `sessionId`). |
| `GET` | `/api/traces/:id` | Trace detail with all its spans and scores. |
| `POST` | `/api/traces/:id/scores` | Attach an evaluation score (`{name, value, comment?, source?}`). |
| `POST` | `/api/traces/:id/replay` | Re-run the captured prompt (`{model?, provider?, spanId?}`); needs a provider key. |
| `GET` | `/api/traces/:id/replays` | List past replays for the trace. |
| `POST` | `/api/traces/:id/judge` | LLM-as-judge: score the prompt/response (`{metric?, model?, provider?, rubric?}`). |
| `GET` `POST` | `/api/datasets` | List / create datasets. |
| `GET` | `/api/datasets/:id` | Dataset detail (items + runs). |
| `POST` | `/api/datasets/:id/items` | Add item(s) (`{input, expected?}` or `{items:[…]}`). |
| `POST` | `/api/datasets/:id/items/from-trace` | Seed an item from a trace's captured prompt. |
| `POST` | `/api/datasets/:id/run` | Run the set against a model (`{model, judge?, metric?}`); needs a provider key. |
| `GET` | `/api/runs/:id` | Run summary + per-item results. |
| `GET` | `/api/sessions` | List sessions (agents, traces, cost, errors, time range). |
| `GET` | `/api/sessions/:id` | Session summary + its traces (multi-agent timeline). |
| `GET` | `/api/costs/summary` | Cost breakdown (total, by model, provider, agent). |
| `GET` | `/api/stats` | Stats summary (totals, error rate, latency p50/p95/p99, cost per day). |
| `GET` | `/api/alerts` | History of triggered alerts. |
| `GET` | `/api/stream` | Real-time SSE event stream. |
| `POST` | `/v1/traces` | OpenTelemetry OTLP/HTTP trace receiver (JSON `ExportTraceServiceRequest`). |

## Ingesting spans

`POST /api/ingest` accepts a JSON batch of spans. Minimal example:

```bash
curl -X POST http://127.0.0.1:3100/api/ingest \
  -H "Content-Type: application/json" \
  -d '{"spans":[{"traceId":"t1","spanId":"s1","parentSpanId":null,"type":"llm_call","name":"agent.run","startedAt":"2026-06-02T10:00:00Z","endedAt":"2026-06-02T10:00:01Z","status":"ok","framework":"custom","model":"gpt-4o","provider":"openai","usage":{"inputTokens":1000,"outputTokens":500,"costUsd":0}}}]}'
```

`costUsd` can be `0` — Lookspan computes it server-side from the model and token
counts. Set `agentId` / `sessionId` / `parentSpanId` to build
[sessions and causality](/lookspan/guides/sessions-and-causality/).

## Real-time stream

`GET /api/stream` is a Server-Sent Events endpoint that pushes
`span.ingested`, `trace.updated` and `alert.triggered` events to the dashboard —
no polling. This is how the UI stays live and how
[alerts](/lookspan/guides/alerts/) surface instantly.

## OTLP receiver

`POST /v1/traces` is a native OpenTelemetry receiver — both protobuf (the OTel
default) and JSON are accepted. See
[OpenTelemetry](/lookspan/sdks/opentelemetry/) for attribute mapping.
