import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../api/client.ts';

export default function CostsView() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['costs', 'summary'],
    queryFn: api.costsSummary,
    refetchInterval: 10_000,
  });

  if (isLoading) return <div className="p-8 text-neutral-400">Loading costs…</div>;
  if (error) return <div className="p-8 text-red-400">Error: {(error as Error).message}</div>;
  if (!data) return null;

  const byModel = Object.entries(data.byModel).map(([name, cost]) => ({ name, cost }));
  const byProvider = Object.entries(data.byProvider).map(([name, cost]) => ({ name, cost }));

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="mb-1 text-xl font-semibold">Costs</h1>
        <p className="text-sm text-neutral-500">
          Total: <span className="font-mono text-neutral-200">${data.total.toFixed(4)}</span>
        </p>
      </div>

      <Card title="By model">
        <Chart data={byModel} />
      </Card>
      <Card title="By provider">
        <Chart data={byProvider} />
      </Card>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
      <h2 className="mb-3 text-sm font-medium text-neutral-300">{title}</h2>
      {children}
    </div>
  );
}

function Chart({ data }: { data: { name: string; cost: number }[] }) {
  if (data.length === 0) {
    return <p className="text-xs text-neutral-500">No data yet.</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
        <XAxis dataKey="name" stroke="#71717a" fontSize={12} />
        <YAxis stroke="#71717a" fontSize={12} />
        <Tooltip
          contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', fontSize: 12 }}
        />
        <Bar dataKey="cost" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
