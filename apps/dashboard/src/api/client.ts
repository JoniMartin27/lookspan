import type {
  Alert,
  CostBreakdown,
  Dataset,
  DatasetItem,
  Replay,
  Run,
  RunItem,
  Score,
  ScoreInput,
  SessionSummary,
  Span,
  StatsSummary,
  Trace,
  TraceListItem,
} from '@lookspan/types';

const API_BASE = '/api';

async function errorFrom(res: Response): Promise<Error> {
  const body = (await res.json().catch(() => null)) as { error?: string; detail?: string } | null;
  const msg = body?.detail || body?.error || `request failed: ${res.status} ${res.statusText}`;
  return new Error(msg);
}

async function request<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw await errorFrom(res);
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await errorFrom(res);
  return res.json() as Promise<T>;
}

export interface TraceFilters {
  framework?: string;
  status?: string;
  sessionId?: string;
  cursor?: string;
  limit?: number;
}

function toQuery(filters: TraceFilters): string {
  const params = new URLSearchParams();
  if (filters.framework) params.set('framework', filters.framework);
  if (filters.status) params.set('status', filters.status);
  if (filters.sessionId) params.set('sessionId', filters.sessionId);
  if (filters.cursor) params.set('cursor', filters.cursor);
  if (filters.limit) params.set('limit', String(filters.limit));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export const api = {
  listTraces: (filters: TraceFilters = {}) =>
    request<{ items: TraceListItem[] }>(`/traces${toQuery(filters)}`),
  getTrace: (id: string) =>
    request<{ trace: Trace; spans: Span[]; scores: Score[] }>(`/traces/${id}`),
  addScore: (id: string, score: Omit<ScoreInput, 'traceId'>) =>
    post<{ score: Score }>(`/traces/${id}/scores`, score),
  listReplays: (id: string) => request<{ items: Replay[] }>(`/traces/${id}/replays`),
  replay: (id: string, body: { model?: string; provider?: string; spanId?: string } = {}) =>
    post<{ replay: Replay }>(`/traces/${id}/replay`, body),
  judge: (id: string, body: { metric?: string; model?: string; provider?: string } = {}) =>
    post<{ score: Score; judge: { provider: string; model: string } }>(`/traces/${id}/judge`, body),
  costsSummary: () => request<CostBreakdown>('/costs/summary'),
  stats: () => request<StatsSummary>('/stats'),
  listAlerts: () => request<{ items: Alert[] }>('/alerts'),
  scoresSummary: () =>
    request<{ items: { name: string; avg: number; count: number }[] }>('/scores/summary'),
  listTools: () => request<{ items: Span[] }>('/tools'),
  listDatasets: () => request<{ items: Dataset[] }>('/datasets'),
  createDataset: (body: { name: string; description?: string }) =>
    post<{ dataset: Dataset }>('/datasets', body),
  getDataset: (id: string) =>
    request<{ dataset: Dataset; items: DatasetItem[]; runs: Run[] }>(`/datasets/${id}`),
  addDatasetItemFromTrace: (id: string, traceId: string) =>
    post<{ item: DatasetItem }>(`/datasets/${id}/items/from-trace`, { traceId }),
  addDatasetItem: (
    id: string,
    body: { input: Record<string, unknown>; expected?: string | null },
  ) => post<{ items: DatasetItem[] }>(`/datasets/${id}/items`, body),
  runDataset: (
    id: string,
    body: { model: string; provider?: string; judge?: boolean; metric?: string },
  ) => post<{ run: Run; items: RunItem[]; truncated: number }>(`/datasets/${id}/run`, body),
  getRun: (runId: number) => request<{ run: Run; items: RunItem[] }>(`/runs/${runId}`),
  listSessions: () => request<{ items: SessionSummary[] }>('/sessions'),
  getSession: (id: string) =>
    request<{ session: SessionSummary; traces: TraceListItem[] }>(`/sessions/${id}`),
  health: () => request<{ ok: boolean; service: string; timestamp: string }>('/health'),
};
