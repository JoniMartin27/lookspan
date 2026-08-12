"""Type definitions mirroring the TypeScript @lookspan/types package."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from enum import Enum
from typing import Any


class SpanType(str, Enum):
    AGENT_STEP = "agent_step"
    LLM_CALL = "llm_call"
    TOOL_CALL = "tool_call"
    RETRIEVAL = "retrieval"
    EMBEDDING = "embedding"
    ERROR = "error"
    CUSTOM = "custom"


class SpanStatus(str, Enum):
    OK = "ok"
    ERROR = "error"
    CANCELLED = "cancelled"


class Framework(str, Enum):
    MCP = "mcp"
    LANGGRAPH = "langgraph"
    CREWAI = "crewai"
    AGENT_OS = "agent-os"
    OPENAI_AGENTS = "openai-agents"
    OTLP = "otlp"
    CUSTOM = "custom"


@dataclass
class TokenUsage:
    input_tokens: int = 0
    output_tokens: int = 0
    cached_input_tokens: int = 0
    reasoning_tokens: int = 0
    cost_usd: float = 0.0

    def to_payload(self) -> dict[str, Any]:
        return {
            "inputTokens": self.input_tokens,
            "outputTokens": self.output_tokens,
            "cachedInputTokens": self.cached_input_tokens,
            "reasoningTokens": self.reasoning_tokens,
            "costUsd": self.cost_usd,
        }


@dataclass
class Span:
    trace_id: str
    span_id: str
    parent_span_id: str | None
    type: SpanType
    name: str
    started_at: str
    status: SpanStatus
    framework: Framework | str
    ended_at: str | None = None
    agent_id: str | None = None
    session_id: str | None = None
    model: str | None = None
    provider: str | None = None
    input: dict[str, Any] | None = None
    output: str | None = None
    error: dict[str, Any] | None = None
    usage: TokenUsage | None = None
    attributes: dict[str, Any] | None = field(default=None)

    def to_payload(self) -> dict[str, Any]:
        framework = (
            self.framework.value if isinstance(self.framework, Enum) else self.framework
        )
        payload: dict[str, Any] = {
            "traceId": self.trace_id,
            "spanId": self.span_id,
            "parentSpanId": self.parent_span_id,
            "type": self.type.value,
            "name": self.name,
            "startedAt": self.started_at,
            "endedAt": self.ended_at,
            "status": self.status.value,
            "framework": framework,
            "agentId": self.agent_id,
            "sessionId": self.session_id,
            "model": self.model,
            "provider": self.provider,
            "input": self.input,
            "output": self.output,
            "error": self.error,
            "attributes": self.attributes,
        }
        if self.usage is not None:
            payload["usage"] = self.usage.to_payload()
        return payload


@dataclass
class IngestPayload:
    spans: list[Span]
    source: str | None = None
    sent_at: str | None = None

    def to_payload(self) -> dict[str, Any]:
        out = {
            "spans": [s.to_payload() for s in self.spans],
        }
        if self.source is not None:
            out["source"] = self.source
        if self.sent_at is not None:
            out["sentAt"] = self.sent_at
        return out


def _strip_none(d: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in d.items() if v is not None}


__all__ = [
    "Framework",
    "IngestPayload",
    "Span",
    "SpanStatus",
    "SpanType",
    "TokenUsage",
    "_strip_none",
    "asdict",
]
