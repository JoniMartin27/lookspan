#!/usr/bin/env bash
# Ingest a span from any language — just an HTTP POST. Works with the server
# running at http://127.0.0.1:3100 (npx lookspan).
set -euo pipefail
ENDPOINT="${LOOKSPAN_ENDPOINT:-http://127.0.0.1:3100/api/ingest}"

curl -s -X POST "$ENDPOINT" \
  -H "Content-Type: application/json" \
  -d '{
    "source": "curl-example",
    "spans": [
      {
        "traceId": "tr_demo_1",
        "spanId": "sp_root",
        "parentSpanId": null,
        "type": "agent_step",
        "name": "demo-agent.run",
        "startedAt": "2026-06-02T10:00:00.000Z",
        "endedAt": "2026-06-02T10:00:02.000Z",
        "status": "ok",
        "framework": "custom"
      },
      {
        "traceId": "tr_demo_1",
        "spanId": "sp_llm",
        "parentSpanId": "sp_root",
        "type": "llm_call",
        "name": "demo-agent.completion",
        "startedAt": "2026-06-02T10:00:00.200Z",
        "endedAt": "2026-06-02T10:00:01.800Z",
        "status": "ok",
        "framework": "custom",
        "model": "claude-sonnet-4-6",
        "provider": "anthropic",
        "usage": { "inputTokens": 1200, "outputTokens": 350, "costUsd": 0 }
      }
    ]
  }'
echo
echo "→ open http://127.0.0.1:3100 to see trace tr_demo_1 (cost is computed server-side)"
