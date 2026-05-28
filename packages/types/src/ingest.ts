import type { SpanInput } from './span.js';

export interface IngestPayload {
  spans: SpanInput[];
  source?: string;
  sentAt?: string;
}

export interface IngestResponse {
  accepted: number;
  rejected: number;
  errors?: { index: number; reason: string }[];
}
