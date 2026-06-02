export interface LatencyPercentiles {
  p50: number;
  p95: number;
  p99: number;
}

export interface DayBucket {
  day: string;
  traces: number;
  costUsd: number;
}

export interface StatsSummary {
  totalTraces: number;
  errorTraces: number;
  errorRate: number;
  latencyMs: LatencyPercentiles | null;
  totalCostUsd: number;
  byDay: DayBucket[];
}
