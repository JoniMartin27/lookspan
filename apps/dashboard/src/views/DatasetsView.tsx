import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'wouter';
import { api } from '../api/client.ts';

export default function DatasetsView() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ['datasets'],
    queryFn: api.listDatasets,
  });
  const [name, setName] = useState('');

  const create = useMutation({
    mutationFn: () => api.createDataset({ name: name.trim() }),
    onSuccess: () => {
      setName('');
      qc.invalidateQueries({ queryKey: ['datasets'] });
    },
  });

  if (isLoading) return <div className="p-8 text-neutral-400">Loading datasets…</div>;
  if (error) return <div className="p-8 text-red-400">Error: {(error as Error).message}</div>;
  const items = data?.items ?? [];

  return (
    <div className="p-6">
      <h1 className="mb-1 text-xl font-semibold">Datasets</h1>
      <p className="mb-4 text-sm text-neutral-500">
        Collect prompts into a test set, then run them against a model and score each output — your
        eval loop, local-first.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) create.mutate();
        }}
        className="mb-6 flex items-center gap-2"
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New dataset name…"
          className="w-64 rounded border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={!name.trim() || create.isPending}
          className="rounded bg-brand-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
        >
          Create
        </button>
      </form>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-800 p-10 text-center text-sm text-neutral-400">
          No datasets yet. Create one above, then add prompts from a trace's{' '}
          <span className="font-mono">Replay &amp; judge</span> panel.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((d) => (
            <Link
              key={d.id}
              href={`/datasets/${d.id}`}
              className="rounded-lg border border-neutral-800 bg-neutral-900 p-4 hover:border-brand-500"
            >
              <div className="font-medium text-neutral-100">{d.name}</div>
              {d.description && (
                <div className="mt-0.5 text-xs text-neutral-500">{d.description}</div>
              )}
              <div className="mt-3 flex gap-4 text-xs text-neutral-400">
                <span>
                  <span className="font-mono text-neutral-200">{d.itemCount}</span> items
                </span>
                <span>
                  <span className="font-mono text-neutral-200">{d.runCount}</span> runs
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
