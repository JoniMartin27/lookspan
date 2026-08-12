---
title: Getting started
description: Run Lookspan in one command and ingest your first span.
---

Lookspan is a **local-first** observability dashboard for AI agents. It ingests
spans/traces over HTTP (or OTLP), stores them in a local SQLite file, and
renders a real-time React dashboard — all on your machine, with no account, no
API key, and no cloud.

## 1. Start the server

```bash
npx lookspan              # → http://127.0.0.1:3100, no install, no cloud
```

That single command starts the ingest API **and** serves the dashboard on the
same port. By default it binds to `127.0.0.1` (loopback only) and stores data in
`~/.lookspan/lookspan.db`.

## 2. Send your first span

You don't need an SDK to get started — any HTTP client works. Send a span from
any language:

```bash
curl -X POST http://127.0.0.1:3100/api/ingest \
  -H "Content-Type: application/json" \
  -d '{"spans":[{"traceId":"t1","spanId":"s1","parentSpanId":null,"type":"llm_call","name":"agent.run","startedAt":"2026-06-02T10:00:00Z","endedAt":"2026-06-02T10:00:01Z","status":"ok","framework":"custom","model":"gpt-4o","provider":"openai","usage":{"inputTokens":1000,"outputTokens":500,"costUsd":0}}]}'
```

## 3. Open the dashboard

Open `http://127.0.0.1:3100` in your browser and watch the trace appear — with
its cost computed server-side from the built-in pricing table.

The dashboard shows:

- **Recent traces** with a health strip and per-row latency/cost mini-bars.
- **Trace detail** as a timeline (waterfall) or tree view, plus a conversation
  transcript of the prompt/response.
- **Costs & overview** — error rate, latency p50/p95/p99, cost per day.
- **Replay diffs**, A/B run comparison, datasets, alerts history and sessions.

## Next steps

- Instrument a real agent with a [drop-in SDK](/lookspan/sdks/) instead of raw
  `curl`.
- Learn how to [replay and diff](/lookspan/guides/replay-and-diff/) a captured
  prompt against another model.
- Configure [alerts](/lookspan/guides/alerts/) for failures and budget overruns.
- See every flag and environment variable in the
  [configuration reference](/lookspan/reference/configuration/).
