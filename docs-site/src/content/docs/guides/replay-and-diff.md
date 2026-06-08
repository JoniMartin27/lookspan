---
title: Replay & diff
description: Re-run a captured prompt against the same or a different model and diff cost, latency and output.
---

The drop-in SDKs capture each call's prompt and reply (`captureContent`, on by
default; secrets are scrubbed server-side). With that captured content, Lookspan
can close the loop from *observe* to *improve*: **replay** a trace's prompt and
**diff** the result against the original.

## Provide a key

Replay calls a real provider, so it needs an API key. Keys live **in memory
only** — never written to the database or logged:

```bash
LOOKSPAN_OPENAI_API_KEY=sk-... npx lookspan
#   ...or LOOKSPAN_ANTHROPIC_API_KEY / --openai-key / --anthropic-key
```

## Replay a trace

From the dashboard, open a trace and use the **Replay & judge** panel. Or call
the API directly:

```bash
# Replay the captured prompt against another model and diff cost/latency/output
curl -X POST localhost:3100/api/traces/<id>/replay \
  -H 'content-type: application/json' \
  -d '{"model":"gpt-4o-mini"}'   # omit "model" to re-run the original
```

The replay request body accepts `{ model?, provider?, spanId? }`:

- **omit `model`** to re-run against the original model (catch nondeterminism /
  drift),
- **set `model`** (and optionally `provider`) to try a cheaper or stronger model,
- **set `spanId`** to replay a specific span within the trace.

Lookspan runs the prompt, records a new replay, and shows the **diff** — cost,
latency and output side-by-side against the original run. List past replays with:

```bash
curl localhost:3100/api/traces/<id>/replays
```

## Keeping content out

Replay only works for spans whose content was captured. To keep prompts/outputs
out of Lookspan entirely, pass `{ captureContent: false }` to `observeOpenAI` /
`observeAnthropic` — Replay & judge then stay disabled for those spans.

## Next

- [Score replays with an LLM judge](/lookspan/guides/llm-as-judge/).
- [Scale replay to a whole dataset](/lookspan/guides/datasets-and-experiments/).
