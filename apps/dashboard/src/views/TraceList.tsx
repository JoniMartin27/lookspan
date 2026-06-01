import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { api } from '../api/client.ts';

export default function TraceList() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['traces'],
    queryFn: api.listTraces,
    refetchInterval: 5_000,
  });

  if (isLoading) {
    return <div className="p-8 text-neutral-400">Loading traces…</div>;
  }
  if (error) {
    return <div className="p-8 text-red-400">Error: {(error as Error).message}</div>;
  }

  const items = data?.items ?? [];

  return (
    <div className="p-6">
      <h1 className="mb-4 text-xl font-semibold">Recent traces</h1>
      {items.length === 0 ? (
        <EmptyState />
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-neutral-500">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Framework</th>
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

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-neutral-800 p-10 text-center text-neutral-400">
      <p className="mb-2 text-base font-medium text-neutral-200">No traces yet</p>
      <p className="text-sm">
        Send your first span via{' '}
        <code className="rounded bg-neutral-800 px-1.5 py-0.5 font-mono text-xs">
          POST /api/ingest
        </code>{' '}
        or wire up the MCP / LangGraph adapter.
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
