import type {
  Alert,
  CostBreakdown,
  Score,
  ScoreInput,
  SessionSummary,
  Span,
  StatsSummary,
  Trace,
  TraceListItem,
} from '@lookspan/types';

const API_BASE = '/api';

async function request<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    throw new Error(`request failed: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`request failed: ${res.status} ${res.statusText}`);
  }
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
  costsSummary: () => request<CostBreakdown>('/costs/summary'),
  stats: () => request<StatsSummary>('/stats'),
  listAlerts: () => request<{ items: Alert[] }>('/alerts'),
  scoresSummary: () =>
    request<{ items: { name: string; avg: number; count: number }[] }>('/scores/summary'),
  listSessions: () => request<{ items: SessionSummary[] }>('/sessions'),
  getSession: (id: string) =>
    request<{ session: SessionSummary; traces: TraceListItem[] }>(`/sessions/${id}`),
  health: () => request<{ ok: boolean; service: string; timestamp: string }>('/health'),
};
