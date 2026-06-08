---
title: OpenTelemetry (OTLP)
description: Point any OpenTelemetry exporter at Lookspan's native OTLP/HTTP receiver — no SDK.
---

Lookspan exposes a native **OTLP/HTTP** receiver at `POST /v1/traces`. If your
stack already emits OpenTelemetry traces, point the exporter at Lookspan and you
get spans with **no Lookspan SDK at all**.

## Configure your exporter

Set the standard OTel environment variable to Lookspan's receiver:

```bash
export OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://127.0.0.1:3100/v1/traces
# protobuf (the OTel default) and JSON are both accepted
```

Any OTel SDK or the OpenTelemetry Collector can ship to this endpoint.

## Semantic conventions

Lookspan maps the OpenTelemetry GenAI semantic conventions onto its span model,
so model/provider/token fields populate automatically:

| OTel attribute | Maps to |
|---|---|
| `gen_ai.system` | provider |
| `gen_ai.request.model` | model |
| `gen_ai.response.model` | model (response) |
| `gen_ai.usage.input_tokens` | input tokens |
| `gen_ai.usage.output_tokens` | output tokens |

From the token counts and the model name, Lookspan computes `cost_usd`
server-side using its [pricing table](/lookspan/guides/pricing-and-cost/) — the
same way it does for the native SDKs.

## When to use this

- You already instrument with OpenTelemetry and don't want a second SDK.
- You run an OpenTelemetry Collector and want Lookspan as one more exporter
  target.
- You're on a language Lookspan doesn't ship a native adapter for, but it has an
  OTel SDK.

If you control the agent code and want richer prompt/response capture (for
[Replay](/lookspan/guides/replay-and-diff/) and
[judging](/lookspan/guides/llm-as-judge/)), prefer the native
[drop-in SDKs](/lookspan/sdks/) instead.
