---
title: LLM-as-judge
description: Score a trace's response 0–1 with a judge model, or attach scores by hand.
---

Lookspan can have a model **judge** a captured response — scoring it `0–1`
against a metric — and store the result as a score on the trace. Combined with
[Replay](/lookspan/guides/replay-and-diff/), this turns observation into a
measurable feedback loop.

## Provide a key

Judging calls a provider, so it needs an in-memory API key (same as Replay):

```bash
LOOKSPAN_OPENAI_API_KEY=sk-... npx lookspan
#   ...or LOOKSPAN_ANTHROPIC_API_KEY / --openai-key / --anthropic-key
```

## Judge a trace

In the dashboard, use the **Replay & judge** panel on a trace. Or via the API:

```bash
# Score the response 0–1 with an LLM judge (stored as an "llm-judge" score)
curl -X POST localhost:3100/api/traces/<id>/judge \
  -H 'content-type: application/json' \
  -d '{"metric":"correctness"}'
```

The judge request body accepts `{ metric?, model?, provider?, rubric? }`:

- **`metric`** — what you're scoring (e.g. `correctness`, `helpfulness`).
- **`model` / `provider`** — which model acts as judge (defaults apply).
- **`rubric`** — an optional custom rubric to steer the judge.

The score is persisted on the trace with source `llm-judge` and shows up in the
dashboard alongside any other scores.

## Attach scores by hand or from an assertion

You don't need a model to record a score. Any evaluation — an assertion in your
test suite, a human rating — can be attached directly:

```bash
curl -X POST localhost:3100/api/traces/<id>/scores \
  -H 'content-type: application/json' \
  -d '{"name":"correctness","value":1,"comment":"matched expected","source":"assertion"}'
```

The body is `{ name, value, comment?, source? }`.

## Scale it up

To judge many prompts at once, build a
[dataset and run it with `judge: true`](/lookspan/guides/datasets-and-experiments/) —
each item is replayed and scored, with aggregate score per run.
