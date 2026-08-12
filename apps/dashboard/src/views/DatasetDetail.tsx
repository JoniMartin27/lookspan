import type { Run, RunItem } from '@lookspan/types';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
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
    <div className="p-4 sm:p-6">
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
            className="rounded bg-brand-500 px-3 py-1 text-sm font-medium text-ink disabled:opacity-40"
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

      {runs.length >= 2 && <RunCompare runs={runs} />}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-neutral-300">Items ({items.length})</h2>
        <AddItemForm datasetId={id} />
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

/** Manually add a dataset item: paste a chat-completions/messages JSON `input`
 *  plus an optional reference answer. Complements seeding items from a trace. */
function AddItemForm({ datasetId }: { datasetId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [expected, setExpected] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const addM = useMutation({
    mutationFn: () => {
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(input);
      } catch {
        throw new Error('input must be valid JSON');
      }
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('input must be a JSON object, e.g. { "messages": [...] }');
      }
      return api.addDatasetItem(datasetId, {
        input: parsed,
        expected: expected.trim() || null,
      });
    },
    onSuccess: () => {
      setInput('');
      setExpected('');
      setErr(null);
      setOpen(false);
      qc.invalidateQueries({ queryKey: ['dataset', datasetId] });
    },
    onError: (e) => setErr((e as Error).message),
  });

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mb-2 rounded border border-neutral-800 px-2 py-1 text-xs text-neutral-400 hover:border-brand-500 hover:text-neutral-200"
      >
        + Add item manually
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (input.trim()) addM.mutate();
      }}
      className="mb-3 space-y-2 rounded-lg border border-neutral-800 bg-neutral-900 p-3"
    >
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder={'{ "messages": [{ "role": "user", "content": "…" }] }'}
        rows={3}
        className="w-full rounded border border-neutral-800 bg-neutral-950 px-2 py-1 font-mono text-[11px] focus:border-brand-500 focus:outline-none"
      />
      <input
        value={expected}
        onChange={(e) => setExpected(e.target.value)}
        placeholder="expected answer (optional)"
        className="w-full rounded border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs focus:border-brand-500 focus:outline-none"
      />
      {err && <p className="text-xs text-red-400">{err}</p>}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={!input.trim() || addM.isPending}
          className="rounded bg-brand-500 px-3 py-1 text-xs font-medium text-ink disabled:opacity-40"
        >
          {addM.isPending ? 'Adding…' : 'Add item'}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setErr(null);
          }}
          className="text-xs text-neutral-500 hover:text-neutral-300"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function deltaPct(a: number | null, b: number | null): string | null {
  if (a === null || b === null || a === 0) return null;
  const pct = ((b - a) / Math.abs(a)) * 100;
  if (!Number.isFinite(pct) || Math.abs(pct) < 0.5) return null;
  return `${pct > 0 ? '+' : ''}${pct.toFixed(0)}%`;
}

function num(v: number | null, suffix = '', digits = 2): string {
  return v === null ? '—' : `${v.toFixed(digits)}${suffix}`;
}

/** Pick two runs and diff them: model A vs B, Δ score / cost / latency per item. */
function RunCompare({ runs }: { runs: Run[] }) {
  const [aId, setAId] = useState<number>(runs[1]?.id ?? 0);
  const [bId, setBId] = useState<number>(runs[0]?.id ?? 0);

  const [a, b] = useQueries({
    queries: [aId, bId].map((id) => ({
      queryKey: ['run', id],
      queryFn: () => api.getRun(id),
      enabled: id > 0,
    })),
  });

  const runA = a?.data?.run;
  const runB = b?.data?.run;
  const itemsA = a?.data?.items ?? [];
  const itemsB = b?.data?.items ?? [];

  // align by dataset item id
  const byItem = new Map<number, { a?: RunItem; b?: RunItem }>();
  for (const it of itemsA) byItem.set(it.itemId, { ...byItem.get(it.itemId), a: it });
  for (const it of itemsB) byItem.set(it.itemId, { ...byItem.get(it.itemId), b: it });
  const rows = [...byItem.entries()].sort((x, y) => x[0] - y[0]);

  const sel =
    'rounded border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs focus:border-brand-500 focus:outline-none';

  return (
    <section className="mb-6">
      <h2 className="mb-2 text-sm font-semibold text-neutral-300">Compare runs</h2>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-neutral-500">A</span>
        <select value={aId} onChange={(e) => setAId(Number(e.target.value))} className={sel}>
          {runs.map((r) => (
            <option key={r.id} value={r.id}>
              #{r.id} · {r.model}
            </option>
          ))}
        </select>
        <span className="text-neutral-500">vs B</span>
        <select value={bId} onChange={(e) => setBId(Number(e.target.value))} className={sel}>
          {runs.map((r) => (
            <option key={r.id} value={r.id}>
              #{r.id} · {r.model}
            </option>
          ))}
        </select>
      </div>

      {runA && runB && (
        <>
          <div className="mb-2 grid grid-cols-3 gap-2 text-xs">
            <CompareTile
              label={runA.judgeMetric ?? runB.judgeMetric ?? 'avg score'}
              a={num(runA.avgScore, '', 2)}
              b={num(runB.avgScore, '', 2)}
              delta={deltaPct(runA.avgScore, runB.avgScore)}
              betterUp
            />
            <CompareTile
              label="total cost"
              a={num(runA.totalCostUsd, '', 4)}
              b={num(runB.totalCostUsd, '', 4)}
              delta={deltaPct(runA.totalCostUsd, runB.totalCostUsd)}
            />
            <CompareTile
              label="ok / total"
              a={`${runA.okCount}/${runA.itemCount}`}
              b={`${runB.okCount}/${runB.itemCount}`}
              delta={null}
            />
          </div>

          <div className="overflow-auto rounded border border-neutral-800">
            <table className="w-full text-xs">
              <thead className="text-left text-[10px] uppercase tracking-wider text-neutral-500">
                <tr>
                  <th className="px-2 py-1.5">#</th>
                  <th className="px-2 py-1.5">A score</th>
                  <th className="px-2 py-1.5">B score</th>
                  <th className="px-2 py-1.5">Δ score</th>
                  <th className="px-2 py-1.5">A cost</th>
                  <th className="px-2 py-1.5">B cost</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(([itemId, { a: ia, b: ib }]) => {
                  const ds = ia?.score != null && ib?.score != null ? ib.score - ia.score : null;
                  return (
                    <tr key={itemId} className="border-t border-neutral-800">
                      <td className="px-2 py-1.5 text-neutral-500">{itemId}</td>
                      <td className="px-2 py-1.5 font-mono text-neutral-300">
                        {num(ia?.score ?? null)}
                      </td>
                      <td className="px-2 py-1.5 font-mono text-neutral-300">
                        {num(ib?.score ?? null)}
                      </td>
                      <td
                        className={`px-2 py-1.5 font-mono ${
                          ds === null
                            ? 'text-neutral-600'
                            : ds > 0
                              ? 'text-emerald-400'
                              : ds < 0
                                ? 'text-red-400'
                                : 'text-neutral-500'
                        }`}
                      >
                        {ds === null ? '—' : `${ds > 0 ? '+' : ''}${ds.toFixed(2)}`}
                      </td>
                      <td className="px-2 py-1.5 font-mono text-neutral-500">
                        {num(ia?.costUsd ?? null, '', 4)}
                      </td>
                      <td className="px-2 py-1.5 font-mono text-neutral-500">
                        {num(ib?.costUsd ?? null, '', 4)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

function CompareTile({
  label,
  a,
  b,
  delta,
  betterUp,
}: {
  label: string;
  a: string;
  b: string;
  delta: string | null;
  betterUp?: boolean;
}) {
  const up = delta?.startsWith('+');
  const good = betterUp ? up : up === false;
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-neutral-500">{label}</div>
      <div className="mt-0.5 flex items-baseline gap-1.5">
        <span className="font-mono text-neutral-400">{a}</span>
        <span className="text-neutral-600">→</span>
        <span className="font-mono text-neutral-100">{b}</span>
        {delta && (
          <span className={`text-[10px] ${good ? 'text-emerald-400' : 'text-amber-400'}`}>
            {delta}
          </span>
        )}
      </div>
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
