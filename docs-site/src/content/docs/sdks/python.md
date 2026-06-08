---
title: Python (LangGraph / CrewAI)
description: Instrument Python agents with the lookspan client and LangGraph/CrewAI adapters.
---

The Python side ships as three PyPI packages: a generic client plus two
framework adapters.

| Package | Install | Purpose |
|---|---|---|
| `lookspan` | `pip install lookspan` | Generic client / exporter (`LookspanClient`) |
| `lookspan-langgraph` | `pip install lookspan-langgraph` | LangGraph / LangChain callback handler |
| `lookspan-crewai` | `pip install lookspan-crewai` | CrewAI event listener |

## LangGraph / LangChain

Attach the callback handler to any LangChain/LangGraph run:

```python
from lookspan import LookspanClient
from lookspan_langgraph import LookspanCallbackHandler

client = LookspanClient(endpoint="http://127.0.0.1:3100/api/ingest")
handler = LookspanCallbackHandler(client=client, agent_id="my-agent")

result = graph.invoke({"messages": []}, config={"callbacks": [handler]})
client.flush()
```

The handler accepts `agent_id` and `session_id` for attribution and
[session grouping](/lookspan/guides/sessions-and-causality/).

## CrewAI

For CrewAI, attach an event listener — one call wires it up:

```python
from lookspan import LookspanClient
from lookspan_crewai import attach_lookspan

client = LookspanClient(endpoint="http://127.0.0.1:3100/api/ingest")
attach_lookspan(client, agent_id="crew", session_id="run-1")

# ... run your crew as usual; spans are emitted automatically ...
client.flush()
```

## The generic client

`LookspanClient` is a thin convenience wrapper around an HTTP exporter:

```python
from lookspan import LookspanClient

client = LookspanClient(endpoint="http://127.0.0.1:3100/api/ingest")
# build and emit spans directly, then drain the buffer before exit
client.flush()
```

Its constructor takes `endpoint` (default `http://127.0.0.1:3100/api/ingest`),
an optional custom `exporter`, and a `source` label. Always call `client.flush()`
before your process exits so buffered spans are sent.

> More runnable examples live in the
> [`examples/`](https://github.com/JoniMartin27/lookspan/tree/main/examples)
> directory of the repository.
