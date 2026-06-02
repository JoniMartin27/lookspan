import type { TokenUsage } from './cost.js';
import type { FrameworkName } from './framework.js';

export const SpanType = {
  AgentStep: 'agent_step',
  LlmCall: 'llm_call',
  ToolCall: 'tool_call',
  Retrieval: 'retrieval',
  Embedding: 'embedding',
  Error: 'error',
  Custom: 'custom',
} as const;

export type SpanType = (typeof SpanType)[keyof typeof SpanType];

export const SpanStatus = {
  Ok: 'ok',
  Error: 'error',
  Cancelled: 'cancelled',
} as const;

export type SpanStatus = (typeof SpanStatus)[keyof typeof SpanStatus];

export interface SpanInput {
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  type: SpanType;
  name: string;
  startedAt: string;
  endedAt: string | null;
  status: SpanStatus;
  framework: FrameworkName;
  agentId?: string | null;
  sessionId?: string | null;
  /** Trace that spawned this one (cross-agent handoff). Lets the session view
   *  render who delegated to whom across agents. */
  parentTraceId?: string | null;
  model?: string | null;
  provider?: string | null;
  input?: Record<string, unknown> | null;
  output?: string | null;
  error?: { code?: string; message: string } | null;
  usage?: TokenUsage | null;
  attributes?: Record<string, unknown> | null;
}

export interface Span extends SpanInput {
  durationMs: number | null;
  receivedAt: string;
}

export type LlmCallSpan = Span & {
  type: typeof SpanType.LlmCall;
  model: string;
  provider: string;
  usage: TokenUsage;
};

export type ToolCallSpan = Span & {
  type: typeof SpanType.ToolCall;
};
