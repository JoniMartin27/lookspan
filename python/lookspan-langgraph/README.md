# lookspan-langgraph — LangChain & LangGraph observability, local-first

[![PyPI](https://img.shields.io/pypi/v/lookspan-langgraph)](https://pypi.org/project/lookspan-langgraph/)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](https://github.com/JoniMartin27/lookspan/blob/main/LICENSE)
[![Docs](https://img.shields.io/badge/docs-lookspan-orange)](https://jonimartin27.github.io/lookspan/)

Drop-in callback handler that streams every chain, graph node, LLM call and tool
invocation to your local [Lookspan](https://fervon.dev/lookspan/) dashboard — a
process on `127.0.0.1`, not a SaaS. No account, no API key, nothing uploaded.

One handler in `config={"callbacks": [...]}` and the graph you drew becomes a
timeline you can actually read: which node ran, in what order, how long each LLM
call took, and where the retries went.


## Install

```bash
pip install lookspan-langgraph
```

## Quick start

```python
from lookspan import LookspanClient
from lookspan_langgraph import LookspanCallbackHandler

client = LookspanClient(endpoint="http://127.0.0.1:3100/api/ingest")
handler = LookspanCallbackHandler(client=client, agent_id="my-agent")

# LangChain
result = chain.invoke({"input": "hello"}, config={"callbacks": [handler]})

# LangGraph
result = graph.invoke({"messages": []}, config={"callbacks": [handler]})

client.flush()
```

Prompts and completions are **not** recorded unless you pass `capture_content=True`
to `LookspanClient`.

## Links

- Product page — <https://fervon.dev/lookspan/>
- Documentation — <https://jonimartin27.github.io/lookspan/>
- Core SDK — [`lookspan`](https://pypi.org/project/lookspan/) · CrewAI — [`lookspan-crewai`](https://pypi.org/project/lookspan-crewai/)
- Source and issues — <https://github.com/JoniMartin27/lookspan>

MIT licensed. Part of [Fervon](https://fervon.dev).
