"""Tests for the CrewAI listener.

CrewAI itself is only imported inside `attach()`, so the whole span-building
path can be exercised with plain stand-in event objects — no crewai install, no
network, no LLM.
"""

from __future__ import annotations

import tomllib
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest
from lookspan import Framework, SpanStatus, SpanType

import lookspan_crewai
from lookspan_crewai.handler import LookspanCrewAiListener, _truncate


class _FakeClient:
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
def listener(client: _FakeClient) -> LookspanCrewAiListener:
    return LookspanCrewAiListener(client, agent_id="crew-1", session_id="s1")


def _event(**kwargs: Any) -> SimpleNamespace:
    return SimpleNamespace(**kwargs)


class TestCrewLifecycle:
    def test_a_crew_run_produces_one_span(
        self, listener: LookspanCrewAiListener, client: _FakeClient
    ) -> None:
        listener._on_crew_started(None, _event(crew_name="support"))
        listener._on_crew_completed(None, _event(crew_name="support", output="done"))

        (span,) = client.spans
        assert span.name == "crew.support"
        assert span.type is SpanType.AGENT_STEP
        assert span.status is SpanStatus.OK
        assert span.output == "done"
        assert span.framework is Framework.CREWAI
        assert span.agent_id == "crew-1"
        assert span.session_id == "s1"
        assert span.parent_span_id is None

    def test_everything_in_one_kickoff_shares_a_trace(
        self, listener: LookspanCrewAiListener, client: _FakeClient
    ) -> None:
        listener._on_crew_started(None, _event(crew_name="c"))
        agent = _event(agent=_event(role="researcher"))
        listener._on_agent_started(None, agent)
        listener._on_agent_completed(None, _event(output="found it"))
        listener._on_crew_completed(None, _event(crew_name="c"))

        assert len({s.trace_id for s in client.spans}) == 1

    def test_two_kickoffs_do_not_share_a_trace(
        self, listener: LookspanCrewAiListener, client: _FakeClient
    ) -> None:
        for name in ("first", "second"):
            listener._on_crew_started(None, _event(crew_name=name))
            listener._on_crew_completed(None, _event(crew_name=name))

        a, b = client.spans
        assert a.trace_id != b.trace_id

    def test_events_outside_a_kickoff_are_dropped_not_crashed(
        self, listener: LookspanCrewAiListener, client: _FakeClient
    ) -> None:
        """`_trace_id` is None before kickoff — a stray completion must not raise."""
        listener._on_agent_started(None, _event(agent=_event(role="ghost")))
        listener._on_agent_completed(None, _event(output="x"))
        assert client.spans == []


class TestNesting:
    def test_agent_hangs_off_the_crew_and_task_off_the_agent(
        self, listener: LookspanCrewAiListener, client: _FakeClient
    ) -> None:
        listener._on_crew_started(None, _event(crew_name="c"))
        crew_span_id = listener._latest_open("crew:")
        listener._on_agent_started(None, _event(agent=_event(role="writer")))
        agent_span_id = listener._latest_open("agent:")
        listener._on_task_started(None, _event(task=_event(description="write the post")))

        listener._on_task_completed(None, _event(output="written"))
        listener._on_agent_completed(None, _event(output="ok"))
        listener._on_crew_completed(None, _event(crew_name="c"))

        task, agent, crew = client.spans
        assert task.parent_span_id == agent_span_id
        assert agent.parent_span_id == crew_span_id
        assert crew.parent_span_id is None

    def test_a_tool_hangs_off_the_task(
        self, listener: LookspanCrewAiListener, client: _FakeClient
    ) -> None:
        listener._on_crew_started(None, _event(crew_name="c"))
        listener._on_task_started(None, _event(task=_event(description="t")))
        task_span_id = listener._latest_open("task:")
        listener._on_tool_started(None, _event(tool_name="search"))
        listener._on_tool_finished(None, _event(output="results"))

        (tool,) = client.spans
        assert tool.type is SpanType.TOOL_CALL
        assert tool.name == "tool.search"
        assert tool.parent_span_id == task_span_id

    def test_long_task_descriptions_are_cut_for_the_span_name(
        self, listener: LookspanCrewAiListener, client: _FakeClient
    ) -> None:
        listener._on_crew_started(None, _event(crew_name="c"))
        listener._on_task_started(None, _event(task=_event(description="d" * 500)))
        listener._on_task_completed(None, _event(output=None))

        (task,) = client.spans
        assert len(task.name) == len("task: ") + 80


class TestLlmSpans:
    def test_usage_and_model_are_carried_over(
        self, listener: LookspanCrewAiListener, client: _FakeClient
    ) -> None:
        listener._on_crew_started(None, _event(crew_name="c"))
        listener._on_llm_started(None, _event(model="gpt-4o-mini"))
        listener._on_llm_completed(
            None,
            _event(
                response="42",
                usage=_event(prompt_tokens=100, completion_tokens=7),
            ),
        )

        (span,) = client.spans
        assert span.type is SpanType.LLM_CALL
        assert span.model == "gpt-4o-mini"
        assert span.usage.input_tokens == 100
        assert span.usage.output_tokens == 7
        assert span.output == "42"

    def test_missing_usage_leaves_it_unset_rather_than_zero(
        self, listener: LookspanCrewAiListener, client: _FakeClient
    ) -> None:
        listener._on_crew_started(None, _event(crew_name="c"))
        listener._on_llm_started(None, _event(model="gpt-4o"))
        listener._on_llm_completed(None, _event(response="hi", usage=None))

        (span,) = client.spans
        assert span.usage is None


class TestTruncate:
    def test_non_strings_are_stringified(self) -> None:
        assert _truncate({"a": 1}) == "{'a': 1}"

    def test_none_stays_none(self) -> None:
        assert _truncate(None) is None

    def test_cut_at_the_limit(self) -> None:
        assert len(_truncate("x" * 20_000)) == 8000


def test_version_matches_pyproject() -> None:
    """The published package once shipped as 0.1.1 while reporting 0.0.1."""
    root = Path(__file__).resolve().parents[1]
    meta = tomllib.loads((root / "pyproject.toml").read_text(encoding="utf-8"))
    assert lookspan_crewai.__version__ == meta["project"]["version"]
