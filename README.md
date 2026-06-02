# Lookspan

**Local-first observability dashboard for AI agents. MCP-native. See every span your agents emit.**

[![CI](https://github.com/JoniMartin27/lookspan/actions/workflows/ci.yml/badge.svg)](https://github.com/JoniMartin27/lookspan/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/lookspan)](https://www.npmjs.com/package/lookspan)
[![license](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)

```bash
npx lookspan          # → http://127.0.0.1:3100
```

<!-- TODO: record and link a 30s GIF here (npx lookspan → run an agent → watch spans live). See docs/ROADMAP.md. -->
<!-- ![Lookspan demo](docs/demo.gif) -->

```
Agent (MCP · LangGraph · CrewAI · OpenTelemetry · HTTP)  →  POST /api/ingest  →  SQLite  →  real-time dashboard
```

> 🇪🇸 ¿Prefieres español? Lee el [README en español](README.es.md).

---

## The problem

When an AI agent misbehaves — fails, stalls, or quietly burns more tokens than
expected — there's no native way to see what happened step by step. Existing
observability tools are cloud-first: they want accounts, API keys, and shipping
your production data to someone else's servers.

Lookspan takes the opposite approach: **everything runs on your machine, data
never leaves it, and infra cost is zero.** Instrument your agent with an adapter
(or just POST JSON) and open the dashboard in your browser.

---

## Quick start

```bash
npx lookspan              # → http://127.0.0.1:3100, no install, no cloud
```

Send your first span from any language:

```bash
curl -X POST http://127.0.0.1:3100/api/ingest \
  -H "Content-Type: application/json" \
  -d '{"spans":[{"traceId":"t1","spanId":"s1","parentSpanId":null,"type":"llm_call","name":"agent.run","startedAt":"2026-06-02T10:00:00Z","endedAt":"2026-06-02T10:00:01Z","status":"ok","framework":"custom","model":"gpt-4o","provider":"openai","usage":{"inputTokens":1000,"outputTokens":500,"costUsd":0}}]}'
```

Open `http://127.0.0.1:3100` and watch the trace appear — with its cost computed server-side.

---

## Features

- **HTTP span ingest** — `POST /api/ingest` accepts JSON batches of spans. Works with any agent that can make an HTTP request.
- **MCP-native** — the `@lookspan/mcp` TypeScript SDK wraps any `McpClient` and emits a span per MCP tool call, without changing your agent code.
- **Python SDKs** — `lookspan` (generic client) plus adapters for LangGraph/LangChain (`lookspan-langgraph`) and CrewAI (`lookspan-crewai`).
- **OpenTelemetry** — an OTLP/HTTP receiver at `POST /v1/traces`; point any OTel exporter at it with no Lookspan SDK. `gen_ai.*` attributes map to provider/model/tokens.
- **Real-time streaming** — SSE endpoint `GET /api/stream` pushes `span.ingested`, `trace.updated` and `alert.triggered` to the dashboard, no polling.
- **React dashboard** — recent traces with filters/search; trace detail with an interactive span graph (React Flow); costs & overview (error rate, latency p50/p95/p99, cost per day); alerts history.
- **Cost tracking** — aggregates input/output/cached/reasoning tokens and computes `cost_usd` per span and per trace from a model pricing table, overridable with `--pricing`.
- **Alerts** — get notified when a trace fails or exceeds a cost/token/duration threshold (toast + desktop notification + CLI + persisted history).
- **Evaluation scores** — attach metrics to a trace (`POST /api/traces/:id/scores`) from an LLM judge, an assertion, or by hand.
- **Local SQLite** — versioned migrations. Database at `~/.lookspan/lookspan.db` by default; configurable via flag or env var. Optional retention with `--retention`.
- **Security** — binds to `127.0.0.1` by default; optional `--token` auth; server-side redaction of credential-looking attributes before storage.
- **One-line CLI** — `npx lookspan` starts the server and the dashboard with no global install.

---

## Integrating your agents

### OpenAI SDK (drop-in)

Wrap your client in one line — every model call is traced (no OTel, no proxy):

```bash
npm install @lookspan/openai
```

```typescript
import OpenAI from 'openai';
import { observeOpenAI } from '@lookspan/openai';

const openai = observeOpenAI(new OpenAI());
await openai.chat.completions.create({ model: 'gpt-4o', messages });
```

### TypeScript / MCP

```bash
npm install @lookspan/mcp
```

```typescript
import { wrapMcpClient, HttpSpanExporter } from '@lookspan/mcp';

const exporter = new HttpSpanExporter({ endpoint: 'http://127.0.0.1:3100/api/ingest' });
const { client } = wrapMcpClient(mcpClient, { exporter, agentId: 'my-agent' });

// Use it exactly as before — every callTool emits a tool_call span.
await client.callTool({ name: 'read_file', arguments: { path: '/tmp/foo.txt' } });
await exporter.flush();
```

### Python (generic, LangGraph, CrewAI)

```bash
pip install lookspan            # + lookspan-langgraph / lookspan-crewai
```

```python
from lookspan import LookspanClient
from lookspan_langgraph import LookspanCallbackHandler

client = LookspanClient(endpoint="http://127.0.0.1:3100/api/ingest")
handler = LookspanCallbackHandler(client=client, agent_id="my-agent")

result = graph.invoke({"messages": []}, config={"callbacks": [handler]})
client.flush()
```

### OpenTelemetry (no SDK)

Point any OTel exporter at the standard OTLP endpoint:

```bash
export OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://127.0.0.1:3100/v1/traces
export OTEL_EXPORTER_OTLP_PROTOCOL=http/json
```

More runnable examples in [`examples/`](examples/).

---

## HTTP API

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Service status |
| `POST` | `/api/ingest` | Ingest spans (body: `IngestPayload`) |
| `GET` | `/api/traces` | List traces (paginated; filter by `framework`, `status`, `sessionId`) |
| `GET` | `/api/traces/:id` | Trace detail with all its spans and scores |
| `POST` | `/api/traces/:id/scores` | Attach an evaluation score (`{name, value, comment?, source?}`) |
| `GET` | `/api/sessions` | List sessions (agents, traces, cost, errors, time range) |
| `GET` | `/api/sessions/:id` | Session summary + its traces (multi-agent timeline) |
| `GET` | `/api/costs/summary` | Cost breakdown (total, by model, provider, agent) |
| `GET` | `/api/stats` | Stats summary (totals, error rate, latency p50/p95/p99, cost per day) |
| `GET` | `/api/alerts` | History of triggered alerts |
| `GET` | `/api/stream` | Real-time SSE event stream |
| `POST` | `/v1/traces` | OpenTelemetry OTLP/HTTP trace receiver (JSON `ExportTraceServiceRequest`) |

---

## CLI options

```
npx lookspan [options]
  -p, --port <port>        Port to listen on            (default: 3100)
      --host <host>        Host to bind to              (default: 127.0.0.1)
      --db <path>          SQLite database path         (default: ~/.lookspan/lookspan.db)
      --retention <dur>    Prune traces older than e.g. 7d, 24h, 30m
      --token <token>      Require Authorization: Bearer <token> on the API
      --pricing <file>     Custom model pricing table (JSON)
      --alert-error                Alert when a trace fails
      --alert-cost <usd>           Alert when a trace costs more than <usd>
      --alert-tokens <n>           Alert when a trace exceeds <n> tokens
      --alert-duration <ms>        Alert when a trace takes longer than <ms>
      --open               Open the dashboard in your browser
  -h, --help               Show help
  -v, --version            Show version
```

Every flag has a `LOOKSPAN_*` environment-variable equivalent (`LOOKSPAN_PORT`, `LOOKSPAN_TOKEN`, `LOOKSPAN_PRICING`, `LOOKSPAN_ALERT_*`, …).

---

## How it compares

| | **Lookspan** | Langfuse | Phoenix (Arize) |
|---|---|---|---|
| Startup | `npx lookspan` (zero infra) | Docker + Postgres + ClickHouse | `pip install` (Python) |
| Storage | local SQLite | Postgres + ClickHouse | local / in-memory |
| Focus | **TS/JS + MCP** stack | full platform (evals, prompts) | evals / RAG (Python) |
| Your data | never leaves your machine | self-host or cloud | local or cloud |
| OpenTelemetry | native OTLP receiver | yes | yes (OTel-native) |

Lookspan isn't trying to be a full platform. It bets on being **the zero-setup
observability layer for the TypeScript/MCP agent stack**, with the best
first-five-minutes experience. See the [ROADMAP](docs/ROADMAP.md).

---

## Security

Lookspan binds to `127.0.0.1` (loopback) and requires no auth by default — right
for local use. If you expose it (`--host 0.0.0.0`), protect it with a token:

```bash
LOOKSPAN_TOKEN=my-token npx lookspan --host 0.0.0.0
# /api/* and /v1/* then require Authorization: Bearer my-token (/api/health is exempt).
```

The collector also **redacts** values of credential-looking keys
(`authorization`, `api_key`, `token`, `secret`, `password`, `cookie`…) from
`input`/`attributes` before persisting, so telemetry never drags secrets into
the database.

---

## Development

This is an npm-workspaces monorepo. `packages/` holds internal libraries, `apps/`
the dashboard, `python/` the standalone Python SDKs.

```bash
git clone https://github.com/JoniMartin27/lookspan.git
cd lookspan
npm install
npm run dev        # API on :3100, dashboard with hot-reload on :5173
npm run ci         # typecheck + lint + test + build
```

Contributions welcome — see [.github/CONTRIBUTING.md](.github/CONTRIBUTING.md).
Release process in [docs/PUBLISHING.md](docs/PUBLISHING.md). Security policy: [SECURITY.md](SECURITY.md).

---

## License

MIT — Copyright (c) 2026 Jonathan Martin. See [LICENSE](LICENSE).
