# Roadmap

Lookspan's wedge: **the zero-setup observability layer for the TypeScript / MCP
agent stack.** Not a Langfuse clone — the local-first, one-command tool with the
best 5-minute experience for JS/TS and Model Context Protocol developers.

## P0 — Make it installable (unblocks everything)

- [ ] **`npx lookspan` works for real** — bundle the built dashboard into the CLI
      package and inline the internal `@lookspan/*` deps so the published package
      is self-contained. Verify from a clean `npm pack` install.
- [ ] **Publish the SDKs** — `@lookspan/mcp` (npm) and `lookspan` (PyPI) so agents
      can actually be instrumented.
- [ ] **Discovery** — README with a 30-second demo GIF up top, badges, a real
      quickstart, and an honest comparison section.

## P1 — Win the niche

- [ ] **Be an OpenTelemetry backend** — any OTel SDK (OpenLLMetry, Traceloop,
      Langtrace) can point `OTEL_EXPORTER_OTLP_ENDPOINT` at Lookspan with zero
      Lookspan-specific code.
- [ ] **TS-stack adapters** — Vercel AI SDK, Mastra, LangGraph.js.
- [ ] **MCP-first story** — one-liner to wrap any MCP server/client; an
      "MCP Inspector"-style view of tool calls, args, latencies, errors.
- [ ] **Maintainable pricing** — pricing table as versioned JSON + `--pricing`
      override; documented update process.
- [ ] **Community assets** — `examples/`, `.github/` (CI, CONTRIBUTING, templates),
      docs site, comparison page.

## P2 — Depth & parity

- [ ] **Lightweight evals** — attach scores to a trace, LLM-as-judge hook,
      assertion checks.
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
