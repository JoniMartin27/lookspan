import { useEffect, useRef, useState } from 'react';

export interface StreamEvent {
  type: string;
  [key: string]: unknown;
}

const EVENT_TYPES = [
  'span.ingested',
  'trace.started',
  'trace.completed',
  'trace.updated',
  'alert.triggered',
];

/**
 * Subscribe to the server's SSE stream. `onEvent` (if given) is called once per
 * event — use it for side effects like alert toasts, since multiple events can
 * arrive in the same tick and would be coalesced if you only read `lastEvent`.
 */
export function useStream(onEvent?: (event: StreamEvent) => void): {
  lastEvent: StreamEvent | null;
  connected: boolean;
} {
  const [lastEvent, setLastEvent] = useState<StreamEvent | null>(null);
  const [connected, setConnected] = useState(false);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    const source = new EventSource('/api/stream');

    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);

    const handle = (e: MessageEvent) => {
      try {
        const parsed = JSON.parse(e.data) as StreamEvent;
        onEventRef.current?.(parsed);
        setLastEvent(parsed);
      } catch {
        /* ignore malformed payload */
      }
    };

    // The server emits named SSE events (`event: <type>`), which fire only on
    // matching addEventListener handlers — not on `onmessage`.
    for (const type of EVENT_TYPES) source.addEventListener(type, handle as EventListener);
    source.onmessage = handle; // fallback for any unnamed events

    return () => {
      for (const type of EVENT_TYPES) source.removeEventListener(type, handle as EventListener);
      source.close();
    };
  }, []);

  return { lastEvent, connected };
}
