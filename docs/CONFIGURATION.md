# Configuration reference

Every Lookspan setting can be passed as a **CLI flag** or an **environment
variable**. Flags win when both are set. Defaults are shown in the last column;
an empty default means the feature is off until you set it.

> Provider API keys (`--openai-key` / `--anthropic-key` /
> `LOOKSPAN_*_API_KEY`) are held **in memory only** — they are never written to
> the database or logged. They power Replay and LLM-as-judge and are read on
> demand.

## Server

| Flag | Env var | Default | What it does |
|---|---|---|---|
| `-p, --port <port>` | `LOOKSPAN_PORT` | `3100` | Port the ingest API + dashboard listen on. |
| `--host <host>` | `LOOKSPAN_HOST` | `127.0.0.1` | Address to bind. Use `0.0.0.0` to expose on your LAN (see Security). |
| `--db <path\|url>` | `LOOKSPAN_DB` | `~/.lookspan/lookspan.db` | SQLite database file (created if missing) **or** a Postgres connection string (`postgres://…` / `postgresql://…`). See [Postgres](#postgres). |
| `--retention <dur>` | `LOOKSPAN_RETENTION` | _(none)_ | Prune traces older than `<dur>` (`7d`, `24h`, `30m`). Runs on startup, then at most hourly. Unset = keep everything. |
| `--token <token>` | `LOOKSPAN_TOKEN` | _(none)_ | Require `Authorization: Bearer <token>` on `/api/*` and `/v1/*` (`/api/health` is exempt). Unset = no auth. |
| `--pricing <file>` | `LOOKSPAN_PRICING` | _(built-in table)_ | Load a custom model pricing table (JSON) to keep cost math current. |
| `--open` | — | `false` | Open the dashboard in your browser on startup. |
| — | `LOOKSPAN_DASHBOARD_DIR` | _(auto-detected)_ | Override the path to the built dashboard assets. Normally found automatically. |

## Commands

Besides running the server, the CLI takes two subcommands.

| Command | What it does |
|---|---|
| `lookspan install-desktop [options]` | Writes a one-click desktop launcher: `Lookspan.lnk` on the Desktop + Start Menu (Windows), `~/Applications/Lookspan.app` (macOS), `~/.local/share/applications/lookspan.desktop` (Linux). Any server options given are baked into it and validated first. Requires a real install (`npm install -g lookspan`) — it refuses to point a shortcut at the `npx` cache. |
| `lookspan uninstall-desktop` | Removes whatever `install-desktop` created. Safe to run when nothing is installed. |

## Replay & LLM-as-judge

These only matter if you use the Replay / judge features. Without a key, those
endpoints return a clear "no key configured" error and the rest of Lookspan
works unchanged.

| Flag | Env var | Default | What it does |
|---|---|---|---|
| `--openai-key <k>` | `LOOKSPAN_OPENAI_API_KEY` | _(none)_ | OpenAI key for replaying prompts and judging outputs. |
| `--anthropic-key <k>` | `LOOKSPAN_ANTHROPIC_API_KEY` | _(none)_ | Anthropic key for the same. |
| — | `LOOKSPAN_INFERENCE_TIMEOUT_MS` | `60000` | Per-call timeout for replay/judge requests to the provider. A hung upstream is aborted instead of holding the request open. |
| — | `LOOKSPAN_INFERENCE_MAX_RETRIES` | `1` | How many times the provider SDK retries a failed/timed-out call. Non-numeric or non-positive values fall back to the default. |

## Alerts

Thresholds that flag a trace in the dashboard. Each can be a flag or an env var.

| Flag | Env var | Default | Fires when… |
|---|---|---|---|
| `--alert-error` | `LOOKSPAN_ALERT_ERROR` | off | a trace ends in `error`. |
| `--alert-cost <usd>` | `LOOKSPAN_ALERT_COST` | off | a trace costs more than `<usd>`. |
| `--alert-tokens <n>` | `LOOKSPAN_ALERT_TOKENS` | off | a trace exceeds `<n>` total tokens. |
| `--alert-duration <ms>` | `LOOKSPAN_ALERT_DURATION` | off | a trace takes longer than `<ms>`. |

## Examples

```bash
# Default: localhost, ephemeral, no auth
npx lookspan

# Keep 14 days of history, require a token, alert on failures and pricey runs
LOOKSPAN_RETENTION=14d LOOKSPAN_TOKEN=secret \
  npx lookspan --alert-error --alert-cost 1.00

# Enable Replay & judge with a tighter 20s provider timeout
LOOKSPAN_OPENAI_API_KEY=sk-… LOOKSPAN_INFERENCE_TIMEOUT_MS=20000 \
  npx lookspan
```

## Postgres

Lookspan is **SQLite-first** — the default, zero-config store is a single
file at `~/.lookspan/lookspan.db`, and that is the right choice for the
local-first, single-process use case Lookspan is built for.

For teams who want a shared, server-backed store, the storage layer is
**driver-selectable**: pass a Postgres connection string as the database
target and Lookspan uses the Postgres driver instead of SQLite. The driver is
chosen automatically from the value — anything starting with `postgres://` or
`postgresql://` selects Postgres; everything else is treated as a SQLite path.

```bash
# Flag
npx lookspan --db postgres://lookspan:secret@db.internal:5432/lookspan

# …or env var (equivalent)
LOOKSPAN_DB=postgresql://lookspan:secret@db.internal:5432/lookspan npx lookspan

# Run migrations against Postgres without starting the server
LOOKSPAN_DB=postgres://lookspan:secret@db.internal:5432/lookspan npm run migrate
```

The connection string is parsed for logging only and the password is redacted
in startup output. Both drivers implement the **same repository interfaces**
and the **same schema and migrations** (`v1`…`v6`), so every feature —
traces, spans, costs, stats, alerts, scores, replays, datasets and runs —
behaves identically regardless of backend. The SQLite-flavoured SQL the
repositories emit is translated to Postgres at the driver boundary
(`AUTOINCREMENT` → identity columns, `INSERT OR IGNORE` → `ON CONFLICT DO
NOTHING`, `?`/`@name` params bound as Postgres literals, etc.).

### Engine and scope

The Postgres driver runs queries through an **in-process Postgres engine**
([`pg-mem`](https://github.com/oguimbal/pg-mem)). This keeps the repositories'
existing **synchronous** interface intact (no async rewrite of the API and
collector) while giving genuine Postgres-dialect, schema and migration parity —
parity that is verified in CI by running the full repository test-suite against
the Postgres driver, with **no external Postgres server required**
(`packages/storage/src/drivers/postgres.parity.test.ts`).

Two consequences to be aware of:

- **Nothing is written to the server in your connection string.** The URL
  selects the driver and is parsed for logging; the host is never dialled, and
  the data lives in the process and is gone when it exits. The startup line
  says so. Persisting to an external Postgres _server_ over the wire (the async
  `pg` client) is a planned follow-up; the driver boundary
  (`packages/storage/src/drivers/`) is the exact seam that work plugs into —
  the `SqlDriver` interface, SQL translation and migration parity are already
  in place. Until then this path is for validating Postgres-targeted schemas,
  migrations and SQL, not for keeping data.
- **Transactions are snapshot-based.** pg-mem parses `BEGIN`/`COMMIT`/
  `ROLLBACK` and then ignores them, so the driver brackets each outermost
  block with `mem.backup()` and restores that snapshot if the block throws.
  Nested blocks join the outermost one rather than opening a `SAVEPOINT`,
  which pg-mem cannot parse.
- The in-memory engine implements *most* of Postgres but not every construct.
  One known gap: `DatasetsRepository.list()` uses a correlated scalar subquery
  in its projection that real Postgres runs fine but `pg-mem` cannot resolve;
  that specific query is exercised against SQLite in CI. Everything else has
  full cross-driver coverage.

To opt out entirely and stay on SQLite, simply do nothing — SQLite remains the
default.

See the [README](../README.md) for what each feature does and how to send spans
from your agents.
