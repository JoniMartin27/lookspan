# lookspan-crewai — CrewAI observability, local-first

[![PyPI](https://img.shields.io/pypi/v/lookspan-crewai)](https://pypi.org/project/lookspan-crewai/)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](https://github.com/JoniMartin27/lookspan/blob/main/LICENSE)
[![Docs](https://img.shields.io/badge/docs-lookspan-orange)](https://fervon.dev/lookspan/)

Auto-instruments CrewAI runs and streams every agent step, task, tool call, and
LLM invocation to your local [Lookspan](https://fervon.dev/lookspan/) dashboard —
a process on `127.0.0.1`, not a SaaS. No account, no API key, nothing uploaded.

A crew that "just hangs" or burns tokens somewhere is hard to read from logs. Here
you get the kickoff as a trace, each agent and task as a span, and the tool and LLM
calls nested underneath with their real durations.


## Install

```bash
pip install lookspan-crewai
```

## Quick start

```python
from crewai import Crew
from lookspan import LookspanClient
from lookspan_crewai import attach_lookspan

client = LookspanClient(endpoint="http://127.0.0.1:3100/api/ingest")
attach_lookspan(client, agent_id="research-crew")

crew = Crew(agents=[...], tasks=[...])
result = crew.kickoff()

client.flush()
```

`attach_lookspan` registers listeners on CrewAI's global event bus.

Prompts and completions are **not** recorded unless you pass `capture_content=True`
to `LookspanClient`.

## Links

- Product page — <https://fervon.dev/lookspan/>
- Documentation — <https://fervon.dev/lookspan/>
- Core SDK — [`lookspan`](https://pypi.org/project/lookspan/) · LangChain/LangGraph — [`lookspan-langgraph`](https://pypi.org/project/lookspan-langgraph/)
- Source and issues — <https://github.com/JoniMartin27/lookspan>

MIT licensed. Part of [Fervon](https://fervon.dev).
