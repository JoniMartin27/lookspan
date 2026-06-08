---
title: Alerts
description: Get notified when a trace fails or exceeds a cost, token or duration threshold.
---

Alerts flag a trace in the dashboard when it crosses a threshold you set — a
failure, a pricey run, a token blow-up, or a slow trace. When an alert fires you
get a **toast + desktop notification + CLI line**, and it's persisted to an
alert history.

## Enable thresholds

Each threshold is a CLI flag (or the matching `LOOKSPAN_ALERT_*` env var):

```bash
npx lookspan \
  --alert-error \           # alert when a trace ends in error
  --alert-cost 1.00 \       # alert when a trace costs more than $1.00
  --alert-tokens 100000 \   # alert when a trace exceeds 100k tokens
  --alert-duration 30000    # alert when a trace takes longer than 30s (ms)
```

| Flag | Env var | Fires when… |
|---|---|---|
| `--alert-error` | `LOOKSPAN_ALERT_ERROR` | a trace ends in `error`. |
| `--alert-cost <usd>` | `LOOKSPAN_ALERT_COST` | a trace costs more than `<usd>`. |
| `--alert-tokens <n>` | `LOOKSPAN_ALERT_TOKENS` | a trace exceeds `<n>` total tokens. |
| `--alert-duration <ms>` | `LOOKSPAN_ALERT_DURATION` | a trace takes longer than `<ms>`. |

All thresholds are off until set.

## Where alerts surface

- **Dashboard** — a toast appears in real time (delivered over the
  [SSE stream](/lookspan/reference/http-api/) as an `alert.triggered` event), and
  the trace is flagged.
- **Desktop notification** — a native OS notification.
- **CLI** — a line in the terminal running `npx lookspan`.
- **History** — every triggered alert is stored; fetch it with
  `GET /api/alerts`.

```bash
curl localhost:3100/api/alerts   # history of triggered alerts
```

## Example

Keep 14 days of history, require a token, and alert on failures and pricey runs:

```bash
LOOKSPAN_RETENTION=14d LOOKSPAN_TOKEN=secret \
  npx lookspan --alert-error --alert-cost 1.00
```
