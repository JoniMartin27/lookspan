---
title: MCP SDK
description: Trace every MCP tool call by wrapping your McpClient — @lookspan/mcp.
---

`@lookspan/mcp` is Lookspan's MCP-native SDK. It wraps any `McpClient` and emits
a `tool_call` span per MCP tool invocation, without changing your agent code.
It's also the foundation the OpenAI and Anthropic observers are built on, so it
re-exports the shared `HttpSpanExporter` and span types.

## Install

```bash
npm install @lookspan/mcp
```

## Usage

```typescript
import { wrapMcpClient, HttpSpanExporter } from '@lookspan/mcp';

const exporter = new HttpSpanExporter({ endpoint: 'http://127.0.0.1:3100/api/ingest' });
const { client } = wrapMcpClient(mcpClient, { exporter, agentId: 'my-agent' });

// Use it exactly as before — every callTool emits a tool_call span.
await client.callTool({ name: 'read_file', arguments: { path: '/tmp/foo.txt' } });
await exporter.flush();
```

`wrapMcpClient` returns `{ client, traceId, flush }`: the wrapped client, the
trace id all its tool calls share, and a `flush()` helper.

## `wrapMcpClient` options

| Option | Type | Default | What it does |
|---|---|---|---|
| `exporter` | `SpanExporter` | _(required)_ | Where spans are sent (e.g. an `HttpSpanExporter`). |
| `agentId` | `string` | — | Attribution label for the dashboard. |
| `sessionId` | `string` | — | Group related agents into a [session](/lookspan/guides/sessions-and-causality/). |
| `traceId` | `string` | auto | Reuse a trace id (e.g. to join an existing trace). |
| `rootSpanId` | `string` | — | Parent span for the tool calls (nests them under a step). |
| `captureContent` | `boolean` | `false` | Capture tool arguments and results. Enable only when they are safe to persist. |
| `attributes` | `Record<string, unknown>` | — | Extra attributes stamped on every span. |

Each tool call becomes a span named `mcp.tool.<toolName>` of type `tool_call`,
with call arguments and results omitted by default. Set `captureContent: true`
when they are safe to persist.

## `HttpSpanExporter` options

| Option | Type | Default | What it does |
|---|---|---|---|
| `endpoint` | `string` | _(required)_ | Ingest URL. |
| `flushIntervalMs` | `number` | — | Auto-flush interval. |
| `maxBatchSize` | `number` | — | Spans per POST before flushing. |
| `maxRetries` | `number` | `2` | Extra POST attempts on transient failure. |
| `retryBackoffMs` | `number` | `200` | Base backoff, doubled each retry. |
| `source` | `string` | — | Label for the exporter source. |

Spans are buffered and sent in batches; call `flush()` before your process
exits to drain anything still buffered.
