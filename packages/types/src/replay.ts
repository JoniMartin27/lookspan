/**
 * A replay re-runs the prompt captured on a trace's LLM span against a model
 * (the same one, or a different one) and stores the result next to a snapshot
 * of the original, so the dashboard can diff cost / latency / output.
 */
export interface ReplayInput {
  traceId: string;
  /** The original LLM span that was replayed (null if inferred from the trace). */
  spanId: string | null;
  provider: string;
  originalModel: string | null;
  replayModel: string;
  status: 'ok' | 'error';
  output: string | null;
  error: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
  durationMs: number | null;
  /** Snapshot of the original span, captured at replay time for side-by-side diff. */
  originalOutput: string | null;
  originalCostUsd: number | null;
  originalDurationMs: number | null;
}

export interface Replay extends ReplayInput {
  id: number;
  createdAt: string;
}
