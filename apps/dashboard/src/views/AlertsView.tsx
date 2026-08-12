import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { api } from '../api/client.ts';
import { EmptyState } from '../components/EmptyState.tsx';

export default function AlertsView() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['alerts'],
    queryFn: api.listAlerts,
    refetchInterval: 5_000,
  });

  if (isLoading) return <div className="p-8 text-neutral-400">Loading alerts…</div>;
  if (error) return <div className="p-8 text-red-400">Error: {(error as Error).message}</div>;

  const items = data?.items ?? [];

  return (
    <div className="p-4 sm:p-6">
      <h1 className="mb-4 text-xl font-semibold">Alerts</h1>
      {items.length === 0 ? (
        <EmptyState title="No alerts">
          Start the server with alert rules, e.g.{' '}
          <code className="rounded bg-neutral-800 px-1.5 py-0.5 font-mono text-xs">
            npx lookspan --alert-error --alert-cost 0.50
          </code>
        </EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-neutral-500">
              <tr>
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">Condition</th>
                <th className="px-3 py-2">Message</th>
                <th className="px-3 py-2">Trace</th>
              </tr>
            </thead>
            <tbody>
              {items.map((a) => (
                <tr key={a.id} className="border-t border-neutral-800 hover:bg-neutral-900">
                  <td className="px-3 py-2 text-neutral-400">
                    {new Date(a.createdAt).toLocaleString()}
                  </td>
                  <td className="px-3 py-2">
                    <span className="rounded bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-400">
                      {a.condition}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-neutral-200">{a.message}</td>
                  <td className="px-3 py-2">
                    <Link href={`/traces/${a.traceId}`} className="text-brand-500 hover:underline">
                      {a.traceId}
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
