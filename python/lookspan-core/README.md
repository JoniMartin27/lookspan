# lookspan — local-first observability for AI agents

[![PyPI](https://img.shields.io/pypi/v/lookspan)](https://pypi.org/project/lookspan/)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](https://github.com/JoniMartin27/lookspan/blob/main/LICENSE)
[![Docs](https://img.shields.io/badge/docs-lookspan-orange)](https://jonimartin27.github.io/lookspan/)

Python SDK for [Lookspan](https://fervon.dev/lookspan/) — emit spans from your AI agents to a
dashboard that runs **on your own machine**. No cloud, no account, no API key, no data leaving
your laptop.

If you have ever asked *"why did my agent call that tool twice?"* or *"where did those 40 seconds
go?"*, this is the missing view: every LLM call, tool call, chain step and MCP request as a span
on a timeline you own.

- **Local-first.** The dashboard is a process on `127.0.0.1`. Your prompts stay yours.
- **Framework agnostic.** Works with LangChain, LangGraph, CrewAI, MCP clients or plain code.
- **Content off by default.** Prompts and completions are *not* recorded unless you opt in.
- **Small.** One dependency (`httpx`), typed, MIT.

## Install

```bash
pip install lookspan
```

The dashboard itself ships as a separate CLI:

```bash
npx lookspan-cli
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

`LookspanClient` omits span `input` and `output` by default. Pass `capture_content=True` only when
that content is safe to persist on disk.

## Framework adapters

You rarely need to build spans by hand — install the adapter for your stack instead:

| Package | Traces |
|---|---|
| [`lookspan-langgraph`](https://pypi.org/project/lookspan-langgraph/) | LangChain chains, LangGraph nodes, LLM calls, tools |
| [`lookspan-crewai`](https://pypi.org/project/lookspan-crewai/) | Crew kickoffs, agents, tasks, tools, LLM calls |

## Links

- Product page — <https://fervon.dev/lookspan/>
- Documentation — <https://jonimartin27.github.io/lookspan/>
- Source and issues — <https://github.com/JoniMartin27/lookspan>

MIT licensed. Part of [Fervon](https://fervon.dev).
