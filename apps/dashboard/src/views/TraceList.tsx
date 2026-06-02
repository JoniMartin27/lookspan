import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { api } from '../api/client.ts';
import { agentColor } from '../lib/agentColor.ts';

const FRAMEWORKS = ['mcp', 'langgraph', 'crewai', 'agent-os', 'openai-agents', 'otlp', 'custom'];
const STATUSES = ['ok', 'error', 'cancelled'];

export default function TraceList() {
  const [framework, setFramework] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['traces', framework, status],
    queryFn: () =>
      api.listTraces({ framework: framework || undefined, status: status || undefined }),
    refetchInterval: 5_000,
  });

  const allItems = data?.items ?? [];
  const items = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? allItems.filter((t) => t.rootName.toLowerCase().includes(q)) : allItems;
  }, [allItems, search]);

  return (
    <div className="p-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-xl font-semibold">Recent traces</h1>
        <input
          type="search"
          placeholder="Search name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-sm placeholder:text-neutral-600 focus:border-brand-500 focus:outline-none"
        />
        <Select
          value={framework}
          onChange={setFramework}
          placeholder="All frameworks"
          options={FRAMEWORKS}
        />
        <Select value={status} onChange={setStatus} placeholder="All statuses" options={STATUSES} />
      </div>

      {isLoading ? (
        <div className="py-8 text-neutral-400">Loading traces…</div>
      ) : error ? (
        <div className="py-8 text-red-400">Error: {(error as Error).message}</div>
      ) : items.length === 0 ? (
        <EmptyState filtered={allItems.length > 0} />
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-neutral-500">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Framework</th>
              <th className="px-3 py-2">Agent</th>
              <th className="px-3 py-2">Started</th>
              <th className="px-3 py-2">Duration</th>
              <th className="px-3 py-2">Spans</th>
              <th className="px-3 py-2">Cost</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((t) => (
              <tr key={t.traceId} className="border-t border-neutral-800 hover:bg-neutral-900">
                <td className="px-3 py-2">
                  <Link href={`/traces/${t.traceId}`} className="text-brand-500 hover:underline">
                    {t.rootName}
                  </Link>
                </td>
                <td className="px-3 py-2 text-neutral-400">{t.framework}</td>
                <td className="px-3 py-2 text-neutral-400">
                  {t.agentId ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="inline-block size-2 rounded-full"
                        style={{ background: agentColor(t.agentId) }}
                      />
                      {t.agentId}
                    </span>
                  ) : (
                    <span className="text-neutral-600">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-neutral-400">
                  {new Date(t.startedAt).toLocaleTimeString()}
                </td>
                <td className="px-3 py-2 text-neutral-400">
                  {t.durationMs !== null ? `${t.durationMs} ms` : '—'}
                </td>
                <td className="px-3 py-2 text-neutral-400">{t.spanCount}</td>
                <td className="px-3 py-2 text-neutral-400">${t.costUsd.toFixed(4)}</td>
                <td className="px-3 py-2">
                  <StatusBadge status={t.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Select({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: string[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none"
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

function EmptyState({ filtered }: { filtered: boolean }) {
  if (filtered) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-800 p-10 text-center text-neutral-400">
        <p className="text-sm">No traces match the current filters.</p>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-dashed border-neutral-800 p-10 text-center text-neutral-400">
      <p className="mb-2 text-base font-medium text-neutral-200">No traces yet</p>
      <p className="text-sm">
        Head to{' '}
        <Link href="/connect" className="text-brand-500 hover:underline">
          Connect
        </Link>{' '}
        to wire up your agent in a couple of lines.
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles =
    status === 'ok'
      ? 'bg-emerald-500/10 text-emerald-400'
      : status === 'error'
        ? 'bg-red-500/10 text-red-400'
        : 'bg-neutral-700/30 text-neutral-400';
  return <span className={`rounded px-2 py-0.5 text-xs font-medium ${styles}`}>{status}</span>;
}
