# lookspan-langgraph

Drop-in callback handler that streams every chain, LLM call, and tool invocation
to your local Lookspan dashboard.

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
