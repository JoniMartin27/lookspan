# lookspan-crewai

Auto-instruments CrewAI runs and streams every agent step, task, tool call, and
LLM invocation to your local Lookspan dashboard.

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
