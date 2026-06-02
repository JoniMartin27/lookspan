export interface Score {
  id?: number;
  traceId: string;
  /** Metric name, e.g. "correctness", "relevance", "passed". */
  name: string;
  /** Numeric value — 0/1 for pass-fail, or any scale you choose. */
  value: number;
  /** Optional free-text rationale (e.g. from an LLM judge). */
  comment?: string | null;
  /** Who produced the score: "human", "llm-judge", "assertion", etc. */
  source?: string | null;
  createdAt: string;
}

export type ScoreInput = Omit<Score, 'id' | 'createdAt'>;
