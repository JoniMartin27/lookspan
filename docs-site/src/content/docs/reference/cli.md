---
title: CLI options
description: The npx lookspan command-line interface.
---

```bash
npx lookspan [options]
```

## Commands

Without a command, `lookspan` starts the server. There are two subcommands:

```
  install-desktop [options]   Add a one-click desktop launcher
  uninstall-desktop           Remove it again
```

`install-desktop` registers Lookspan as a desktop app — a shortcut on the
Desktop and in the Start Menu on Windows, `~/Applications/Lookspan.app` on
macOS, a `.desktop` entry on Linux — so clicking it starts the server and opens
the dashboard. Any options you pass are baked into the launcher and validated
first, e.g. `lookspan install-desktop --port 3200 --retention 7d`.

It needs a real install (`npm install -g lookspan`) and refuses to run from the
`npx` cache, which npm is free to delete. Full details in
[Installation](/lookspan/guides/installation/#one-click-desktop-launcher).

## Options

```
  -p, --port <port>        Port to listen on            (default: 3100)
      --host <host>        Host to bind to              (default: 127.0.0.1)
      --db <path|url>      SQLite path or postgres:// URL (default: ~/.lookspan/lookspan.db)
      --retention <dur>    Prune traces older than e.g. 7d, 24h, 30m
      --token <token>      Require Authorization: Bearer <token> on the API
      --pricing <file>     Custom model pricing table (JSON)
      --alert-error                Alert when a trace fails
      --alert-cost <usd>           Alert when a trace costs more than <usd>
      --alert-tokens <n>           Alert when a trace exceeds <n> tokens
      --alert-duration <ms>        Alert when a trace takes longer than <ms>
      --openai-key <k>             OpenAI key for Replay & judge (in memory only)
      --anthropic-key <k>          Anthropic key for Replay & judge (in memory only)
      --open               Open the dashboard in your browser
  -h, --help               Show help
  -v, --version            Show version
```

A `postgres://…` value for `--db` selects the Postgres driver and connects to
that external server, so data survives Lookspan restarts under PostgreSQL's
durability policy. See
[Configuration → Postgres](/lookspan/reference/configuration/#postgres).

Every flag has a `LOOKSPAN_*` environment-variable equivalent
(`LOOKSPAN_PORT`, `LOOKSPAN_TOKEN`, `LOOKSPAN_PRICING`, `LOOKSPAN_ALERT_*`, …).
See the [configuration reference](/lookspan/reference/configuration/) for the
complete flag + env-var table, defaults and examples.

## Provider keys

Replay & LLM-as-judge read `LOOKSPAN_OPENAI_API_KEY` /
`LOOKSPAN_ANTHROPIC_API_KEY` (or `--openai-key` / `--anthropic-key`). These stay
**in memory** and are never persisted or logged.

## Examples

```bash
# Default: localhost:3100, ephemeral, no auth
npx lookspan

# Open the dashboard automatically
npx lookspan --open

# Different port, keep a week of history
npx lookspan -p 4000 --retention 7d

# Expose on the LAN behind a token (see Security note in Configuration)
LOOKSPAN_TOKEN=secret npx lookspan --host 0.0.0.0
```
