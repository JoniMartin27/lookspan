---
title: Pricing & cost tracking
description: How Lookspan computes cost per span and trace, and how to override the pricing table.
---

Lookspan tracks token usage and computes **dollar cost** for every span and
trace — server-side, so your agent never has to do the math.

## How cost is computed

The collector aggregates input/output/cached/reasoning tokens per span and
computes `cost_usd` from a **built-in model pricing table**, keyed by model
name. Costs roll up from spans to the trace and feed the **Costs & overview**
view (total, by model, by provider, by agent, and cost per day).

Because the math is server-side, sending `costUsd: 0` from your agent is fine —
Lookspan fills it in. The OTel and SDK paths both rely on this: token counts +
model name in, dollar cost out.

## Inspect cost

```bash
# Cost breakdown — total, by model, provider, agent
curl localhost:3100/api/costs/summary

# Stats summary — totals, error rate, latency p50/p95/p99, cost per day
curl localhost:3100/api/stats
```

In the dashboard, recent traces show per-row cost mini-bars, and the overview
page charts cost per day alongside latency and error rate.

## Keep prices current

Model prices change. Override the built-in table with your own JSON file:

```bash
npx lookspan --pricing ./pricing.json
# ...or LOOKSPAN_PRICING=./pricing.json npx lookspan
```

The custom table is merged over the built-in one, so you only need to specify
the models you want to correct or add.

Each entry needs `model`, `inputPer1M`, and `outputPer1M`; `cachedInputPer1M`
and `reasoningPer1M` are optional. Cached input and reasoning tokens are treated
as subsets of input and output respectively, so they are billed at their own
rate without being double-charged. When `reasoningPer1M` is omitted, reasoning
tokens are billed at the output rate.

## Cost-based alerts

Pair cost tracking with an [alert](/lookspan/guides/alerts/) to get notified
when a single trace gets expensive:

```bash
npx lookspan --alert-cost 1.00   # toast + notification when a trace tops $1
```
