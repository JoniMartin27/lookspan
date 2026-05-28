import type { IngestPayload, SpanInput } from '@lookspan/types';
import { SpanStatus, SpanType } from '@lookspan/types';

const VALID_TYPES = new Set<string>(Object.values(SpanType));
const VALID_STATUSES = new Set<string>(Object.values(SpanStatus));

export class IngestValidationError extends Error {
  constructor(
    message: string,
    public readonly index: number,
  ) {
    super(message);
    this.name = 'IngestValidationError';
  }
}

export function validateSpan(span: unknown, index: number): SpanInput {
  if (!span || typeof span !== 'object') {
    throw new IngestValidationError('span must be an object', index);
  }
  const s = span as Record<string, unknown>;

  for (const field of ['traceId', 'spanId', 'type', 'name', 'startedAt', 'status', 'framework']) {
    if (typeof s[field] !== 'string' || !s[field]) {
      throw new IngestValidationError(`span.${field} must be a non-empty string`, index);
    }
  }

  if (!VALID_TYPES.has(s.type as string)) {
    throw new IngestValidationError(`span.type "${String(s.type)}" is not recognized`, index);
  }
  if (!VALID_STATUSES.has(s.status as string)) {
    throw new IngestValidationError(`span.status "${String(s.status)}" is not recognized`, index);
  }
  if (s.parentSpanId !== null && s.parentSpanId !== undefined && typeof s.parentSpanId !== 'string') {
    throw new IngestValidationError('span.parentSpanId must be string or null', index);
  }

  return s as unknown as SpanInput;
}

export function validatePayload(payload: unknown): IngestPayload {
  if (!payload || typeof payload !== 'object') {
    throw new Error('payload must be an object');
  }
  const p = payload as Record<string, unknown>;
  if (!Array.isArray(p.spans)) {
    throw new Error('payload.spans must be an array');
  }
  return p as unknown as IngestPayload;
}
