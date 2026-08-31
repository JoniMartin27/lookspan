"""Lookspan Python SDK — emit spans from AI agents to a local-first dashboard."""

from lookspan.client import LookspanClient
from lookspan.exporter import HttpSpanExporter, SpanExporter
from lookspan.ids import new_span_id, new_trace_id
from lookspan.types import (
    Framework,
    Span,
    SpanStatus,
    SpanType,
    TokenUsage,
)

__version__ = "0.6.0"
__all__ = [
    "Framework",
    "HttpSpanExporter",
    "LookspanClient",
    "Span",
    "SpanExporter",
    "SpanStatus",
    "SpanType",
    "TokenUsage",
    "new_span_id",
    "new_trace_id",
]
