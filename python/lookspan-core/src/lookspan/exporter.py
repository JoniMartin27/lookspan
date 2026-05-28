"""Span exporters — pluggable transports for sending spans to a Lookspan collector."""

from __future__ import annotations

import threading
from datetime import datetime, timezone
from typing import Protocol

import httpx

from lookspan.types import IngestPayload, Span


class SpanExporter(Protocol):
    def send(self, spans: list[Span]) -> None: ...
    def flush(self) -> None: ...
    def close(self) -> None: ...


class HttpSpanExporter:
    """Buffered HTTP exporter. Spans are batched and flushed asynchronously."""

    def __init__(
        self,
        endpoint: str,
        *,
        source: str = "lookspan-python",
        flush_interval: float = 1.0,
        max_batch_size: int = 100,
        timeout: float = 5.0,
        client: httpx.Client | None = None,
    ) -> None:
        self._endpoint = endpoint
        self._source = source
        self._flush_interval = flush_interval
        self._max_batch_size = max_batch_size
        self._buffer: list[Span] = []
        self._lock = threading.Lock()
        self._client = client or httpx.Client(timeout=timeout)
        self._timer: threading.Timer | None = None
        self._closed = False

    def send(self, spans: list[Span]) -> None:
        if self._closed:
            return
        with self._lock:
            self._buffer.extend(spans)
            if len(self._buffer) >= self._max_batch_size:
                self._flush_locked()
            else:
                self._schedule_flush()

    def flush(self) -> None:
        with self._lock:
            self._flush_locked()

    def close(self) -> None:
        self.flush()
        self._closed = True
        if self._timer:
            self._timer.cancel()
            self._timer = None
        self._client.close()

    def _schedule_flush(self) -> None:
        if self._timer is not None:
            return
        self._timer = threading.Timer(self._flush_interval, self._timer_flush)
        self._timer.daemon = True
        self._timer.start()

    def _timer_flush(self) -> None:
        with self._lock:
            self._timer = None
            self._flush_locked()

    def _flush_locked(self) -> None:
        if not self._buffer:
            return
        batch = self._buffer
        self._buffer = []
        if self._timer:
            self._timer.cancel()
            self._timer = None
        payload = IngestPayload(
            spans=batch,
            source=self._source,
            sent_at=datetime.now(tz=timezone.utc).isoformat().replace("+00:00", "Z"),
        )
        try:
            self._client.post(self._endpoint, json=payload.to_payload())
        except httpx.HTTPError as err:
            # Don't crash the user's app on telemetry failures.
            print(f"[lookspan] export failed: {err}")


__all__ = ["HttpSpanExporter", "SpanExporter"]
