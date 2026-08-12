import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'wouter';
import { api } from '../api/client.ts';

export default function RunDetail() {
  const { id = '' } = useParams<{ id: string }>();
  const runId = Number(id);
  const { data, isLoading, error } = useQuery({
    queryKey: ['run', runId],
    queryFn: () => api.getRun(runId),
    enabled: Number.isFinite(runId),
  });

  if (isLoading) return <div className="p-8 text-neutral-400">Loading run…</div>;
  if (error) return <div className="p-8 text-red-400">Error: {(error as Error).message}</div>;
  if (!data) return <div className="p-8 text-neutral-400">Not found.</div>;

  const { run, items } = data;

  return (
    <div className="p-6">
      <Link href={`/datasets/${run.datasetId}`} className="text-sm text-brand-500 hover:underline">
        ← Dataset
      </Link>
      <h1 className="mt-1 text-xl font-semibold">
        Run #{run.id} · <span className="font-mono text-base">{run.model}</span>
      </h1>
      <p className="mb-4 text-sm text-neutral-500">
        {run.okCount}/{run.itemCount} ok · {run.errorCount} errors
        {run.totalCostUsd !== null ? ` · $${run.totalCostUsd.toFixed(4)}` : ''}
        {run.avgScore !== null
          ? ` · avg ${run.judgeMetric ?? 'score'} ${run.avgScore.toFixed(2)}`
          : ''}
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-neutral-500">
            <tr>
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">Status</th>
              {run.judgeMetric && <th className="px-3 py-2">{run.judgeMetric}</th>}
              <th className="px-3 py-2">Cost</th>
              <th className="px-3 py-2">Latency</th>
              <th className="px-3 py-2">Output</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={it.id} className="border-t border-neutral-800 align-top">
                <td className="px-3 py-2 text-neutral-500">{i + 1}</td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                      it.status === 'error'
                        ? 'bg-red-500/10 text-red-400'
                        : 'bg-emerald-500/10 text-emerald-400'
                    }`}
                  >
                    {it.status}
                  </span>
                </td>
                {run.judgeMetric && (
                  <td className="px-3 py-2 font-mono text-neutral-200">
                    {it.score !== null ? it.score.toFixed(2) : '—'}
                  </td>
                )}
                <td className="px-3 py-2 text-neutral-400">
                  {it.costUsd !== null ? `$${it.costUsd.toFixed(4)}` : '—'}
                </td>
                <td className="px-3 py-2 text-neutral-400">
                  {it.durationMs !== null ? `${it.durationMs} ms` : '—'}
                </td>
                <td className="max-w-md px-3 py-2">
                  {it.status === 'error' ? (
                    <span className="text-red-400">{it.error}</span>
                  ) : (
                    <div>
                      <pre className="max-h-24 overflow-auto whitespace-pre-wrap font-mono text-[11px] text-neutral-300">
                        {it.output}
                      </pre>
                      {it.rationale && (
                        <div className="mt-1 text-[10px] italic text-neutral-500">
                          {it.rationale}
                        </div>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
