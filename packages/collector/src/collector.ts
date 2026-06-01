import { emit, LookspanEventType } from '@lookspan/events';
import { type LookspanDatabase, SpansRepository, TracesRepository } from '@lookspan/storage';
import type { IngestResponse, SpanInput } from '@lookspan/types';
import { recomputeTrace } from './aggregator.js';
import { IngestValidationError, validatePayload, validateSpan } from './normalize.js';
import { enrichSpanCost } from './pricing.js';
import { type RedactOptions, redactSpan } from './redact.js';

export interface CollectorOptions {
  db: LookspanDatabase;
  /**
   * Redact credential-looking keys from span input/attributes before they hit
   * the database. Enabled by default; pass `false` to store raw telemetry, or
   * an options object to tune the key patterns.
   */
  redact?: boolean | RedactOptions;
}

export class Collector {
  private readonly spans: SpansRepository;
  private readonly traces: TracesRepository;
  private readonly db: LookspanDatabase;
  private readonly redactOptions: RedactOptions | null;

  constructor(options: CollectorOptions) {
    this.db = options.db;
    this.spans = new SpansRepository(options.db);
    this.traces = new TracesRepository(options.db);
    const redact = options.redact ?? true;
    this.redactOptions = redact === false ? null : redact === true ? {} : redact;
  }

  private prepareSpan(span: unknown, index: number): SpanInput {
    const validated = enrichSpanCost(validateSpan(span, index));
    return this.redactOptions ? redactSpan(validated, this.redactOptions) : validated;
  }

  ingest(rawPayload: unknown): IngestResponse {
    const payload = validatePayload(rawPayload);
    const errors: { index: number; reason: string }[] = [];
    const validSpans: SpanInput[] = [];

    payload.spans.forEach((span, index) => {
      try {
        validSpans.push(this.prepareSpan(span, index));
      } catch (err) {
        const reason = err instanceof IngestValidationError ? err.message : (err as Error).message;
        errors.push({ index, reason });
      }
    });

    if (validSpans.length === 0) {
      return { accepted: 0, rejected: errors.length, errors };
    }

    const receivedAt = new Date().toISOString();
    // spans.trace_id has a FK to traces(trace_id) and foreign_keys is ON, so a
    // trace row must exist before its spans are inserted. recomputeTrace() only
    // runs after insertMany, so seed a placeholder trace per new traceId first
    // (it's overwritten with the aggregated trace right below).
    this.ensureTracePlaceholders(validSpans);
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

  /**
   * Seed a minimal trace row for every traceId that doesn't have one yet, so
   * the spans FK is satisfied. The root span (no parentSpanId) supplies the
   * metadata when present; otherwise the first span of the trace is used.
   * recomputeTrace() overwrites these with the fully aggregated trace.
   */
  private ensureTracePlaceholders(spans: SpanInput[]): void {
    const seeds = new Map<string, SpanInput>();
    for (const s of spans) {
      const existing = seeds.get(s.traceId);
      if (!existing || (existing.parentSpanId && !s.parentSpanId)) {
        seeds.set(s.traceId, s);
      }
    }
    const stmt = this.db.prepare(
      `INSERT OR IGNORE INTO traces (trace_id, root_name, framework, agent_id, session_id, started_at, status)
       VALUES (@traceId, @rootName, @framework, @agentId, @sessionId, @startedAt, @status)`,
    );
    const insertAll = this.db.transaction((rows: SpanInput[]) => {
      for (const s of rows) {
        stmt.run({
          traceId: s.traceId,
          rootName: s.name,
          framework: s.framework,
          agentId: s.agentId ?? null,
          sessionId: s.sessionId ?? null,
          startedAt: s.startedAt,
          status: s.status,
        });
      }
    });
    insertAll([...seeds.values()]);
  }
}
