export interface SessionSummary {
  sessionId: string;
  traceCount: number;
  agentCount: number;
  errorCount: number;
  totalCostUsd: number;
  startedAt: string;
  endedAt: string | null;
}
