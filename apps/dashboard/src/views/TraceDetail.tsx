import type { Score, Span } from '@lookspan/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Background, Controls, type Edge, type Node, ReactFlow } from '@xyflow/react';
import { useMemo, useState } from 'react';
import { useParams } from 'wouter';
import { api } from '../api/client.ts';

export default function TraceDetail() {
  const params = useParams<{ id: string }>();
  const traceId = params.id;

  const { data, isLoading, error } = useQuery({
    queryKey: ['trace', traceId],
    queryFn: () => api.getTrace(traceId),
    enabled: Boolean(traceId),
  });

  const { nodes, edges } = useMemo(() => buildGraph(data?.spans ?? []), [data?.spans]);

  if (isLoading) return <div className="p-8 text-neutral-400">Loading trace…</div>;
  if (error) return <div className="p-8 text-red-400">Error: {(error as Error).message}</div>;
  if (!data) return <div className="p-8 text-neutral-400">Not found.</div>;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-neutral-800 px-6 py-3">
        <h1 className="text-lg font-semibold">{data.trace.rootName}</h1>
        <p className="text-xs text-neutral-500">
          {data.trace.framework} · {data.trace.spanCount} spans · ${data.trace.costUsd.toFixed(4)}
        </p>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="flex-1">
          <ReactFlow nodes={nodes} edges={edges} fitView>
            <Background gap={16} size={1} />
            <Controls />
          </ReactFlow>
        </div>
        <ScoresPanel traceId={traceId} scores={data.scores ?? []} />
      </div>
    </div>
  );
}

function ScoresPanel({ traceId, scores }: { traceId: string; scores: Score[] }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [value, setValue] = useState('');

  const mutation = useMutation({
    mutationFn: () => api.addScore(traceId, { name, value: Number(value), source: 'human' }),
    onSuccess: () => {
      setName('');
      setValue('');
      qc.invalidateQueries({ queryKey: ['trace', traceId] });
    },
  });

  const canSubmit = name.trim() !== '' && value.trim() !== '' && Number.isFinite(Number(value));

  return (
    <aside className="w-72 shrink-0 overflow-auto border-l border-neutral-800 p-4">
      <h2 className="mb-3 text-sm font-medium text-neutral-300">Scores</h2>
      {scores.length === 0 ? (
        <p className="mb-4 text-xs text-neutral-500">No scores yet.</p>
      ) : (
        <ul className="mb-4 space-y-2">
          {scores.map((s) => (
            <li key={s.id} className="rounded border border-neutral-800 bg-neutral-900/50 p-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-neutral-300">{s.name}</span>
                <span className="font-mono text-neutral-100">{s.value}</span>
              </div>
              {s.comment && <p className="mt-1 text-xs text-neutral-500">{s.comment}</p>}
              {s.source && (
                <p className="mt-0.5 text-[10px] uppercase text-neutral-600">{s.source}</p>
              )}
            </li>
          ))}
        </ul>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) mutation.mutate();
        }}
        className="space-y-2"
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="metric (e.g. correctness)"
          className="w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-sm focus:border-brand-500 focus:outline-none"
        />
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="value (e.g. 1)"
          inputMode="decimal"
          className="w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-sm focus:border-brand-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={!canSubmit || mutation.isPending}
          className="w-full rounded bg-brand-600 px-2 py-1 text-sm font-medium text-white disabled:opacity-40"
        >
          {mutation.isPending ? 'Adding…' : 'Add score'}
        </button>
      </form>
    </aside>
  );
}

function buildGraph(spans: Span[]): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = spans.map((span, idx) => ({
    id: span.spanId,
    position: { x: idx * 220, y: depthOf(span, spans) * 100 },
    data: { label: span.name },
    style: {
      background: span.status === 'error' ? '#7f1d1d' : '#1f1f23',
      color: '#f5f5f5',
      border: '1px solid #3f3f46',
      borderRadius: 6,
      padding: 8,
      fontSize: 12,
    },
  }));

  const edges: Edge[] = spans
    .filter((s) => s.parentSpanId !== null)
    .map((s) => ({
      id: `${s.parentSpanId}-${s.spanId}`,
      source: s.parentSpanId as string,
      target: s.spanId,
      animated: s.status === 'ok',
    }));

  return { nodes, edges };
}

function depthOf(span: Span, all: Span[]): number {
  let depth = 0;
  let current: Span | undefined = span;
  while (current?.parentSpanId) {
    const parentId: string = current.parentSpanId;
    current = all.find((s) => s.spanId === parentId);
    depth++;
    if (depth > 50) break;
  }
  return depth;
}
