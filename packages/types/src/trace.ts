import type { TokenUsage } from './cost.js';
import type { FrameworkName } from './framework.js';
import type { SpanStatus } from './span.js';

export interface Trace {
  traceId: string;
  rootName: string;
  framework: FrameworkName;
  agentId: string | null;
  sessionId: string | null;
  startedAt: string;
  endedAt: string | null;
  durationMs: number | null;
  status: SpanStatus;
  spanCount: number;
  errorCount: number;
  totalUsage: TokenUsage;
  costUsd: number;
  attributes: Record<string, unknown> | null;
}

export interface TraceListItem {
  traceId: string;
  rootName: string;
  framework: FrameworkName;
  agentId: string | null;
  startedAt: string;
  durationMs: number | null;
  status: SpanStatus;
  spanCount: number;
  costUsd: number;
}

export interface TraceWithSpans extends Trace {
  spans: import('./span.js').Span[];
}
