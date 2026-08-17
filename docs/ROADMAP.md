# Roadmap

Lookspan's wedge: **the zero-setup observability layer for the TypeScript / MCP
agent stack.** Not a Langfuse clone — the local-first, one-command tool with the
best 5-minute experience for JS/TS and Model Context Protocol developers.

## P0 — Make it installable (unblocks everything)

- [x] **`npx lookspan` works for real** — CLI bundles the dashboard + inlines the
      internal `@lookspan/*` deps; verified from a clean `npm pack` install.
- [x] **SDK release metadata aligned** — the TypeScript packages share the npm
      workspace version; the Python packages share that version in source and
      are ready for the separately gated PyPI release.
- [x] **One-click desktop launcher** — `lookspan install-desktop` registers
      Lookspan as a real desktop app (Desktop + Start Menu on Windows,
      `~/Applications` on macOS, an app-menu entry on Linux), with its own icon
      on Windows and Linux.
- [x] **Discovery** — README (English primary, Spanish in `README.es.md`) with
      badges, quickstart, comparison, `examples/`, and a recorded demo GIF
      (`docs/demo.gif`).

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
- [x] **Community assets** — `examples/`, `.github/` (CI, CONTRIBUTING, templates),
      and a dedicated Astro Starlight docs site under `docs-site/`.

## P2 — Depth & parity

- [x] **Lightweight evals** — attach scores to a trace (`POST /api/traces/:id/scores`),
      shown in the trace detail + addable from the UI.
- [x] **LLM-as-judge** — `POST /api/traces/:id/judge` scores a trace's prompt/response
      0–1 with a judge model and stores it as an `llm-judge` score. Needs a provider
      key (`LOOKSPAN_OPENAI_API_KEY` / `LOOKSPAN_ANTHROPIC_API_KEY`), held in memory only.
- [x] **Replay / diff** — `POST /api/traces/:id/replay` re-runs a trace's captured
      prompt against the same or another model and shows a cost/latency/output diff
      in the trace's **Replay & judge** panel. (Capturing prompts requires the SDK's
      `captureContent`, off by default; secrets are scrubbed server-side.)
- [x] **Datasets & experiments** — collect prompts into a test set (seed from a
      trace or by hand), run the whole set against a model in batch, and score each
      output with the judge — aggregate cost/latency/score per run. `/datasets` +
      `/runs/:id` in the dashboard; SQLite migration v7.
- [x] **External Postgres persistence** — a `postgres://…` URL for `--db` /
      `LOOKSPAN_DB` connects to the configured PostgreSQL server through a
      worker-backed `pg` client. The same schema, migrations, SQL translation,
      repository interface and transactions are shared with SQLite. SQLite
      stays the local-first default; a per-batch span cap already guards
      against floods. (Sampling still open.)

## Review hardening (done in 0.1.1)

Cost no longer double-charges cached tokens · per-batch span cap · secret-value
redaction (not just keys) · streaming traced correctly · OTLP protobuf · trace
pagination · API + Python tests · unified versions.

## Non-goals (for now)

- Full eval platform parity with Braintrust/Langfuse.
- Hosted cloud offering. Lookspan is local-first by design.

## Still open

- **Sampling** for high-volume ingest.
- **macOS launcher icon** — the `.app` uses the system default; it needs an
  `.icns` bundle.

## Human-gated steps (not automatable here)

- npm publish / PyPI upload still needs maintainer credentials. CI now validates
  the packaged npm artifact and the repository keeps npm/PyPI source versions
  aligned so a tag can be released without a silent version split.
- Launch posts (Show HN, r/LocalLLaMA, MCP community, dev.to).
