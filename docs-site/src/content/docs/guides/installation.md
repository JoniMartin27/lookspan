---
title: Installation
description: Install and run Lookspan with npx, or build it from source.
---

## Requirements

- **Node.js ≥ 20** — Lookspan ships as an npm package and runs on the Node
  runtime.
- That's it. Storage is a local SQLite file; nothing else to install.

## Run with npx (recommended)

The fastest path is to run the CLI directly — no global install, no cloud:

```bash
npx lookspan              # → http://127.0.0.1:3100
```

The first run downloads the `lookspan` package and starts the server. Add
`--open` to launch the dashboard in your browser automatically:

```bash
npx lookspan --open
```

## Global install

If you prefer a persistent command:

```bash
npm install -g lookspan
lookspan
```

## Where data lives

By default Lookspan stores everything in a single SQLite file at
`~/.lookspan/lookspan.db`, created on first run. Override it with `--db` /
`LOOKSPAN_DB`, and optionally point it at Postgres
(`postgres://…`) — see the
[configuration reference](/lookspan/reference/configuration/).

## SDK packages

Instrumentation lives in separate, installable packages so your agent project
only pulls in what it needs:

| Package | Install | Purpose |
|---|---|---|
| `@lookspan/openai` | `npm install @lookspan/openai` | Wrap the OpenAI client |
| `@lookspan/anthropic` | `npm install @lookspan/anthropic` | Wrap the Anthropic client |
| `@lookspan/mcp` | `npm install @lookspan/mcp` | Wrap any MCP client |
| `lookspan` (PyPI) | `pip install lookspan` | Generic Python client |
| `lookspan-langgraph` | `pip install lookspan-langgraph` | LangGraph/LangChain callback |
| `lookspan-crewai` | `pip install lookspan-crewai` | CrewAI adapter |

See [Instrument your agents](/lookspan/sdks/) for usage of each.

## Build from source

Lookspan is an npm-workspaces monorepo. To hack on it:

```bash
git clone https://github.com/JoniMartin27/lookspan.git
cd lookspan
npm install
npm run dev        # API on :3100, dashboard with hot-reload on :5173
npm run ci         # typecheck + lint + test + build
```

`packages/` holds the internal libraries, `apps/` the dashboard, `python/` the
standalone Python SDKs.
