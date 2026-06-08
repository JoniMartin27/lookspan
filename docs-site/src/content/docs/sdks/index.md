---
title: Instrument your agents
description: Pick the right adapter — OpenAI, Anthropic, MCP, Python, or OpenTelemetry.
---

Lookspan ingests spans over HTTP. You can build that payload yourself, but the
adapters do it for you — capturing model, tokens, prompt/response and timing
with no code rewrite. Pick the one that matches your stack:

| If your agent uses… | Use | Page |
|---|---|---|
| The OpenAI Node SDK | `@lookspan/openai` | [OpenAI SDK](/lookspan/sdks/openai/) |
| The Anthropic Node SDK | `@lookspan/anthropic` | [Anthropic SDK](/lookspan/sdks/anthropic/) |
| An MCP client (tool calls) | `@lookspan/mcp` | [MCP SDK](/lookspan/sdks/mcp/) |
| LangGraph / LangChain / CrewAI (Python) | `lookspan` + adapter | [Python](/lookspan/sdks/python/) |
| Any OpenTelemetry exporter | _(no SDK)_ | [OpenTelemetry](/lookspan/sdks/opentelemetry/) |
| Anything that can POST JSON | _(no SDK)_ | [HTTP API](/lookspan/reference/http-api/) |

## Shared options

The TypeScript drop-in observers (`observeOpenAI`, `observeAnthropic`) and the
MCP wrapper accept the same option bag:

| Option | Type | Default | What it does |
|---|---|---|---|
| `endpoint` | `string` | `http://127.0.0.1:3100/api/ingest` | Where spans are POSTed. |
| `exporter` | `SpanExporter` | — | Bring your own exporter (overrides `endpoint`). |
| `agentId` | `string` | — | Attribution label shown in the dashboard. |
| `sessionId` | `string` | — | Group traces from related agents into a session. |
| `parentTraceId` | `string` | — | Link this client's traces to a spawning trace (cross-agent handoff). |
| `provider` | `string` | spec default | Provider label stored on the span. |
| `captureContent` | `boolean` | `true` | Capture prompt/response so Replay & judge work. Set `false` to keep content out of Lookspan entirely. Secrets are scrubbed server-side regardless. |

`agentId`, `sessionId` and `parentTraceId` are what power the
[sessions & causality](/lookspan/guides/sessions-and-causality/) view;
`captureContent` is what enables [replay](/lookspan/guides/replay-and-diff/) and
[LLM-as-judge](/lookspan/guides/llm-as-judge/).
