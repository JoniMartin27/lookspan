import type { SpanInput } from '@lookspan/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpSpanExporter } from './exporter.js';

const span = (): SpanInput =>
  ({
    traceId: 'tr_1',
    spanId: 'sp_1',
    parentSpanId: null,
    type: 'llm_call',
    name: 'completion',
    startedAt: '2026-06-01T10:00:00Z',
    endedAt: '2026-06-01T10:00:01Z',
    status: 'ok',
    framework: 'custom',
  }) as unknown as SpanInput;

const ok = () => new Response(null, { status: 200 });
const fail = (status: number) => new Response(null, { status });

describe('HttpSpanExporter retry behavior', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends the batch in a single attempt on success', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok());
    const exp = new HttpSpanExporter({ endpoint: 'http://x/ingest', fetchImpl });
    await exp.send([span()]);
    await exp.flush();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('retries a transient network error and succeeds', async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValueOnce(ok());
    const exp = new HttpSpanExporter({ endpoint: 'http://x/ingest', fetchImpl, retryBackoffMs: 0 });
    await exp.flush(); // empty: no-op
    await exp.send([span()]);
    await exp.flush();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('retries 5xx responses up to maxRetries then warns', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fail(503));
    const exp = new HttpSpanExporter({
      endpoint: 'http://x/ingest',
      fetchImpl,
      retryBackoffMs: 0,
      maxRetries: 2,
    });
    await exp.send([span()]);
    await exp.flush();
    expect(fetchImpl).toHaveBeenCalledTimes(3); // 1 + 2 retries
    expect(console.warn).toHaveBeenCalledOnce();
  });

  it('does not retry 4xx client errors', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fail(400));
    const exp = new HttpSpanExporter({ endpoint: 'http://x/ingest', fetchImpl, retryBackoffMs: 0 });
    await exp.send([span()]);
    await exp.flush();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalledOnce();
  });
});
