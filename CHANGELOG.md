# Changelog

## 0.1.1 — 2026-06-03

### Added
- **`@lookspan/openai`** — drop-in tracing: `observeOpenAI(new OpenAI())` traces
  every model call in one line (no OTel, no proxy).
- **Sessions** — `/sessions` list + per-session multi-agent timeline (ordinal
  axis, hover preview); `GET /api/sessions` and `/api/sessions/:id`.
- **Connect page** (`/connect`) — copy-paste onboarding with the live endpoint.
- **Evaluation scores** — `POST /api/traces/:id/scores`, shown in the trace view.
- **Agent visualization** — `agentId` column + per-agent color in the span graph;
  span detail drawer on click; left-to-right graph layout.
- **OTLP protobuf** — `/v1/traces` now accepts `application/x-protobuf` (the OTel
  default) as well as JSON.

### Changed
- Trace list is paginated (cursor + "Load more").
- All packages unified at 0.1.1.

## 0.1.0 — 2026-06-02

First public release. Published to **npm** (`lookspan`, `@lookspan/mcp`,
`@lookspan/types`) and **PyPI** (`lookspan`, `lookspan-langgraph`,
`lookspan-crewai`).

### Added
- **`npx lookspan`** — self-contained CLI that bundles the dashboard and serves
  API + UI from a single process on `:3100`.
- **Publishable SDKs** — `@lookspan/mcp` (npm) and `lookspan` (PyPI, with
  LangGraph and CrewAI adapters).
- **OpenTelemetry** — OTLP/HTTP receiver at `POST /v1/traces`; any OTel exporter
  works with no Lookspan SDK.
- **Cost tracking** — server-side `cost_usd` from a model pricing table,
  overridable via `--pricing <file>`.
- **Stats** — error rate, latency p50/p95/p99, cost-per-day (`/api/stats`).
- **Alerts** — rules on error / cost / tokens / duration, persisted and pushed
  to the dashboard (toast + desktop notification) and the CLI.
- **Retention** — `--retention <dur>` prunes old traces and VACUUMs.
- **Security** — optional `--token` auth; server-side redaction of credential
  attributes before persistence.
- **Dashboard** — trace list with filters/search, trace span graph, costs &
  overview, alerts history; real-time via SSE.
- **Tests** — Vitest suite (100+ tests) and green CI (typecheck + lint + build).

### Notes
- Internal `@lookspan/*` packages (api, collector, storage, events) are bundled
  into the CLI and not published separately.
