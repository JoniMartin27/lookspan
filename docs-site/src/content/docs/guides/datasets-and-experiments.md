---
title: Datasets & experiments
description: Collect prompts into a test set, run it against a model in batch, and score each output.
---

Datasets scale evaluation from one trace to a whole test set. Build a
**dataset** (seed items from real traces or add them by hand), then **run** it
against a model — each item is replayed and, optionally, scored by the
[judge](/lookspan/guides/llm-as-judge/), with aggregate cost/latency/score per
run.

Manage everything under **Datasets** in the dashboard, or use the API.

## Build a dataset

```bash
# Create a dataset
DS=$(curl -s -X POST localhost:3100/api/datasets \
  -d '{"name":"regressions"}' -H 'content-type: application/json' | jq -r .dataset.id)

# Seed an item from a real trace's captured prompt
curl -X POST localhost:3100/api/datasets/$DS/items/from-trace \
  -H 'content-type: application/json' -d '{"traceId":"<id>"}'

# ...or add items by hand
curl -X POST localhost:3100/api/datasets/$DS/items \
  -H 'content-type: application/json' \
  -d '{"input":{"messages":[{"role":"user","content":"2+2?"}]},"expected":"4"}'
```

Items are `{ input, expected? }`; add many at once with `{ items: [...] }`.

## Run the set

```bash
# Run the whole set against a model, judging each output
curl -X POST localhost:3100/api/datasets/$DS/run \
  -H 'content-type: application/json' \
  -d '{"model":"gpt-4o-mini","judge":true,"metric":"correctness"}'
```

The run body is `{ model, judge?, metric? }`. A run requires a provider key in
memory (see [Replay](/lookspan/guides/replay-and-diff/)). Each item is replayed
against the model and, if `judge` is true, scored by the LLM judge.

## Inspect results

```bash
# List datasets, or a dataset's items + runs
curl localhost:3100/api/datasets
curl localhost:3100/api/datasets/$DS

# A single run's summary + per-item results
curl localhost:3100/api/runs/<runId>
```

Each run aggregates **cost, latency and score** across items, so you can compare
two models — or the same model over time — on the same test set. The dashboard
renders runs as A/B comparisons.
