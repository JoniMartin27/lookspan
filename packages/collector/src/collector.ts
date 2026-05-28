import type { IngestPayload, IngestResponse, SpanInput } from '@lookspan/types';
import { LookspanEventType, emit } from '@lookspan/events';
import {
  type LookspanDatabase,
  SpansRepository,
  TracesRepository,
} from '@lookspan/storage';
import { recomputeTrace } from './aggregator.js';
import { IngestValidationError, validatePayload, validateSpan } from './normalize.js';

export interface CollectorOptions {
  db: LookspanDatabase;
}

export class Collector {
  private readonly spans: SpansRepository;
  private readonly traces: TracesRepository;
  private readonly db: LookspanDatabase;

  constructor(options: CollectorOptions) {
    this.db = options.db;
    this.spans = new SpansRepository(options.db);
    this.traces = new TracesRepository(options.db);
  }

  ingest(rawPayload: unknown): IngestResponse {
    const payload = validatePayload(rawPayload);
    const errors: { index: number; reason: string }[] = [];
    const validSpans: SpanInput[] = [];

    payload.spans.forEach((span, index) => {
      try {
        validSpans.push(validateSpan(span, index));
      } catch (err) {
        const reason =
          err instanceof IngestValidationError ? err.message : (err as Error).message;
        errors.push({ index, reason });
      }
    });

    if (validSpans.length === 0) {
      return { accepted: 0, rejected: errors.length, errors };
    }

    const receivedAt = new Date().toISOString();
    const inserted = this.spans.insertMany(validSpans, receivedAt);

    const affectedTraces = new Set(inserted.map((s) => s.traceId));
    for (const traceId of affectedTraces) {
      const trace = recomputeTrace(this.db, traceId);
      if (!trace) continue;
      this.traces.upsert(trace);
      emit({ type: LookspanEventType.TraceUpdated, trace });
    }

    for (const span of inserted) {
      emit({ type: LookspanEventType.SpanIngested, span });
    }

    return {
      accepted: inserted.length,
      rejected: errors.length,
      errors: errors.length > 0 ? errors : undefined,
    };
  }
}
