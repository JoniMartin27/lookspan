import type { Run } from '@lookspan/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'wouter';
import { api } from '../api/client.ts';

export default function DatasetDetail() {
  const { id = '' } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ['dataset', id],
    queryFn: () => api.getDataset(id),
    enabled: Boolean(id),
  });

  const [model, setModel] = useState('');
  const [judge, setJudge] = useState(true);
  const [metric, setMetric] = useState('quality');
  const [err, setErr] = useState<string | null>(null);

  const runM = useMutation({
    mutationFn: () =>
      api.runDataset(id, { model: model.trim(), judge, metric: metric.trim() || 'quality' }),
    onSuccess: () => {
      setErr(null);
      qc.invalidateQueries({ queryKey: ['dataset', id] });
    },
    onError: (e) => setErr((e as Error).message),
  });

  if (isLoading) return <div className="p-8 text-neutral-400">Loading dataset…</div>;
  if (error) return <div className="p-8 text-red-400">Error: {(error as Error).message}</div>;
  if (!data) return <div className="p-8 text-neutral-400">Not found.</div>;

  const { dataset, items, runs } = data;

  return (
    <div className="p-6">
      <div className="mb-1 flex items-center gap-2">
        <Link href="/datasets" className="text-sm text-brand-500 hover:underline">
          ← Datasets
        </Link>
      </div>
      <h1 className="text-xl font-semibold">{dataset.name}</h1>
      <p className="mb-4 text-sm text-neutral-500">
        {dataset.itemCount} items · {dataset.runCount} runs
      </p>

      <section className="mb-6 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
        <div className="mb-2 text-sm font-medium text-neutral-200">Run an experiment</div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (model.trim()) runM.mutate();
          }}
          className="flex flex-wrap items-center gap-2"
        >
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="model (e.g. gpt-4o-mini)"
            className="w-56 rounded border border-neutral-800 bg-neutral-950 px-2 py-1 text-sm focus:border-brand-500 focus:outline-none"
          />
          <label className="flex items-center gap-1.5 text-xs text-neutral-300">
            <input type="checkbox" checked={judge} onChange={(e) => setJudge(e.target.checked)} />
            judge
          </label>
          {judge && (
            <input
              value={metric}
              onChange={(e) => setMetric(e.target.value)}
              placeholder="metric"
              className="w-28 rounded border border-neutral-800 bg-neutral-950 px-2 py-1 text-sm focus:border-brand-500 focus:outline-none"
            />
          )}
          <button
            type="submit"
            disabled={!model.trim() || runM.isPending || items.length === 0}
            className="rounded bg-brand-600 px-3 py-1 text-sm font-medium text-white disabled:opacity-40"
          >
            {runM.isPending ? `Running ${items.length} items…` : 'Run'}
          </button>
        </form>
        {err && <p className="mt-2 text-xs text-red-400">{err}</p>}
        <p className="mt-1 text-[11px] text-neutral-600">
          Needs a provider key on the server. Runs up to 100 items synchronously.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold text-neutral-300">Runs</h2>
        {runs.length === 0 ? (
          <p className="text-sm text-neutral-500">No runs yet.</p>
        ) : (
          <div className="space-y-1.5">
            {runs.map((r) => (
              <RunRow key={r.id} run={r} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-neutral-300">Items ({items.length})</h2>
        {items.length === 0 ? (
          <p className="text-sm text-neutral-500">
            No items. Add prompts from a trace's{' '}
            <span className="font-mono">Replay &amp; judge</span> panel.
          </p>
        ) : (
          <div className="space-y-1.5">
            {items.map((it) => (
              <div
                key={it.id}
                className="rounded border border-neutral-800 bg-neutral-900 p-2 text-xs"
              >
                <pre className="max-h-20 overflow-auto font-mono text-[10px] text-neutral-300">
                  {JSON.stringify(it.input)}
                </pre>
                {it.expected && (
                  <div className="mt-1 text-[10px] text-neutral-500">
                    expected: <span className="text-neutral-300">{it.expected}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function RunRow({ run }: { run: Run }) {
  return (
    <Link
      href={`/runs/${run.id}`}
      className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded border border-neutral-800 bg-neutral-900 p-2 text-xs hover:border-brand-500"
    >
      <span className="font-mono text-neutral-200">{run.model}</span>
      <span
        className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
          run.status === 'error'
            ? 'bg-red-500/10 text-red-400'
            : run.status === 'running'
              ? 'bg-amber-500/10 text-amber-400'
              : 'bg-emerald-500/10 text-emerald-400'
        }`}
      >
        {run.status}
      </span>
      <span className="text-neutral-400">
        {run.okCount}/{run.itemCount} ok
      </span>
      {run.avgScore !== null && (
        <span className="text-neutral-400">
          avg {run.judgeMetric ?? 'score'}:{' '}
          <span className="font-mono text-neutral-200">{run.avgScore.toFixed(2)}</span>
        </span>
      )}
      {run.totalCostUsd !== null && (
        <span className="text-neutral-400">${run.totalCostUsd.toFixed(4)}</span>
      )}
      <span className="ml-auto text-neutral-600">{new Date(run.createdAt).toLocaleString()}</span>
    </Link>
  );
}
