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
| `--host <host>` | `LOOKSPAN_HOST` | `127.0.0.1` | Address to bind. Use `0.0.0.0` to expose on your LAN (see Security). While bound to loopback, requests whose `Host` header names anything else are refused with 421 — that is the defence against DNS rebinding, which CORS cannot see. Binding elsewhere lifts the check, since the server is then reachable by whatever name you gave it. |
| `--db <path\|url>` | `LOOKSPAN_DB` | `~/.lookspan/lookspan.db` | SQLite database file (created if missing) **or** a Postgres connection string (`postgres://…` / `postgresql://…`). See [Postgres](#postgres). |
| `--retention <dur>` | `LOOKSPAN_RETENTION` | _(none)_ | Prune traces older than `<dur>` (`7d`, `24h`, `30m`). Runs on startup, then at most hourly. Unset = keep everything. |
| `--token <token>` | `LOOKSPAN_TOKEN` | _(none)_ | Require `Authorization: Bearer <token>` on `/api/*` and `/v1/*` (`/api/health` is exempt). Unset = no auth on loopback only. |
| `--cors-origin <o>` | `LOOKSPAN_CORS_ORIGIN` | _(none)_ | Browser origins allowed to call the API, comma-separated. Empty means no cross-origin access: the dashboard is served from this same origin and agents post from outside a browser, so nothing normally needs it. Only set it if a browser app on another origin must reach the API — and remember a granted origin can read everything Lookspan has stored. |
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
and the **same schema and migrations** (`v1`…`v7`), covering the supported
repository operations —
traces, spans, costs, stats, alerts, scores, replays, datasets and runs —
uses the same repository contract regardless of backend. The SQLite-flavoured SQL the
repositories emit is translated to Postgres at the driver boundary
(`AUTOINCREMENT` → identity columns, `INSERT OR IGNORE` → `ON CONFLICT DO
NOTHING`, `?`/`@name` params bound as Postgres literals, etc.).

### Engine and scope

The normal `postgres://` path connects to the **real external PostgreSQL
server** using `pg`. The connection is kept in a dedicated worker thread so the
existing synchronous repository interface remains unchanged while network I/O
and the PostgreSQL event loop stay off the API thread. Transactions use the
same connection, so `BEGIN`/`COMMIT`/`ROLLBACK` are real server transactions.

The password is redacted in startup output. Schema migrations run against the
configured server, and data survives Lookspan restarts according to the
server's own durability and backup policy.

The in-memory [`pg-mem`](https://github.com/oguimbal/pg-mem) driver remains
available only through the internal `postgresMode: 'memory'` option for fast
dialect/parity tests. It never receives production CLI traffic. Those tests
continue to cover the translated SQL without requiring a database service;
set `LOOKSPAN_TEST_POSTGRES_URL` to run the real persistence test against a
PostgreSQL instance as well.

To opt out entirely and stay on SQLite, simply do nothing — SQLite remains the
default.

See the [README](../README.md) for what each feature does and how to send spans
from your agents.
