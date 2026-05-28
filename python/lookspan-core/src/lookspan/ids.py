"""Identifier helpers for traces and spans."""

from __future__ import annotations

import secrets


def new_trace_id() -> str:
    """Return a 32-char hex trace ID (16 random bytes)."""
    return secrets.token_hex(16)


def new_span_id() -> str:
    """Return a 16-char hex span ID (8 random bytes)."""
    return secrets.token_hex(8)


__all__ = ["new_span_id", "new_trace_id"]
