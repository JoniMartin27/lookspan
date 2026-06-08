---
title: Sessions & agent causality
description: Group traces from related agents into a session and follow the handoffs between them.
---

A single logical task often spans **several agents** — a planner spawns a
researcher, which calls tools, which hands off to a writer. Lookspan groups
those traces into a **session** and lets you follow the causality between
agents.

## Tag your spans

Two fields drive the session view, both available on every SDK
([shared options](/lookspan/sdks/#shared-options)):

- **`sessionId`** — the same value across every agent working on one task groups
  their traces into a session.
- **`agentId`** — labels which agent produced each trace, so the timeline reads
  as "planner → researcher → writer".

```typescript
const openai = observeOpenAI(new OpenAI(), {
  agentId: 'researcher',
  sessionId: 'task-42',
});
```

```python
handler = LookspanCallbackHandler(client=client, agent_id="planner", session_id="task-42")
```

## Cross-agent handoffs

When one agent spawns another, pass the spawning trace's id as
**`parentTraceId`** on the child client so Lookspan links the two — the child's
traces are attributed to the handoff, not orphaned. For MCP clients, the
equivalent is reusing `traceId` / `rootSpanId` on `wrapMcpClient`.

## Inspect sessions

```bash
# List sessions (agents, traces, cost, errors, time range)
curl localhost:3100/api/sessions

# A session's summary + its traces (the multi-agent timeline)
curl localhost:3100/api/sessions/<id>
```

In the dashboard, the **Sessions** view shows each session's participating
agents, total cost, error count and time range, and drills into a multi-agent
timeline so you can see which agent did what, when, and what it cost.
