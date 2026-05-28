"""CrewAI event-bus listener that emits Lookspan spans."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from lookspan import Framework, LookspanClient, Span, SpanStatus, SpanType, TokenUsage


def _now() -> str:
    return datetime.now(tz=timezone.utc).isoformat().replace("+00:00", "Z")


class LookspanCrewAiListener:
    """Listens to CrewAI's event bus and converts events to Lookspan spans.

    CrewAI's event names have shifted between minor versions. This listener
    binds to the canonical event types if they exist; missing events are
    silently skipped so the adapter remains forward-compatible.
    """

    def __init__(
        self,
        client: LookspanClient,
        *,
        agent_id: str | None = None,
        session_id: str | None = None,
    ) -> None:
        self._client = client
        self._agent_id = agent_id
        self._session_id = session_id
        self._open: dict[str, dict[str, Any]] = {}
        self._trace_id: str | None = None

    def attach(self) -> None:
        from crewai.utilities.events import crewai_event_bus  # type: ignore[import-not-found]

        event_module = _import_events()
        bindings = self._candidate_bindings(event_module)
        for event_cls, handler in bindings:
            if event_cls is None:
                continue
            crewai_event_bus.on(event_cls)(handler)

    def _candidate_bindings(self, mod: Any) -> list[tuple[type | None, Any]]:
        return [
            (getattr(mod, "CrewKickoffStartedEvent", None), self._on_crew_started),
            (getattr(mod, "CrewKickoffCompletedEvent", None), self._on_crew_completed),
            (getattr(mod, "AgentExecutionStartedEvent", None), self._on_agent_started),
            (getattr(mod, "AgentExecutionCompletedEvent", None), self._on_agent_completed),
            (getattr(mod, "TaskStartedEvent", None), self._on_task_started),
            (getattr(mod, "TaskCompletedEvent", None), self._on_task_completed),
            (getattr(mod, "ToolUsageStartedEvent", None), self._on_tool_started),
            (getattr(mod, "ToolUsageFinishedEvent", None), self._on_tool_finished),
            (getattr(mod, "LLMCallStartedEvent", None), self._on_llm_started),
            (getattr(mod, "LLMCallCompletedEvent", None), self._on_llm_completed),
        ]

    # --- crew ---

    def _on_crew_started(self, _source: Any, event: Any) -> None:
        self._trace_id = self._client.new_trace_id()
        span_id = self._client.new_span_id()
        self._open[f"crew:{getattr(event, 'crew_name', 'crew')}"] = {
            "span_id": span_id,
            "started_at": _now(),
            "name": f"crew.{getattr(event, 'crew_name', 'crew')}",
            "type": SpanType.AGENT_STEP,
            "parent": None,
        }

    def _on_crew_completed(self, _source: Any, event: Any) -> None:
        key = f"crew:{getattr(event, 'crew_name', 'crew')}"
        self._close(key, status=SpanStatus.OK, output=_truncate(getattr(event, "output", None)))
        self._trace_id = None

    # --- agent ---

    def _on_agent_started(self, _source: Any, event: Any) -> None:
        agent_role = getattr(getattr(event, "agent", None), "role", "agent")
        key = f"agent:{id(event)}"
        self._open[key] = {
            "span_id": self._client.new_span_id(),
            "started_at": _now(),
            "name": f"agent.{agent_role}",
            "type": SpanType.AGENT_STEP,
            "parent": self._latest_open("crew:"),
        }

    def _on_agent_completed(self, _source: Any, event: Any) -> None:
        key = self._find_open(prefix="agent:")
        if key:
            self._close(key, status=SpanStatus.OK, output=_truncate(getattr(event, "output", None)))

    # --- task ---

    def _on_task_started(self, _source: Any, event: Any) -> None:
        task_desc = getattr(getattr(event, "task", None), "description", "task")
        key = f"task:{id(event)}"
        self._open[key] = {
            "span_id": self._client.new_span_id(),
            "started_at": _now(),
            "name": f"task: {task_desc[:80]}",
            "type": SpanType.AGENT_STEP,
            "parent": self._latest_open("agent:") or self._latest_open("crew:"),
        }

    def _on_task_completed(self, _source: Any, event: Any) -> None:
        key = self._find_open(prefix="task:")
        if key:
            self._close(key, status=SpanStatus.OK, output=_truncate(getattr(event, "output", None)))

    # --- tool ---

    def _on_tool_started(self, _source: Any, event: Any) -> None:
        tool_name = getattr(event, "tool_name", "tool")
        key = f"tool:{id(event)}"
        self._open[key] = {
            "span_id": self._client.new_span_id(),
            "started_at": _now(),
            "name": f"tool.{tool_name}",
            "type": SpanType.TOOL_CALL,
            "parent": self._latest_open("task:") or self._latest_open("agent:"),
        }

    def _on_tool_finished(self, _source: Any, event: Any) -> None:
        key = self._find_open(prefix="tool:")
        if key:
            self._close(key, status=SpanStatus.OK, output=_truncate(getattr(event, "output", None)))

    # --- llm ---

    def _on_llm_started(self, _source: Any, event: Any) -> None:
        key = f"llm:{id(event)}"
        self._open[key] = {
            "span_id": self._client.new_span_id(),
            "started_at": _now(),
            "name": "llm",
            "type": SpanType.LLM_CALL,
            "parent": self._latest_open("agent:") or self._latest_open("task:"),
            "model": getattr(event, "model", None),
        }

    def _on_llm_completed(self, _source: Any, event: Any) -> None:
        key = self._find_open(prefix="llm:")
        if not key:
            return
        usage_obj = getattr(event, "usage", None)
        usage = (
            TokenUsage(
                input_tokens=getattr(usage_obj, "prompt_tokens", 0) or 0,
                output_tokens=getattr(usage_obj, "completion_tokens", 0) or 0,
            )
            if usage_obj
            else None
        )
        self._close(
            key,
            status=SpanStatus.OK,
            output=_truncate(getattr(event, "response", None)),
            usage=usage,
        )

    # --- helpers ---

    def _latest_open(self, prefix: str) -> str | None:
        for key in reversed(list(self._open)):
            if key.startswith(prefix):
                return self._open[key]["span_id"]
        return None

    def _find_open(self, *, prefix: str) -> str | None:
        for key in reversed(list(self._open)):
            if key.startswith(prefix):
                return key
        return None

    def _close(
        self,
        key: str,
        *,
        status: SpanStatus,
        output: str | None = None,
        usage: TokenUsage | None = None,
    ) -> None:
        meta = self._open.pop(key, None)
        if meta is None or self._trace_id is None:
            return
        span = Span(
            trace_id=self._trace_id,
            span_id=meta["span_id"],
            parent_span_id=meta.get("parent"),
            type=meta["type"],
            name=meta["name"],
            started_at=meta["started_at"],
            ended_at=_now(),
            status=status,
            framework=Framework.CREWAI,
            agent_id=self._agent_id,
            session_id=self._session_id,
            model=meta.get("model"),
            output=output,
            usage=usage,
        )
        self._client.emit(span)


def _import_events() -> Any:
    from crewai.utilities import events as event_module  # type: ignore[import-not-found]

    return event_module


def _truncate(value: Any, limit: int = 8000) -> str | None:
    if value is None:
        return None
    text = value if isinstance(value, str) else str(value)
    return text[:limit]


def attach_lookspan(
    client: LookspanClient,
    *,
    agent_id: str | None = None,
    session_id: str | None = None,
) -> LookspanCrewAiListener:
    """Convenience: instantiate and attach a listener in one call."""
    listener = LookspanCrewAiListener(client, agent_id=agent_id, session_id=session_id)
    listener.attach()
    return listener


__all__ = ["LookspanCrewAiListener", "attach_lookspan"]
