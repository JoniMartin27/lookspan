# Roadmap

Lookspan's wedge: **the zero-setup observability layer for the TypeScript / MCP
agent stack.** Not a Langfuse clone — the local-first, one-command tool with the
best 5-minute experience for JS/TS and Model Context Protocol developers.

## P0 — Make it installable (unblocks everything)

- [x] **`npx lookspan` works for real** — CLI bundles the dashboard + inlines the
      internal `@lookspan/*` deps; verified from a clean `npm pack` install.
- [x] **SDKs published** — `@lookspan/mcp` + `@lookspan/types` on npm and
      `lookspan` / `lookspan-langgraph` / `lookspan-crewai` on PyPI (all v0.1.0).
- [x] **Discovery** — README (English primary, Spanish in `README.es.md`) with
      badges, quickstart, comparison, and `examples/`. *(Demo GIF still to record.)*

## P1 — Win the niche

- [x] **OpenTelemetry backend** — OTLP/HTTP receiver at `/v1/traces`; any OTel SDK
      works with no Lookspan-specific code. Example in `examples/02-otel.mjs`.
- [x] **OpenAI / Anthropic drop-in** — `@lookspan/openai` & `@lookspan/anthropic`:
      `observe*(client)` traces every call (incl. streaming) in one line.
- [x] **Sessions** — multi-agent timeline (`/sessions`), per-agent `agentId` color.
- [x] **Agent causality** — `parentTraceId` links cross-agent handoffs; the session
      renders an **Agent delegation** graph (who delegated to whom).
- [x] **TS-stack via OpenTelemetry** — Vercel AI SDK / Mastra / LangChain route their
      OTel to `/v1/traces` (recipes on the Connect page); no custom adapter needed.
- [x] **Tools view** — cross-trace tool-call inspector (MCP & frameworks).
- [x] **Eval score aggregates** — average per metric on the Overview.
- [x] **Maintainable pricing** — `--pricing <file>` JSON override.
- [x] **Community assets** — `examples/`, `.github/` (CI, CONTRIBUTING, templates).
      *(Dedicated docs site still pending.)*

## P2 — Depth & parity

- [x] **Lightweight evals** — attach scores to a trace (`POST /api/traces/:id/scores`),
      shown in the trace detail + addable from the UI.
- [x] **LLM-as-judge** — `POST /api/traces/:id/judge` scores a trace's prompt/response
      0–1 with a judge model and stores it as an `llm-judge` score. Needs a provider
      key (`LOOKSPAN_OPENAI_API_KEY` / `LOOKSPAN_ANTHROPIC_API_KEY`), held in memory only.
- [x] **Replay / diff** — `POST /api/traces/:id/replay` re-runs a trace's captured
      prompt against the same or another model and shows a cost/latency/output diff
      in the trace's **Replay & judge** panel. (Capturing prompts requires the SDK's
      `captureContent`, on by default; secrets are scrubbed server-side.)
- [x] **Datasets & experiments** — collect prompts into a test set (seed from a
      trace or by hand), run the whole set against a model in batch, and score each
      output with the judge — aggregate cost/latency/score per run. `/datasets` +
      `/runs/:id` in the dashboard; SQLite migration v6.
- [ ] **Scale options** — optional Postgres driver for teams, sampling. (SQLite's
      local-first ceiling is intentional; a per-batch span cap already guards
      against floods.)

## Review hardening (done in 0.1.1)

Cost no longer double-charges cached tokens · per-batch span cap · secret-value
redaction (not just keys) · streaming traced correctly · OTLP protobuf · trace
pagination · API + Python tests · unified versions.

## Non-goals (for now)

- Full eval platform parity with Braintrust/Langfuse.
- Hosted cloud offering. Lookspan is local-first by design.

## Human-gated steps (not automatable here)

- `npm publish` / PyPI upload (needs maintainer auth + 2FA).
- Recording the demo GIF.
- Launch posts (Show HN, r/LocalLLaMA, MCP community, dev.to).
