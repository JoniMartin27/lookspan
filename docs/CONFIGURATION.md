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
| `--db <path>` | `LOOKSPAN_DB` | `~/.lookspan/lookspan.db` | SQLite database file. Created if missing. |
| `--retention <dur>` | `LOOKSPAN_RETENTION` | _(none)_ | Prune traces older than `<dur>` (`7d`, `24h`, `30m`). Runs on startup, then at most hourly. Unset = keep everything. |
| `--token <token>` | `LOOKSPAN_TOKEN` | _(none)_ | Require `Authorization: Bearer <token>` on `/api/*` and `/v1/*` (`/api/health` is exempt). Unset = no auth. |
| `--pricing <file>` | `LOOKSPAN_PRICING` | _(built-in table)_ | Load a custom model pricing table (JSON) to keep cost math current. |
| `--open` | — | `false` | Open the dashboard in your browser on startup. |
| — | `LOOKSPAN_DASHBOARD_DIR` | _(auto-detected)_ | Override the path to the built dashboard assets. Normally found automatically. |

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

See the [README](../README.md) for what each feature does and how to send spans
from your agents.
