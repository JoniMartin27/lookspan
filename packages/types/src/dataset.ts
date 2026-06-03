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
