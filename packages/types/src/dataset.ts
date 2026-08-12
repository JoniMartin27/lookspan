/**
 * A dataset is a named set of test inputs you can run against a model in batch
 * (an "experiment"), optionally scoring each output with an LLM judge. It closes
 * the eval loop: capture good/bad traces → collect them into a dataset → re-run
 * them against a candidate model → compare aggregate cost / latency / score.
 */
export interface Dataset {
  id: string;
  name: string;
  description: string | null;
  itemCount: number;
  runCount: number;
  createdAt: string;
}

export interface DatasetItemInput {
  /** The request to send (chat-completions/messages shape): `{ model?, messages, … }`. */
  input: Record<string, unknown>;
  /** Optional reference answer for eyeballing or future assertion-based scoring. */
  expected?: string | null;
}

export interface DatasetItem extends DatasetItemInput {
  id: number;
  datasetId: string;
  createdAt: string;
}

export type RunStatus = 'running' | 'done' | 'error';

export interface Run {
  id: number;
  datasetId: string;
  model: string;
  provider: string;
  status: RunStatus;
  itemCount: number;
  okCount: number;
  errorCount: number;
  totalCostUsd: number | null;
  avgScore: number | null;
  judgeMetric: string | null;
  createdAt: string;
}

export interface RunItem {
  id: number;
  runId: number;
  itemId: number;
  status: 'ok' | 'error';
  output: string | null;
  error: string | null;
  costUsd: number | null;
  durationMs: number | null;
  score: number | null;
  rationale: string | null;
  createdAt: string;
}

/**
 * How many items a single dataset run covers.
 *
 * A run is synchronous — it calls the provider once per item and answers on the
 * same request — so it has to stop somewhere. Shared with the dashboard so the
 * cap can be stated *before* the run: a 150-item dataset that reports
 * "100/100 ok" reads as a clean sweep, and the fifty items that never ran are
 * exactly the ones nobody would think to look for.
 */
export const MAX_DATASET_RUN_ITEMS = 100;

/** What a run over `itemCount` items will actually do. */
export interface RunCoverage {
  /** Items the run will cover. */
  willRun: number;
  /** Items the run will leave out. */
  skipped: number;
  /** True when the dataset is larger than a run can cover. */
  capped: boolean;
}

/** Resolve how much of a dataset a single run covers. */
export function runCoverage(itemCount: number, cap: number = MAX_DATASET_RUN_ITEMS): RunCoverage {
  const total = Number.isFinite(itemCount) && itemCount > 0 ? Math.floor(itemCount) : 0;
  const willRun = Math.min(total, cap);
  return { willRun, skipped: total - willRun, capped: total > cap };
}
