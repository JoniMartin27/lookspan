# Roadmap

Lookspan's wedge: **the zero-setup observability layer for the TypeScript / MCP
agent stack.** Not a Langfuse clone — the local-first, one-command tool with the
best 5-minute experience for JS/TS and Model Context Protocol developers.

## P0 — Make it installable (unblocks everything)

- [x] **`npx lookspan` works for real** — CLI bundles the dashboard + inlines the
      internal `@lookspan/*` deps; verified from a clean `npm pack` install.
- [x] **SDKs ready to publish** — `@lookspan/mcp` + `@lookspan/types` (npm) and the
      Python SDKs are un-private'd and versioned; see [PUBLISHING.md](PUBLISHING.md).
      *(The actual `npm publish` / PyPI upload is maintainer-gated.)*
- [x] **Discovery** — README with badges, a real quickstart, comparison section,
      and `examples/`. *(GIF still to record.)*

## P1 — Win the niche

- [x] **OpenTelemetry backend** — OTLP/HTTP receiver at `/v1/traces`; any OTel SDK
      works with no Lookspan-specific code. Example in `examples/02-otel.mjs`.
- [ ] **TS-stack adapters** — Vercel AI SDK, Mastra, LangGraph.js.
- [ ] **MCP-first story** — one-liner to wrap any MCP server/client; an
      "MCP Inspector"-style view of tool calls, args, latencies, errors.
- [x] **Maintainable pricing** — `--pricing <file>` JSON override.
- [x] **Community assets** — `examples/`, `.github/` (CI, CONTRIBUTING, templates).
      *(Dedicated docs site still pending.)*

## P2 — Depth & parity

- [x] **Lightweight evals** — attach scores to a trace (`POST /api/traces/:id/scores`),
      shown in the trace detail + addable from the UI. (LLM-as-judge/assertions
      post scores externally.)
- [ ] **Replay / diff** — re-run a trace's prompt against another model and
      compare cost/latency/output.
- [ ] **Scale options** — optional Postgres driver for teams, sampling, payload
      size limits. (Stay honest about SQLite's local-first ceiling.)

## Non-goals (for now)

- Full eval platform parity with Braintrust/Langfuse.
- Hosted cloud offering. Lookspan is local-first by design.

## Human-gated steps (not automatable here)

- `npm publish` / PyPI upload (needs maintainer auth + 2FA).
- Recording the demo GIF.
- Launch posts (Show HN, r/LocalLLaMA, MCP community, dev.to).
