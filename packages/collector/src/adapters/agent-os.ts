import { FrameworkName } from '@lookspan/types';
import type { Collector } from '../collector.js';
import type { CollectorAdapter } from './types.js';

export interface AgentOsAdapterOptions {
  baseUrl: string;
  collector: Collector;
  reconnectDelayMs?: number;
}

export class AgentOsAdapter implements CollectorAdapter {
  readonly name = FrameworkName.AgentOs;
  readonly description =
    'Subscribes to the AGENT-OS SSE control event bus and converts events into Lookspan spans.';

  private controller: AbortController | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(private readonly options: AgentOsAdapterOptions) {}

  async start(): Promise<void> {
    this.connect();
  }

  async stop(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.controller?.abort();
    this.controller = null;
  }

  private connect(): void {
    this.controller = new AbortController();
    const url = new URL('/api/events', this.options.baseUrl).toString();

    fetch(url, {
      signal: this.controller.signal,
      headers: { Accept: 'text/event-stream' },
    })
      .then(async (response) => {
        if (!response.ok || !response.body) {
          throw new Error(`SSE connection failed: ${response.status}`);
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split('\n\n');
          buffer = events.pop() ?? '';
          for (const evt of events) {
            this.handleEvent(evt);
          }
        }
      })
      .catch((err) => {
        if ((err as Error).name === 'AbortError') return;
        console.warn('[lookspan/agent-os] disconnected:', (err as Error).message);
        this.scheduleReconnect();
      });
  }

  private scheduleReconnect(): void {
    const delay = this.options.reconnectDelayMs ?? 2000;
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private handleEvent(_raw: string): void {
    // Phase 1 stub: parse SSE event, map AGENT-OS ControlEvent → Lookspan SpanInput,
    // then call this.options.collector.ingest({ spans: [...] }).
    // Wired up in Fase 1 once a real AGENT-OS run is captured live.
  }
}
