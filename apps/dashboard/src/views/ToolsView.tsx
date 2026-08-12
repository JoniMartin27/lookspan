import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { api } from '../api/client.ts';
import { EmptyState } from '../components/EmptyState.tsx';
import { agentColor } from '../lib/agentColor.ts';
import { statusBadgeClass } from '../lib/status.ts';

export default function ToolsView() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['tools'],
    queryFn: api.listTools,
    refetchInterval: 5_000,
  });

  if (isLoading) return <div className="p-8 text-neutral-400">Loading tool calls…</div>;
  if (error) return <div className="p-8 text-red-400">Error: {(error as Error).message}</div>;

  const items = data?.items ?? [];

  return (
    <div className="p-6">
      <h1 className="mb-1 text-xl font-semibold">Tools</h1>
      <p className="mb-4 text-sm text-neutral-500">
        Recent tool calls across all traces — your agents' MCP &amp; framework tool usage at a
        glance.
      </p>
      {items.length === 0 ? (
        <EmptyState>
          No tool calls yet. Spans of type <code className="font-mono">tool_call</code> show up
          here.
        </EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-neutral-500">
              <tr>
                <th className="px-3 py-2">Tool</th>
                <th className="px-3 py-2">Framework</th>
                <th className="px-3 py-2">Agent</th>
                <th className="px-3 py-2">Duration</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">Trace</th>
              </tr>
            </thead>
            <tbody>
              {items.map((s) => (
                <tr key={s.spanId} className="border-t border-neutral-800 hover:bg-neutral-900">
                  <td className="px-3 py-2 text-neutral-200">{s.name}</td>
                  <td className="px-3 py-2 text-neutral-400">{s.framework}</td>
                  <td className="px-3 py-2 text-neutral-400">
                    {s.agentId ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className="inline-block size-2 rounded-full"
                          style={{ background: agentColor(s.agentId) }}
                        />
                        {s.agentId}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-3 py-2 text-neutral-400">
                    {s.durationMs !== null ? `${s.durationMs} ms` : '—'}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${statusBadgeClass(s.status)}`}
                    >
                      {s.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-neutral-500">
                    {new Date(s.startedAt).toLocaleTimeString()}
                  </td>
                  <td className="px-3 py-2">
                    <Link href={`/traces/${s.traceId}`} className="text-brand-500 hover:underline">
                      open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
