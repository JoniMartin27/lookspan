import { emit, LookspanEventType } from '@lookspan/events';
import {
  AlertsRepository,
  type LookspanDatabase,
  SpansRepository,
  TracesRepository,
} from '@lookspan/storage';
import type { AlertRule, IngestResponse, SpanInput } from '@lookspan/types';
import { recomputeTrace } from './aggregator.js';
import { AlertEngine } from './alerts.js';
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
  /** Alert rules evaluated on every trace update. Empty = alerting off. */
  alertRules?: AlertRule[];
  /** Reject batches with more than this many spans (default 2000). */
  maxSpansPerBatch?: number;
}

const DEFAULT_MAX_SPANS = 2000;

export class Collector {
  private readonly spans: SpansRepository;
  private readonly traces: TracesRepository;
  private readonly alertsRepo: AlertsRepository;
  private readonly alerts: AlertEngine;
  private readonly db: LookspanDatabase;
  private readonly redactOptions: RedactOptions | null;
  private readonly maxSpansPerBatch: number;

  constructor(options: CollectorOptions) {
    this.db = options.db;
    this.spans = new SpansRepository(options.db);
    this.traces = new TracesRepository(options.db);
    this.alertsRepo = new AlertsRepository(options.db);
    this.alerts = new AlertEngine(options.alertRules ?? []);
    const redact = options.redact ?? true;
    this.redactOptions = redact === false ? null : redact === true ? {} : redact;
    this.maxSpansPerBatch = options.maxSpansPerBatch ?? DEFAULT_MAX_SPANS;
  }

  private prepareSpan(span: unknown, index: number): SpanInput {
    const validated = enrichSpanCost(validateSpan(span, index));
    // Allow cross-agent linking via an attribute too (OTel/instrumentations that
    // can only set attributes), not just the top-level field.
    if (!validated.parentTraceId) {
      const fromAttr = validated.attributes?.['lookspan.parent_trace_id'];
      if (typeof fromAttr === 'string' && fromAttr) validated.parentTraceId = fromAttr;
    }
    return this.redactOptions ? redactSpan(validated, this.redactOptions) : validated;
  }

  /**
   * Validate, normalize, redact, persist, and aggregate a batch of spans.
   *
   * Per-span validation failures do **not** throw: the offending span is
   * skipped and reported in the returned `errors`, while the rest are still
   * ingested. Only a structurally invalid payload (not `{ spans: [...] }`) or
   * an over-limit batch is rejected wholesale.
   *
   * @param rawPayload Raw, untrusted ingest body; expected shape
   *   `{ spans: SpanInput[], source?, sentAt? }`.
   * @returns `accepted` (persisted count), `rejected` (dropped count), and
   *   `errors` (`{ index, reason }[]`, omitted when none).
   * @throws If `rawPayload` is not an object with a `spans` array
   *   (`validatePayload`). Individual bad spans never throw.
   * @remarks Side effects: emits `trace.updated` per affected trace,
   *   `alert.triggered` per fired alert, and `span.ingested` per stored span on
   *   the in-process event bus (which drives the SSE stream).
   */
  ingest(rawPayload: unknown): IngestResponse {
    const payload = validatePayload(rawPayload);

    if (payload.spans.length > this.maxSpansPerBatch) {
      return {
        accepted: 0,
        rejected: payload.spans.length,
        errors: [
          {
            index: -1,
            reason: `batch of ${payload.spans.length} spans exceeds the limit of ${this.maxSpansPerBatch}; send smaller batches`,
          },
        ],
      };
    }

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
    //
    // Seed + insert run in ONE transaction so a crash mid-ingest can't leave an
    // orphaned placeholder trace with no spans, or commit placeholders without
    // their spans. better-sqlite3 turns the inner transactions into SAVEPOINTs.
    const inserted = this.db.transaction(() => {
      this.ensureTracePlaceholders(validSpans);
      return this.spans.insertMany(validSpans, receivedAt);
    })();

    const affectedTraces = new Set(inserted.map((s) => s.traceId));
    for (const traceId of affectedTraces) {
      const trace = recomputeTrace(this.db, traceId);
      if (!trace) continue;
      this.traces.upsert(trace);
      emit({ type: LookspanEventType.TraceUpdated, trace });

      if (this.alerts.enabled) {
        for (const alert of this.alerts.evaluate(trace, receivedAt)) {
          const stored = this.alertsRepo.insert(alert);
          emit({ type: LookspanEventType.AlertTriggered, alert: stored });
        }
      }
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
