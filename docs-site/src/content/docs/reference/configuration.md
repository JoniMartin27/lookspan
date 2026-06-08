---
title: Configuration reference
description: Every Lookspan flag and environment variable, with defaults.
---

Every Lookspan setting can be passed as a **CLI flag** or an **environment
variable**. Flags win when both are set. An empty default means the feature is
off until you set it.

> Provider API keys (`--openai-key` / `--anthropic-key` /
> `LOOKSPAN_*_API_KEY`) are held **in memory only** — never written to the
> database or logged. They power [Replay](/lookspan/guides/replay-and-diff/) and
> [LLM-as-judge](/lookspan/guides/llm-as-judge/) and are read on demand.

## Server

| Flag | Env var | Default | What it does |
|---|---|---|---|
| `-p, --port <port>` | `LOOKSPAN_PORT` | `3100` | Port the ingest API + dashboard listen on. |
| `--host <host>` | `LOOKSPAN_HOST` | `127.0.0.1` | Address to bind. Use `0.0.0.0` to expose on your LAN (see Security). |
| `--db <path\|url>` | `LOOKSPAN_DB` | `~/.lookspan/lookspan.db` | SQLite file (created if missing) **or** a Postgres connection string (`postgres://…`). See [Postgres](#postgres). |
| `--retention <dur>` | `LOOKSPAN_RETENTION` | _(none)_ | Prune traces older than `<dur>` (`7d`, `24h`, `30m`). Runs on startup, then at most hourly. |
| `--token <token>` | `LOOKSPAN_TOKEN` | _(none)_ | Require `Authorization: Bearer <token>` on `/api/*` and `/v1/*` (`/api/health` is exempt). |
| `--pricing <file>` | `LOOKSPAN_PRICING` | _(built-in table)_ | Load a custom model [pricing table](/lookspan/guides/pricing-and-cost/) (JSON). |
| `--open` | — | `false` | Open the dashboard in your browser on startup. |
| — | `LOOKSPAN_DASHBOARD_DIR` | _(auto-detected)_ | Override the path to the built dashboard assets. |

## Replay & LLM-as-judge

These only matter if you use Replay / judge. Without a key those endpoints
return a clear "no key configured" error and the rest of Lookspan works
unchanged.

| Flag | Env var | Default | What it does |
|---|---|---|---|
| `--openai-key <k>` | `LOOKSPAN_OPENAI_API_KEY` | _(none)_ | OpenAI key for replaying prompts and judging outputs. |
| `--anthropic-key <k>` | `LOOKSPAN_ANTHROPIC_API_KEY` | _(none)_ | Anthropic key for the same. |
| — | `LOOKSPAN_INFERENCE_TIMEOUT_MS` | `60000` | Per-call timeout for replay/judge requests. A hung upstream is aborted. |
| — | `LOOKSPAN_INFERENCE_MAX_RETRIES` | `1` | Provider SDK retries on a failed/timed-out call. |

## Alerts

See [Alerts](/lookspan/guides/alerts/) for the full guide.

| Flag | Env var | Default | Fires when… |
|---|---|---|---|
| `--alert-error` | `LOOKSPAN_ALERT_ERROR` | off | a trace ends in `error`. |
| `--alert-cost <usd>` | `LOOKSPAN_ALERT_COST` | off | a trace costs more than `<usd>`. |
| `--alert-tokens <n>` | `LOOKSPAN_ALERT_TOKENS` | off | a trace exceeds `<n>` total tokens. |
| `--alert-duration <ms>` | `LOOKSPAN_ALERT_DURATION` | off | a trace takes longer than `<ms>`. |

## Examples

```bash
# Default: localhost, no auth
npx lookspan

# Keep 14 days of history, require a token, alert on failures and pricey runs
LOOKSPAN_RETENTION=14d LOOKSPAN_TOKEN=secret \
  npx lookspan --alert-error --alert-cost 1.00

# Enable Replay & judge with a tighter 20s provider timeout
LOOKSPAN_OPENAI_API_KEY=sk-… LOOKSPAN_INFERENCE_TIMEOUT_MS=20000 \
  npx lookspan
```

## Postgres

Lookspan is **SQLite-first** — the default, zero-config store is a single file
at `~/.lookspan/lookspan.db`, and that is the right choice for the local-first,
single-process use case Lookspan is built for.

For teams who want a shared, server-backed store, the storage layer is
**driver-selectable**: pass a Postgres connection string as the database target
and Lookspan uses the Postgres driver instead. The driver is chosen
automatically from the value — anything starting with `postgres://` or
`postgresql://` selects Postgres; everything else is treated as a SQLite path.

```bash
# Flag
npx lookspan --db postgres://lookspan:secret@db.internal:5432/lookspan

# …or env var (equivalent)
LOOKSPAN_DB=postgresql://lookspan:secret@db.internal:5432/lookspan npx lookspan

# Run migrations against Postgres without starting the server
LOOKSPAN_DB=postgres://lookspan:secret@db.internal:5432/lookspan npm run migrate
```

Both drivers implement the **same repository interfaces** and the **same schema
and migrations**, so every feature behaves identically regardless of backend.
The connection string is parsed for logging only and the password is redacted in
startup output.

> The Postgres driver currently runs queries through an in-process engine
> (`pg-mem`), which keeps the repositories synchronous while giving genuine
> Postgres-dialect, schema and migration parity (verified in CI). Persistence to
> an external Postgres *server* over the wire is a planned follow-up. To stay on
> SQLite, do nothing — it remains the default.
