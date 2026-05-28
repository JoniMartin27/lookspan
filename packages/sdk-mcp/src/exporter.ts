import type { IngestPayload, SpanInput } from '@lookspan/types';

export interface SpanExporter {
  send(spans: SpanInput[]): Promise<void>;
  flush(): Promise<void>;
}

export interface HttpExporterOptions {
  endpoint: string;
  flushIntervalMs?: number;
  maxBatchSize?: number;
  source?: string;
  fetchImpl?: typeof fetch;
}

export class HttpSpanExporter implements SpanExporter {
  private buffer: SpanInput[] = [];
  private timer: NodeJS.Timeout | null = null;
  private readonly flushIntervalMs: number;
  private readonly maxBatchSize: number;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: HttpExporterOptions) {
    this.flushIntervalMs = options.flushIntervalMs ?? 1000;
    this.maxBatchSize = options.maxBatchSize ?? 100;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async send(spans: SpanInput[]): Promise<void> {
    this.buffer.push(...spans);
    if (this.buffer.length >= this.maxBatchSize) {
      await this.flush();
    } else {
      this.scheduleFlush();
    }
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const batch = this.buffer;
    this.buffer = [];

    const payload: IngestPayload = {
      spans: batch,
      source: this.options.source ?? '@lookspan/mcp',
      sentAt: new Date().toISOString(),
    };

    try {
      await this.fetchImpl(this.options.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      console.warn('[lookspan/mcp] export failed:', (err as Error).message);
    }
  }

  private scheduleFlush(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, this.flushIntervalMs);
  }
}
