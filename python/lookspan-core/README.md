# lookspan

Python SDK for [Lookspan](https://github.com/lookspan/lookspan) — emit spans from your AI
agents to the local-first observability dashboard.

## Install

```bash
pip install lookspan
```

## Quick start

```python
from lookspan import LookspanClient, Span, SpanType, SpanStatus

client = LookspanClient(endpoint="http://127.0.0.1:3100/api/ingest")

trace_id = client.new_trace_id()
span_id = client.new_span_id()

client.send([
    Span(
        trace_id=trace_id,
        span_id=span_id,
        parent_span_id=None,
        type=SpanType.LLM_CALL,
        name="my-agent.completion",
        started_at="2026-05-08T12:00:00Z",
        ended_at="2026-05-08T12:00:01Z",
        status=SpanStatus.OK,
        framework="custom",
        model="claude-opus-4-7",
        provider="anthropic",
    )
])

client.flush()
```

For framework-specific adapters, see `lookspan-langgraph` and `lookspan-crewai`.
