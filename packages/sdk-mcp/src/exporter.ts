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
  /** Extra POST attempts after the first on a transient failure. Default: 2. */
  maxRetries?: number;
  /** Base backoff between attempts; doubles each retry. Default: 200ms. */
  retryBackoffMs?: number;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class HttpSpanExporter implements SpanExporter {
  private buffer: SpanInput[] = [];
  private timer: NodeJS.Timeout | null = null;
  private readonly flushIntervalMs: number;
  private readonly maxBatchSize: number;
  private readonly fetchImpl: typeof fetch;
  private readonly maxRetries: number;
  private readonly retryBackoffMs: number;

  constructor(private readonly options: HttpExporterOptions) {
    this.flushIntervalMs = options.flushIntervalMs ?? 1000;
    this.maxBatchSize = options.maxBatchSize ?? 100;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.maxRetries = Math.max(0, options.maxRetries ?? 2);
    this.retryBackoffMs = Math.max(0, options.retryBackoffMs ?? 200);
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
    const body = JSON.stringify(payload);

    // Telemetry must never crash or block the host app, but a single transient
    // failure (collector restarting, brief network blip) shouldn't silently
    // drop a whole batch either. Retry transient errors with exponential
    // backoff; give up on client errors (4xx) since the payload won't change.
    let lastError = '';
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) await sleep(this.retryBackoffMs * 2 ** (attempt - 1));
      try {
        const res = await this.fetchImpl(this.options.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        });
        if (res.ok) return;
        lastError = `HTTP ${res.status}`;
        if (res.status >= 400 && res.status < 500) break; // not retryable
      } catch (err) {
        lastError = (err as Error).message;
      }
    }
    console.warn(
      `[lookspan/mcp] export failed after ${this.maxRetries + 1} attempt(s), dropped ${batch.length} span(s): ${lastError}`,
    );
  }

  private scheduleFlush(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, this.flushIntervalMs);
  }
}
