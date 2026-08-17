---
title: "Lookspan: open-source Langfuse & LangSmith alternative"
description: "Lookspan is a local-first, open-source LLM observability alternative to Langfuse & LangSmith. Run npx lookspan — zero infra with local SQLite by default."
---

Looking for an **open-source, local-first alternative to Langfuse or LangSmith** — one that doesn't ask for an account, an API key, or for your production traces to be shipped to someone else's cloud? That's exactly the gap Lookspan fills.

This page is an honest comparison: where Lookspan wins, and where another tool is the better pick. We'd rather you choose the right tool than be surprised later.

## TL;DR

Lookspan is the **zero-setup observability layer for the TypeScript / MCP agent stack**. One command — `npx lookspan` — starts a dashboard with traces, a timeline/waterfall view, cost tracking, replay, LLM-as-judge and datasets. Everything runs on your machine, the default store is a single SQLite file, and **no data ever leaves your laptop** unless you point it at a cloud model for replay.

It is *not* a hosted, multi-tenant production platform with prompt management and team RBAC. If that's what you need, Langfuse or LangSmith are the mature choice.

## At a glance

| | **Lookspan** | Langfuse | LangSmith | Phoenix (Arize) | Helicone |
|---|---|---|---|---|---|
| License | **MIT (open source)** | Open source (MIT core) | Proprietary | Open source (ELv2) | Open source (Apache-2) |
| Get started | **`npx lookspan` — zero infra** | Docker + Postgres (+ ClickHouse self-host) | Cloud account / SaaS | `pip install arize-phoenix` | Cloud, or self-host via Docker |
| Default storage | **local SQLite** (optional Postgres) | Postgres + ClickHouse | their cloud | local / in-memory | their cloud / ClickHouse + Postgres |
| Where your data lives | **stays on your machine with local SQLite** (external Postgres is optional) | self-host or their cloud | their cloud (self-host on Enterprise) | local or Arize cloud | proxy/cloud or self-host |
| Primary language focus | **TypeScript/JS + MCP** | Python & JS | Python & JS | **Python** (RAG/evals) | language-agnostic (proxy) |
| Integration style | drop-in SDK · MCP wrapper · OTLP receiver · plain HTTP | SDK / OTel | SDK (LangChain-native) | OTel-native | **proxy / gateway** + async logging |
| Eval loop | **replay-vs-model diff, LLM-as-judge & datasets built in** | evals + datasets | evals + datasets | evals / experiments | scores / evals |
| OpenTelemetry | native OTLP receiver (`/v1/traces`) | yes | yes | yes (OTel-native) | partial |
| Best for | local dev & debugging agents, privacy-sensitive work | full production platform | teams already on LangChain | RAG/eval research in Python | drop-in proxy logging |

*Competitor details reflect each project's public docs at the time of writing and can change — always check their current docs. Lookspan's column is verified against this repo.*

## When Lookspan is the right call

- **You want to look at a trace in the next 60 seconds.** No Docker, no Postgres, no ClickHouse, no signup. `npx lookspan` and you're in.
- **Privacy / compliance matters.** Prompts and outputs stay on your machine in a local SQLite file. Provider keys for replay live in memory only and are never written to disk.
- **You're on the TypeScript / MCP stack.** One-line drop-ins for the OpenAI and Anthropic SDKs, a wrapper that emits a span per **MCP tool call**, and Python adapters for LangGraph/CrewAI.
- **You want the observe → improve loop locally.** Replay a captured prompt against another model and diff cost/latency/output, score it 0–1 with an LLM judge, or run a whole dataset — all without leaving the dashboard.
- **You don't want to run infrastructure.** Zero services to operate; the whole thing is a single `npx` process.

## When to pick something else

We'd rather be honest than oversell:

- **You need a hosted, multi-tenant production platform** with team RBAC, prompt versioning/management, and long-term cloud retention → a fully **self-hosted** option like **Langfuse** (open source, self-host or cloud) or **LangSmith** (if your team already lives in LangChain).
- **Your stack is Python-first and RAG/eval-heavy** → **Arize Phoenix** is OTel-native and strong on retrieval evaluation.
- **You want zero code changes via a drop-in proxy** that logs every call by routing through a gateway → **Helicone**.
- **You need massive-scale, columnar analytics over millions of traces** → a ClickHouse-backed platform (Langfuse) will outscale a single SQLite file.

Lookspan deliberately isn't trying to be those. It bets on being the **best first-five-minutes experience** for observing agents locally.

## "Is it really local?"

Yes. By default Lookspan binds to `127.0.0.1`, stores traces in `~/.lookspan/lookspan.db`, and makes no outbound network calls. The only time anything leaves your machine is if **you** opt into Replay or LLM-as-judge against a hosted model — and even then the provider key is read from the environment into memory and never persisted. The collector also redacts credential-looking values before they're stored.

## Try it

```bash
npx lookspan          # → http://127.0.0.1:3100, no install, no cloud
```

Then [send your first span](/lookspan/guides/getting-started/) — from the OpenAI/Anthropic drop-ins, an MCP wrapper, an OpenTelemetry exporter, or a plain `curl`.

If Lookspan saves you a debugging session, [give it a star on GitHub](https://github.com/JoniMartin27/lookspan) — it's the best way to help it grow.
