import type { Span, Trace } from '@lookspan/types';

export const LookspanEventType = {
  SpanIngested: 'span.ingested',
  TraceStarted: 'trace.started',
  TraceCompleted: 'trace.completed',
  TraceUpdated: 'trace.updated',
  CollectorConnected: 'collector.connected',
  CollectorDisconnected: 'collector.disconnected',
} as const;

export type LookspanEventType = (typeof LookspanEventType)[keyof typeof LookspanEventType];

export type LookspanEvent =
  | { type: typeof LookspanEventType.SpanIngested; span: Span; receivedAt: string }
  | { type: typeof LookspanEventType.TraceStarted; trace: Trace; receivedAt: string }
  | { type: typeof LookspanEventType.TraceCompleted; trace: Trace; receivedAt: string }
  | { type: typeof LookspanEventType.TraceUpdated; trace: Trace; receivedAt: string }
  | {
      type: typeof LookspanEventType.CollectorConnected;
      source: string;
      receivedAt: string;
    }
  | {
      type: typeof LookspanEventType.CollectorDisconnected;
      source: string;
      receivedAt: string;
    };

type Listener = (event: LookspanEvent) => void;

// Distributive Omit: a plain `Omit<LookspanEvent, 'receivedAt'>` collapses the
// discriminated union to its common keys (only `type`), dropping `span`/`trace`/
// `source`. Distributing over each member preserves the per-variant payload.
type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

const listeners = new Set<Listener>();

export function emit(event: DistributiveOmit<LookspanEvent, 'receivedAt'>): LookspanEvent {
  const enriched = { ...event, receivedAt: new Date().toISOString() } as LookspanEvent;
  for (const listener of listeners) {
    try {
      listener(enriched);
    } catch (err) {
      console.error('[lookspan/events] listener threw:', err);
    }
  }
  return enriched;
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function listenerCount(): number {
  return listeners.size;
}

export function clearListeners(): void {
  listeners.clear();
}
