import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { api } from '../api/client.ts';

export default function SessionsView() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['sessions'],
    queryFn: api.listSessions,
    refetchInterval: 5_000,
  });

  if (isLoading) return <div className="p-8 text-neutral-400">Loading sessions…</div>;
  if (error) return <div className="p-8 text-red-400">Error: {(error as Error).message}</div>;

  const items = data?.items ?? [];

  return (
    <div className="p-6">
      <h1 className="mb-1 text-xl font-semibold">Sessions</h1>
      <p className="mb-4 text-sm text-neutral-500">
        A session groups the traces that ran together — useful to see a whole multi-agent run.
      </p>
      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-800 p-10 text-center text-sm text-neutral-400">
          No sessions yet. Spans with a <code className="font-mono">sessionId</code> are grouped
          here.
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-neutral-500">
            <tr>
              <th className="px-3 py-2">Session</th>
              <th className="px-3 py-2">Agents</th>
              <th className="px-3 py-2">Traces</th>
              <th className="px-3 py-2">Errors</th>
              <th className="px-3 py-2">Cost</th>
              <th className="px-3 py-2">Started</th>
              <th className="px-3 py-2">Span</th>
            </tr>
          </thead>
          <tbody>
            {items.map((s) => (
              <tr key={s.sessionId} className="border-t border-neutral-800 hover:bg-neutral-900">
                <td className="px-3 py-2">
                  <Link
                    href={`/sessions/${s.sessionId}`}
                    className="font-mono text-brand-500 hover:underline"
                  >
                    {s.sessionId.slice(0, 16)}
                  </Link>
                </td>
                <td className="px-3 py-2 text-neutral-300">{s.agentCount}</td>
                <td className="px-3 py-2 text-neutral-400">{s.traceCount}</td>
                <td
                  className={`px-3 py-2 ${s.errorCount > 0 ? 'text-red-400' : 'text-neutral-500'}`}
                >
                  {s.errorCount}
                </td>
                <td className="px-3 py-2 text-neutral-400">${s.totalCostUsd.toFixed(4)}</td>
                <td className="px-3 py-2 text-neutral-400">
                  {new Date(s.startedAt).toLocaleString()}
                </td>
                <td className="px-3 py-2 text-neutral-400">{formatSpan(s.startedAt, s.endedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function formatSpan(startedAt: string, endedAt: string | null): string {
  if (!endedAt) return '—';
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${(ms / 60_000).toFixed(1)} min`;
}
