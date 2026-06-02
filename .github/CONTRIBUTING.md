# Contributing to Lookspan

Thanks for your interest! Lookspan is a local-first observability dashboard for
AI agents, MCP-native, built as an npm-workspaces monorepo.

## Getting started

```bash
git clone https://github.com/JoniMartin27/lookspan.git
cd lookspan
npm install
npm run dev          # API on :3100, dashboard on :5173
```

## Before opening a PR

Run the full pipeline — it must be green:

```bash
npm run ci           # typecheck + lint + test + build
```

- **Tests**: add Vitest tests for new logic (`*.test.ts` next to the source).
- **Format/lint**: Biome. Run `npm run fix` to auto-format.
- **Commits**: conventional-ish prefixes (`feat:`, `fix:`, `docs:`, `test:`…).

## Project layout

- `packages/types` — shared TypeScript types (published).
- `packages/events` — in-process event bus.
- `packages/storage` — SQLite schema, migrations, repositories.
- `packages/collector` — ingest pipeline (validation, cost, redaction, alerts, OTLP).
- `packages/api` — Express HTTP + SSE server.
- `packages/sdk-mcp` — MCP instrumentation SDK (published as `@lookspan/mcp`).
- `packages/cli` — the `lookspan` binary (published; bundles the dashboard).
- `apps/dashboard` — React + Vite UI.
- `python/` — Python SDKs (core, langgraph, crewai).

## Good first issues

Look for the `good first issue` label. Adding a framework adapter, a pricing
entry, or an example is a great first contribution.

## Releasing

See [PUBLISHING.md](../PUBLISHING.md).
