import type { CostBreakdown, Span, Trace, TraceListItem } from '@lookspan/types';

const API_BASE = '/api';

async function request<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    throw new Error(`request failed: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export interface TraceFilters {
  framework?: string;
  status?: string;
  sessionId?: string;
}

function toQuery(filters: TraceFilters): string {
  const params = new URLSearchParams();
  if (filters.framework) params.set('framework', filters.framework);
  if (filters.status) params.set('status', filters.status);
  if (filters.sessionId) params.set('sessionId', filters.sessionId);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export const api = {
  listTraces: (filters: TraceFilters = {}) =>
    request<{ items: TraceListItem[] }>(`/traces${toQuery(filters)}`),
  getTrace: (id: string) => request<{ trace: Trace; spans: Span[] }>(`/traces/${id}`),
  costsSummary: () => request<CostBreakdown>('/costs/summary'),
  health: () => request<{ ok: boolean; service: string; timestamp: string }>('/health'),
};
