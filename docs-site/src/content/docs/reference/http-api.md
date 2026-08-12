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
| `GET` | `/api/export/traces` | Download traces as a file (`format=csv\|json\|html`; `raw=1` un-redacts JSON; same `framework`/`status`/`sessionId`/`limit` filters). |
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
  -d '{"spans":[{"traceId":"t1","spanId":"s1","parentSpanId":null,"type":"llm_call","name":"agent.run","startedAt":"2026-06-02T10:00:00Z","endedAt":"2026-06-02T10:00:01Z","status":"ok","framework":"custom","model":"gpt-4o","provider":"openai","usage":{"inputTokens":1000,"outputTokens":500,"costUsd":0}}]}'
```

`costUsd` can be `0` — Lookspan computes it server-side from the model and token
counts. Set `agentId` / `sessionId` / `parentSpanId` to build
[sessions and causality](/lookspan/guides/sessions-and-causality/).

## Exporting traces

`GET /api/export/traces` returns the trace set as a downloadable file for audit
and offline analysis. The same `framework`, `status`, `sessionId` and `limit`
filters as `/api/traces` apply, so the dashboard's **Export** button exports
exactly what's on screen.

### Formats (`format=`)

- **`csv`** (default) — a spreadsheet-friendly CSV, one **metadata** row per
  trace (id, name, framework, agent, session, timing, status, per-trace token
  counts and cost). The file starts with a **UTF-8 BOM** so Excel on Windows
  renders accents correctly, and is **formula-injection safe** (see below).
  The CSV never contains trace `attributes` or prompt bodies.
- **`json`** — the full trace objects with `totalUsage`. By default
  `attributes` are **redacted** (see PII redaction below); pass `?raw=1` to
  include them in the clear. The response wraps the traces in a provenance block.
- **`html`** — a self-contained, printable **audit report** (single file, zero
  client dependencies, no CDN): a provenance header, summary cards (trace count,
  error/cancelled rate, total cost, tokens in/out), hand-drawn inline-SVG charts
  (traces per day, cost per framework, status breakdown, tokens in vs out) and
  the full trace table. Ideal for print-to-PDF evidence.

```bash
# All traces as CSV
curl -OJ http://127.0.0.1:3100/api/export/traces

# Only failed LangGraph traces, as JSON (attributes redacted)
curl 'http://127.0.0.1:3100/api/export/traces?format=json&framework=langgraph&status=error'

# Same, but include raw attributes (may contain personal data — handle with care)
curl 'http://127.0.0.1:3100/api/export/traces?format=json&framework=langgraph&raw=1'

# A printable HTML audit report
curl -OJ 'http://127.0.0.1:3100/api/export/traces?format=html'
```

A `Content-Disposition` header sets a timestamped filename
(`lookspan-traces-<ts>.{csv,json,html}`), so `curl -OJ` and browser downloads
save it sensibly. The export is capped server-side (default 1000 traces, max
10000); raise it with `?limit=`.

### Provenance & integrity

Every response carries a tamper-evidence block so an exported file can be
attributed and verified:

| Header (all formats) | JSON / HTML field | Meaning |
| --- | --- | --- |
| `X-Lookspan-Export-Sha256` | `sha256` | SHA-256 of the exact CSV body (the canonical artefact). |
| `X-Lookspan-Export-Count` | `count` | Number of traces in the file. |
| `X-Lookspan-Export-Truncated` | `truncated` | `true` if the limit dropped matching rows. |
| — | `totalAvailable` | Rows matching the filters, ignoring the limit. |
| — | `exportedAt` | ISO 8601 UTC export timestamp. |
| — | `tool` / `version` | `"lookspan"` and the running version. |
| — | `filters` | The applied `framework`/`status`/`sessionId` filters. |

The JSON body and the HTML report footer also surface the same SHA-256 so the
hash can be recorded alongside the evidence.

### Truncation is explicit

Previously the export truncated silently at the limit. It now reports truncation
explicitly: the `X-Lookspan-Export-Truncated` header (and the `truncated` /
`totalAvailable` fields, and a visible banner in the HTML report) tell you when
matching rows were dropped. Rows are ordered `started_at ASC, trace_id ASC` for
byte-for-byte reproducibility (stable hash).

### PII redaction by default (GDPR art. 5 / 32)

**Behaviour change:** the JSON export no longer includes trace `attributes` by
default. Free-form attributes can carry personal data or secrets, so they are
omitted (data minimisation) unless you explicitly opt in with `?raw=1`. The
response includes `raw: true|false` so consumers know which they received. The
CSV and HTML exports are metadata-only and never include attributes.

### CSV / formula injection safety (CWE-1236)

String cells that begin with `=`, `+`, `-`, `@`, TAB or CR are prefixed with a
single quote (`'`) before RFC 4180 quoting, so a malicious trace name like
`=cmd|'/c calc'` can't execute as a formula when the CSV is opened in Excel,
LibreOffice or Google Sheets. The guard applies only to attacker-controllable
**string** values — numeric and boolean columns (including legitimate negative
numbers such as a `-5` cost) are never prefixed.

## Real-time stream

`GET /api/stream` is a Server-Sent Events endpoint that pushes
`span.ingested`, `trace.updated` and `alert.triggered` events to the dashboard —
no polling. This is how the UI stays live and how
[alerts](/lookspan/guides/alerts/) surface instantly.

## OTLP receiver

`POST /v1/traces` is a native OpenTelemetry receiver — both protobuf (the OTel
default) and JSON are accepted. See
[OpenTelemetry](/lookspan/sdks/opentelemetry/) for attribute mapping.
