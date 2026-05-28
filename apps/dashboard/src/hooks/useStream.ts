import { useEffect, useRef, useState } from 'react';

export interface StreamEvent {
  type: string;
  [key: string]: unknown;
}

export function useStream(url = '/api/stream'): { lastEvent: StreamEvent | null; connected: boolean } {
  const [lastEvent, setLastEvent] = useState<StreamEvent | null>(null);
  const [connected, setConnected] = useState(false);
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const source = new EventSource(url);
    sourceRef.current = source;

    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    source.onmessage = (e) => {
      try {
        setLastEvent(JSON.parse(e.data) as StreamEvent);
      } catch {
        /* ignore malformed payload */
      }
    };

    return () => {
      source.close();
      sourceRef.current = null;
    };
  }, [url]);

  return { lastEvent, connected };
}
