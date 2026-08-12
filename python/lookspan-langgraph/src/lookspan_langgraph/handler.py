"""LangChain/LangGraph BaseCallbackHandler that emits Lookspan spans."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from langchain_core.callbacks.base import BaseCallbackHandler
from langchain_core.outputs import LLMResult
from lookspan import Framework, LookspanClient, Span, SpanStatus, SpanType, TokenUsage


def _now() -> str:
    return datetime.now(tz=timezone.utc).isoformat().replace("+00:00", "Z")


def provider_for_model(model: str | None) -> str | None:
    """Best-effort provider from a model id.

    LangChain reports the model (`llm_output["model_name"]`) but not the vendor,
    and Lookspan groups cost and calls by provider — so guess it from the model
    name, the same way the dashboard's replay does, and leave it unset rather
    than guessing wrong.
    """
    if not model:
        return None
    name = model.lower()
    if name.startswith("claude"):
        return "anthropic"
    if name.startswith(("gpt-", "o1", "o3", "o4", "chatgpt", "text-embedding")):
        return "openai"
    if name.startswith("gemini"):
        return "google"
    if name.startswith(("mistral", "mixtral", "ministral")):
        return "mistral"
    if name.startswith(("llama", "meta-llama")):
        return "meta"
    if name.startswith("deepseek"):
        return "deepseek"
    return None


class _SpanState:
    __slots__ = ("started_at", "input")

    def __init__(self, started_at: str, input_data: dict[str, Any] | None = None) -> None:
        self.started_at = started_at
        self.input = input_data


class LookspanCallbackHandler(BaseCallbackHandler):
    """Streams LangChain/LangGraph events to Lookspan as spans.

    Wires up `on_chain_*`, `on_llm_*`, and `on_tool_*` lifecycle hooks. Each LangChain
    `run_id` becomes a span; `parent_run_id` becomes its `parent_span_id`. Trace ID
    is inferred per top-level chain invocation.
    """

    def __init__(
        self,
        client: LookspanClient,
        *,
        agent_id: str | None = None,
        session_id: str | None = None,
        framework: Framework | str = Framework.LANGGRAPH,
    ) -> None:
        super().__init__()
        self._client = client
        self._agent_id = agent_id
        self._session_id = session_id
        self._framework = framework
        self._states: dict[UUID, _SpanState] = {}
        self._trace_ids: dict[UUID, str] = {}

    def _trace_id_for(self, run_id: UUID, parent_run_id: UUID | None) -> str:
        if parent_run_id and parent_run_id in self._trace_ids:
            self._trace_ids[run_id] = self._trace_ids[parent_run_id]
        else:
            self._trace_ids[run_id] = self._client.new_trace_id()
        return self._trace_ids[run_id]

    def _start_span(self, run_id: UUID, input_data: dict[str, Any] | None = None) -> None:
        self._states[run_id] = _SpanState(started_at=_now(), input_data=input_data)

    def _end_span(
        self,
        run_id: UUID,
        parent_run_id: UUID | None,
        type_: SpanType,
        name: str,
        *,
        status: SpanStatus,
        output: str | None = None,
        error: dict[str, Any] | None = None,
        model: str | None = None,
        provider: str | None = None,
        usage: TokenUsage | None = None,
    ) -> None:
        state = self._states.pop(run_id, None)
        if state is None:
            return
        trace_id = self._trace_ids.get(run_id) or self._trace_id_for(run_id, parent_run_id)
        parent_span_id = (
            str(parent_run_id) if parent_run_id and parent_run_id in self._trace_ids else None
        )
        span = Span(
            trace_id=trace_id,
            span_id=str(run_id),
            parent_span_id=parent_span_id,
            type=type_,
            name=name,
            started_at=state.started_at,
            ended_at=_now(),
            status=status,
            framework=self._framework,
            agent_id=self._agent_id,
            session_id=self._session_id,
            model=model,
            provider=provider,
            input=state.input,
            output=output,
            error=error,
            usage=usage,
        )
        self._client.emit(span)

    # --- chain ---

    def on_chain_start(
        self,
        serialized: dict[str, Any] | None,
        inputs: dict[str, Any],
        *,
        run_id: UUID,
        parent_run_id: UUID | None = None,
        **_: Any,
    ) -> None:
        self._trace_id_for(run_id, parent_run_id)
        self._start_span(run_id, inputs)

    def on_chain_end(
        self,
        outputs: dict[str, Any],
        *,
        run_id: UUID,
        parent_run_id: UUID | None = None,
        **kwargs: Any,
    ) -> None:
        name = kwargs.get("name") or "chain"
        self._end_span(
            run_id,
            parent_run_id,
            SpanType.AGENT_STEP,
            name,
            status=SpanStatus.OK,
            output=str(outputs)[:8000] if outputs else None,
        )

    def on_chain_error(
        self,
        error: BaseException,
        *,
        run_id: UUID,
        parent_run_id: UUID | None = None,
        **kwargs: Any,
    ) -> None:
        name = kwargs.get("name") or "chain"
        self._end_span(
            run_id,
            parent_run_id,
            SpanType.AGENT_STEP,
            name,
            status=SpanStatus.ERROR,
            error={"message": str(error), "type": type(error).__name__},
        )

    # --- llm ---

    def on_llm_start(
        self,
        serialized: dict[str, Any] | None,
        prompts: list[str],
        *,
        run_id: UUID,
        parent_run_id: UUID | None = None,
        **_: Any,
    ) -> None:
        self._trace_id_for(run_id, parent_run_id)
        self._start_span(run_id, {"prompts": prompts})

    def on_llm_end(
        self,
        response: LLMResult,
        *,
        run_id: UUID,
        parent_run_id: UUID | None = None,
        **_: Any,
    ) -> None:
        usage_info = (response.llm_output or {}).get("token_usage", {}) if response.llm_output else {}
        usage = TokenUsage(
            input_tokens=int(usage_info.get("prompt_tokens", 0) or 0),
            output_tokens=int(usage_info.get("completion_tokens", 0) or 0),
        )
        model = (response.llm_output or {}).get("model_name") if response.llm_output else None
        text = response.generations[0][0].text if response.generations and response.generations[0] else None
        self._end_span(
            run_id,
            parent_run_id,
            SpanType.LLM_CALL,
            "llm",
            status=SpanStatus.OK,
            output=text,
            model=model,
            provider=provider_for_model(model),
            usage=usage,
        )

    def on_llm_error(
        self,
        error: BaseException,
        *,
        run_id: UUID,
        parent_run_id: UUID | None = None,
        **_: Any,
    ) -> None:
        self._end_span(
            run_id,
            parent_run_id,
            SpanType.LLM_CALL,
            "llm",
            status=SpanStatus.ERROR,
            error={"message": str(error), "type": type(error).__name__},
        )

    # --- tool ---

    def on_tool_start(
        self,
        serialized: dict[str, Any] | None,
        input_str: str,
        *,
        run_id: UUID,
        parent_run_id: UUID | None = None,
        **_: Any,
    ) -> None:
        self._trace_id_for(run_id, parent_run_id)
        self._start_span(run_id, {"input": input_str})

    def on_tool_end(
        self,
        output: str,
        *,
        run_id: UUID,
        parent_run_id: UUID | None = None,
        **kwargs: Any,
    ) -> None:
        name = kwargs.get("name") or "tool"
        self._end_span(
            run_id,
            parent_run_id,
            SpanType.TOOL_CALL,
            f"tool.{name}",
            status=SpanStatus.OK,
            output=output[:8000] if output else None,
        )

    def on_tool_error(
        self,
        error: BaseException,
        *,
        run_id: UUID,
        parent_run_id: UUID | None = None,
        **kwargs: Any,
    ) -> None:
        name = kwargs.get("name") or "tool"
        self._end_span(
            run_id,
            parent_run_id,
            SpanType.TOOL_CALL,
            f"tool.{name}",
            status=SpanStatus.ERROR,
            error={"message": str(error), "type": type(error).__name__},
        )


__all__ = ["LookspanCallbackHandler"]
