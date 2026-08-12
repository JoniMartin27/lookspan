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

## One-click desktop launcher

Once Lookspan is installed globally, it can add itself to your desktop so you
open it the way you open anything else — by clicking an icon:

```bash
lookspan install-desktop
```

| Platform | What it creates |
|---|---|
| Windows | `Lookspan.lnk` on the Desktop **and** in the Start Menu (starts minimized) |
| macOS | `~/Applications/Lookspan.app` |
| Linux | `~/.local/share/applications/lookspan.desktop` (appears in your app menu) |

Clicking it starts the server and opens the dashboard — no terminal involved.

Any options you pass are baked into the launcher, so it always starts the way
you want:

```bash
lookspan install-desktop --port 3200 --retention 7d
```

Those options are validated before anything is written, so a typo fails now
rather than producing an icon that does nothing when clicked.

Remove it with:

```bash
lookspan uninstall-desktop
```

:::caution[Needs a real install]
`install-desktop` refuses to run from the `npx` cache. npm is free to delete
that cache, which would leave you with a shortcut pointing at nothing — install
with `npm install -g lookspan` first.
:::

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
