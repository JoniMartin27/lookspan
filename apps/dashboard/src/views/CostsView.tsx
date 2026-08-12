import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../api/client.ts';
import { CHART } from '../lib/chartTheme.ts';

export default function CostsView() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['costs', 'summary'],
    queryFn: api.costsSummary,
    refetchInterval: 10_000,
  });
  const { data: stats } = useQuery({
    queryKey: ['stats'],
    queryFn: api.stats,
    refetchInterval: 10_000,
  });
  const { data: scores } = useQuery({
    queryKey: ['scores', 'summary'],
    queryFn: api.scoresSummary,
    refetchInterval: 10_000,
  });

  if (isLoading) return <div className="p-8 text-neutral-400">Loading costs…</div>;
  if (error) return <div className="p-8 text-red-400">Error: {(error as Error).message}</div>;
  if (!data) return null;

  const byModel = Object.entries(data.byModel).map(([name, cost]) => ({ name, cost }));
  const byProvider = Object.entries(data.byProvider).map(([name, cost]) => ({ name, cost }));
  const byAgent = Object.entries(data.byAgent)
    .map(([name, cost]) => ({ name, cost }))
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 12);
  const reasoningByModel = Object.entries(data.reasoningByModel)
    .map(([name, cost]) => ({ name, cost }))
    .filter((d) => d.cost > 0)
    .sort((a, b) => b.cost - a.cost);
  const byDay = (stats?.byDay ?? []).map((d) => ({ name: d.day.slice(5), cost: d.costUsd }));

  return (
    <div className="space-y-4 p-4 sm:space-y-6 sm:p-6">
      <div>
        <h1 className="mb-1 text-xl font-semibold">Overview</h1>
        <p className="text-sm text-neutral-500">
          Total cost: <span className="font-mono text-neutral-200">${data.total.toFixed(4)}</span>
        </p>
        {data.reasoning > 0 && (
          <p className="mt-0.5 text-sm text-neutral-500">
            Of which reasoning tokens:{' '}
            <span className="font-mono text-neutral-200">${data.reasoning.toFixed(4)}</span>
            <span className="ml-1 text-xs text-neutral-600">
              ({((data.reasoning / data.total) * 100).toFixed(0)}% of total)
            </span>
          </p>
        )}
        {data.total === 0 && (
          <p className="mt-1 text-xs text-neutral-600">
            No billable cost yet — your models are priced at $0 or aren't in the pricing table. Add
            prices with{' '}
            <code className="rounded bg-neutral-800 px-1 py-0.5 font-mono text-neutral-400">
              --pricing
            </code>
            .
          </p>
        )}
      </div>

      {stats && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-5">
          <Stat label="Traces" value={stats.totalTraces.toLocaleString()} />
          <Stat
            label="Error rate"
            value={`${(stats.errorRate * 100).toFixed(1)}%`}
            tone={stats.errorRate > 0 ? 'bad' : 'good'}
          />
          <Stat label="Latency p50" value={stats.latencyMs ? `${stats.latencyMs.p50} ms` : '—'} />
          <Stat label="Latency p95" value={stats.latencyMs ? `${stats.latencyMs.p95} ms` : '—'} />
          <Stat label="Latency p99" value={stats.latencyMs ? `${stats.latencyMs.p99} ms` : '—'} />
        </div>
      )}

      {scores && scores.items.length > 0 && (
        <Card title="Eval scores (average)">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {scores.items.map((s) => (
              <div key={s.name}>
                <div className="text-[10px] uppercase tracking-wider text-neutral-500">
                  {s.name}
                </div>
                <div className="mt-0.5 font-mono text-xl text-neutral-100">
                  {s.avg.toFixed(2)}
                  <span className="ml-1 text-xs text-neutral-500">n={s.count}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {byDay.length > 0 && (
        <Card title="Cost per day">
          <Chart data={byDay} />
        </Card>
      )}
      <Card title="By model">
        <Chart data={byModel} />
      </Card>
      {reasoningByModel.length > 0 && (
        <Card title="Reasoning cost by model">
          <Chart data={reasoningByModel} />
        </Card>
      )}
      <Card title="By provider">
        <Chart data={byProvider} />
      </Card>
      <Card title="By agent (top 12)">
        <Chart data={byAgent} />
      </Card>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) {
  const valueColor =
    tone === 'bad' ? 'text-red-400' : tone === 'good' ? 'text-emerald-400' : 'text-neutral-100';
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-2 sm:p-4">
      <div className="truncate text-[10px] uppercase tracking-wider text-neutral-500 sm:text-xs">
        {label}
      </div>
      <div className={`mt-1 font-mono text-base sm:text-2xl ${valueColor}`}>{value}</div>
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
  if (data.every((d) => d.cost === 0)) {
    return <p className="text-xs text-neutral-500">No cost recorded for these (priced at $0).</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} />
        {/* `stroke` also colours the tick labels, so it has to track
            --color-neutral-500. The pre-Fervon #857567 left them at 4.31:1. */}
        <XAxis dataKey="name" stroke={CHART.axis} fontSize={12} />
        <YAxis stroke={CHART.axis} fontSize={12} />
        <Tooltip
          contentStyle={{
            background: CHART.tooltipBg,
            border: `1px solid ${CHART.tooltipBorder}`,
            fontSize: 12,
          }}
        />
        <Bar dataKey="cost" fill={CHART.bar} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
