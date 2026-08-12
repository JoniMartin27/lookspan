"""Tests for the LangChain/LangGraph callback handler (no network, no LLM)."""

from __future__ import annotations

import tomllib
from pathlib import Path
from typing import Any
from uuid import uuid4

import pytest
from langchain_core.outputs import Generation, LLMResult
from lookspan import Framework, SpanStatus, SpanType

import lookspan_langgraph
from lookspan_langgraph.handler import LookspanCallbackHandler, provider_for_model


class _FakeClient:
    """Records spans instead of shipping them."""

    def __init__(self) -> None:
        self.spans: list[Any] = []
        self._n = 0

    def new_trace_id(self) -> str:
        self._n += 1
        return f"tr_{self._n}"

    def new_span_id(self) -> str:
        self._n += 1
        return f"sp_{self._n}"

    def emit(self, span: Any) -> None:
        self.spans.append(span)


@pytest.fixture
def client() -> _FakeClient:
    return _FakeClient()


@pytest.fixture
def handler(client: _FakeClient) -> LookspanCallbackHandler:
    return LookspanCallbackHandler(client, agent_id="planner", session_id="s1")


def _llm_result(model: str | None, *, prompt: int = 10, completion: int = 5) -> LLMResult:
    return LLMResult(
        generations=[[Generation(text="hello")]],
        llm_output={
            "model_name": model,
            "token_usage": {"prompt_tokens": prompt, "completion_tokens": completion},
        },
    )


class TestProviderForModel:
    """The bug this file was written for: the handler used to report the model
    name in the `provider` field, so every LangGraph user's traces were grouped
    under a provider called "gpt-4o"."""

    @pytest.mark.parametrize(
        ("model", "expected"),
        [
            ("gpt-4o", "openai"),
            ("GPT-4o-mini", "openai"),
            ("o3-mini", "openai"),
            ("claude-sonnet-4-6", "anthropic"),
            ("gemini-2.0-flash", "google"),
            ("mistral-large", "mistral"),
            ("llama-3.1-70b", "meta"),
            ("deepseek-chat", "deepseek"),
        ],
    )
    def test_known_models(self, model: str, expected: str) -> None:
        assert provider_for_model(model) == expected

    @pytest.mark.parametrize("model", [None, "", "something-nobody-has-heard-of"])
    def test_unknown_stays_unset_instead_of_guessing(self, model: str | None) -> None:
        assert provider_for_model(model) is None

    def test_llm_span_gets_provider_not_the_model_name(
        self, handler: LookspanCallbackHandler, client: _FakeClient
    ) -> None:
        run = uuid4()
        handler.on_llm_start(None, ["hi"], run_id=run)
        handler.on_llm_end(_llm_result("gpt-4o"), run_id=run)

        (span,) = client.spans
        assert span.model == "gpt-4o"
        assert span.provider == "openai"


class TestLlmSpans:
    def test_emits_one_span_with_usage_and_output(
        self, handler: LookspanCallbackHandler, client: _FakeClient
    ) -> None:
        run = uuid4()
        handler.on_llm_start(None, ["what is 2+2?"], run_id=run)
        handler.on_llm_end(_llm_result("claude-sonnet-4-6", prompt=120, completion=30), run_id=run)

        (span,) = client.spans
        assert span.type is SpanType.LLM_CALL
        assert span.status is SpanStatus.OK
        assert span.output == "hello"
        assert span.usage.input_tokens == 120
        assert span.usage.output_tokens == 30
        assert span.input == {"prompts": ["what is 2+2?"]}
        assert span.agent_id == "planner"
        assert span.session_id == "s1"
        assert span.framework is Framework.LANGGRAPH

    def test_missing_llm_output_does_not_explode(
        self, handler: LookspanCallbackHandler, client: _FakeClient
    ) -> None:
        run = uuid4()
        handler.on_llm_start(None, ["hi"], run_id=run)
        handler.on_llm_end(LLMResult(generations=[[Generation(text="ok")]]), run_id=run)

        (span,) = client.spans
        assert span.model is None
        assert span.provider is None
        assert span.usage.input_tokens == 0

    def test_error_marks_the_span_and_records_the_type(
        self, handler: LookspanCallbackHandler, client: _FakeClient
    ) -> None:
        run = uuid4()
        handler.on_llm_start(None, ["hi"], run_id=run)
        handler.on_llm_error(TimeoutError("provider timed out"), run_id=run)

        (span,) = client.spans
        assert span.status is SpanStatus.ERROR
        assert span.error == {"message": "provider timed out", "type": "TimeoutError"}


class TestChainsAndTools:
    def test_chain_span_carries_the_output(
        self, handler: LookspanCallbackHandler, client: _FakeClient
    ) -> None:
        run = uuid4()
        handler.on_chain_start(None, {"question": "hi"}, run_id=run)
        handler.on_chain_end({"answer": "there"}, run_id=run, name="my_chain")

        (span,) = client.spans
        assert span.type is SpanType.AGENT_STEP
        assert span.name == "my_chain"
        assert "answer" in span.output

    def test_tool_span_is_prefixed(
        self, handler: LookspanCallbackHandler, client: _FakeClient
    ) -> None:
        run = uuid4()
        handler.on_tool_start(None, "madrid", run_id=run)
        handler.on_tool_end("sunny", run_id=run, name="weather")

        (span,) = client.spans
        assert span.type is SpanType.TOOL_CALL
        assert span.name == "tool.weather"
        assert span.output == "sunny"

    def test_long_output_is_truncated(
        self, handler: LookspanCallbackHandler, client: _FakeClient
    ) -> None:
        run = uuid4()
        handler.on_tool_start(None, "x", run_id=run)
        handler.on_tool_end("y" * 20_000, run_id=run)

        (span,) = client.spans
        assert len(span.output) == 8000


class TestCausality:
    def test_child_runs_share_the_parent_trace_id(
        self, handler: LookspanCallbackHandler, client: _FakeClient
    ) -> None:
        parent, child = uuid4(), uuid4()
        handler.on_chain_start(None, {}, run_id=parent)
        handler.on_llm_start(None, ["hi"], run_id=child, parent_run_id=parent)
        handler.on_llm_end(_llm_result("gpt-4o"), run_id=child, parent_run_id=parent)
        handler.on_chain_end({}, run_id=parent)

        llm, chain = client.spans
        assert llm.trace_id == chain.trace_id
        assert llm.parent_span_id == str(parent)
        assert chain.parent_span_id is None

    def test_independent_chains_get_independent_traces(
        self, handler: LookspanCallbackHandler, client: _FakeClient
    ) -> None:
        for _ in range(2):
            run = uuid4()
            handler.on_chain_start(None, {}, run_id=run)
            handler.on_chain_end({}, run_id=run)

        a, b = client.spans
        assert a.trace_id != b.trace_id

    def test_an_end_without_a_start_is_ignored(
        self, handler: LookspanCallbackHandler, client: _FakeClient
    ) -> None:
        handler.on_chain_end({}, run_id=uuid4())
        assert client.spans == []


def test_version_matches_pyproject() -> None:
    """The published package once shipped as 0.1.1 while reporting 0.0.1."""
    root = Path(__file__).resolve().parents[1]
    meta = tomllib.loads((root / "pyproject.toml").read_text(encoding="utf-8"))
    assert lookspan_langgraph.__version__ == meta["project"]["version"]
