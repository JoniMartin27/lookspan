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
from lookspan.exporter import HttpSpanExporter
from lookspan.types import IngestPayload


class _FakeClient:
    """Stand-in for httpx.Client that records posts instead of sending them."""

    def __init__(self) -> None:
        self.posts: list[dict] = []
        self.closed = False

    def post(self, url: str, json: dict | None = None):
        self.posts.append({"url": url, "json": json})
        return None

    def close(self) -> None:
        self.closed = True


def _sample_span() -> Span:
    return Span(
        trace_id="t",
        span_id="s",
        parent_span_id=None,
        type=SpanType.CUSTOM,
        name="x",
        started_at="2026-06-03T10:00:00Z",
        status=SpanStatus.OK,
        framework=Framework.CUSTOM,
    )


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


def test_exporter_context_manager_flushes_on_exit():
    fake = _FakeClient()
    with HttpSpanExporter("http://x/api/ingest", client=fake) as exp:
        exp.send([_sample_span()])
        assert fake.posts == []  # buffered, below batch size — not sent yet
    # leaving the context flushes the buffer and closes the client
    assert len(fake.posts) == 1
    assert fake.posts[0]["url"] == "http://x/api/ingest"
    assert fake.posts[0]["json"]["spans"][0]["spanId"] == "s"
    assert fake.closed


def test_exporter_close_is_idempotent():
    fake = _FakeClient()
    exp = HttpSpanExporter("http://x/api/ingest", client=fake)
    exp.send([_sample_span()])
    exp.close()
    exp.close()  # second close is a no-op, not a double flush
    assert len(fake.posts) == 1
