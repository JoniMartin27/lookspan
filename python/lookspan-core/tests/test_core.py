"""Tests for the lookspan core SDK (no network)."""

from lookspan import (
    Framework,
    Span,
    SpanStatus,
    SpanType,
    TokenUsage,
    new_span_id,
    new_trace_id,
)
from lookspan.types import IngestPayload


def test_ids_have_expected_lengths():
    assert len(new_trace_id()) == 32
    assert len(new_span_id()) == 16
    assert new_trace_id() != new_trace_id()


def test_span_to_payload_uses_camelcase_contract():
    span = Span(
        trace_id="tr_1",
        span_id="sp_1",
        parent_span_id=None,
        type=SpanType.LLM_CALL,
        name="agent.completion",
        started_at="2026-06-03T10:00:00Z",
        ended_at="2026-06-03T10:00:01Z",
        status=SpanStatus.OK,
        framework=Framework.CUSTOM,
        model="gpt-4o",
        provider="openai",
        usage=TokenUsage(input_tokens=100, output_tokens=40),
    )
    p = span.to_payload()
    assert p["traceId"] == "tr_1"
    assert p["spanId"] == "sp_1"
    assert p["startedAt"] == "2026-06-03T10:00:00Z"
    assert p["type"] == "llm_call"
    assert p["status"] == "ok"
    assert p["framework"] == "custom"
    assert p["usage"]["inputTokens"] == 100
    assert p["usage"]["outputTokens"] == 40


def test_framework_accepts_plain_string():
    span = Span(
        trace_id="t",
        span_id="s",
        parent_span_id=None,
        type=SpanType.CUSTOM,
        name="x",
        started_at="2026-06-03T10:00:00Z",
        status=SpanStatus.OK,
        framework="my-framework",
    )
    assert span.to_payload()["framework"] == "my-framework"


def test_ingest_payload_serializes_spans_and_source():
    span = Span(
        trace_id="t",
        span_id="s",
        parent_span_id=None,
        type=SpanType.CUSTOM,
        name="x",
        started_at="2026-06-03T10:00:00Z",
        status=SpanStatus.OK,
        framework=Framework.MCP,
    )
    out = IngestPayload(spans=[span], source="test").to_payload()
    assert out["source"] == "test"
    assert len(out["spans"]) == 1
    assert out["spans"][0]["spanId"] == "s"
