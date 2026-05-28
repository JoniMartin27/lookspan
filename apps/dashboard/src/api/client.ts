import type {
  CostBreakdown,
  Span,
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

export const api = {
  listTraces: () => request<{ items: TraceListItem[] }>('/traces'),
  getTrace: (id: string) => request<{ trace: Trace; spans: Span[] }>(`/traces/${id}`),
  costsSummary: () => request<CostBreakdown>('/costs/summary'),
  health: () => request<{ ok: boolean; service: string; timestamp: string }>('/health'),
};
