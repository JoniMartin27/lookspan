"""High-level client wrapping an exporter with id helpers and convenience methods."""

from __future__ import annotations

from dataclasses import replace
from datetime import datetime, timezone

from lookspan.exporter import HttpSpanExporter, SpanExporter
from lookspan.ids import new_span_id, new_trace_id
from lookspan.types import Span, SpanStatus, SpanType


class LookspanClient:
    """Convenience wrapper around an exporter."""

    def __init__(
        self,
        endpoint: str = "http://127.0.0.1:3100/api/ingest",
        *,
        exporter: SpanExporter | None = None,
        source: str = "lookspan-python",
        capture_content: bool = False,
    ) -> None:
        self._exporter = exporter or HttpSpanExporter(endpoint=endpoint, source=source)
        self._capture_content = capture_content

    @staticmethod
    def now() -> str:
        return datetime.now(tz=timezone.utc).isoformat().replace("+00:00", "Z")

    @staticmethod
    def new_trace_id() -> str:
        return new_trace_id()

    @staticmethod
    def new_span_id() -> str:
        return new_span_id()

    def send(self, spans: list[Span]) -> None:
        self._exporter.send([self._prepare_span(span) for span in spans])

    def emit(self, span: Span) -> None:
        self._exporter.send([self._prepare_span(span)])

    def _prepare_span(self, span: Span) -> Span:
        if self._capture_content:
            return span
        return replace(span, input=None, output=None)

    def flush(self) -> None:
        self._exporter.flush()

    def close(self) -> None:
        self._exporter.close()

    def __enter__(self) -> LookspanClient:
        return self

    def __exit__(self, *_exc: object) -> None:
        self.close()


__all__ = ["LookspanClient", "Span", "SpanStatus", "SpanType"]
