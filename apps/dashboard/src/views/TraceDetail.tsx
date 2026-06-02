import type { Score, Span } from '@lookspan/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Background, Controls, type Edge, type Node, Position, ReactFlow } from '@xyflow/react';
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
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-neutral-800 px-6 py-3">
        <div className="mr-auto">
          <h1 className="text-lg font-semibold">{data.trace.rootName}</h1>
          <p className="text-xs text-neutral-500">
            {data.trace.framework} · {data.trace.spanCount} spans · ${data.trace.costUsd.toFixed(4)}
          </p>
        </div>
        <Scores traceId={traceId} scores={data.scores ?? []} />
      </div>
      <div className="min-h-0 flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          fitView
          minZoom={0.1}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={16} size={1} color="#27272a" />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </div>
  );
}

/** Compact scores UI in the header: existing scores as chips + a small inline add form. */
function Scores({ traceId, scores }: { traceId: string; scores: Score[] }) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [value, setValue] = useState('');

  const mutation = useMutation({
    mutationFn: () => api.addScore(traceId, { name, value: Number(value), source: 'human' }),
    onSuccess: () => {
      setName('');
      setValue('');
      setAdding(false);
      qc.invalidateQueries({ queryKey: ['trace', traceId] });
    },
  });

  const canSubmit = name.trim() !== '' && value.trim() !== '' && Number.isFinite(Number(value));

  return (
    <div className="flex items-center gap-2">
      {scores.map((s) => (
        <span
          key={s.id}
          title={s.comment ?? s.source ?? ''}
          className="rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300"
        >
          {s.name} <span className="font-mono text-neutral-100">{s.value}</span>
        </span>
      ))}
      {adding ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit) mutation.mutate();
          }}
          className="flex items-center gap-1"
        >
          <input
            // biome-ignore lint/a11y/noAutofocus: focus the field the user just opened
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="metric"
            className="w-28 rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs focus:border-brand-500 focus:outline-none"
          />
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="value"
            inputMode="decimal"
            className="w-16 rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs focus:border-brand-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!canSubmit || mutation.isPending}
            className="rounded bg-brand-600 px-2 py-1 text-xs font-medium text-white disabled:opacity-40"
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => setAdding(false)}
            className="px-1 text-xs text-neutral-500 hover:text-neutral-300"
          >
            ✕
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="rounded border border-neutral-800 px-2 py-0.5 text-xs text-neutral-400 hover:border-brand-500 hover:text-neutral-200"
        >
          + score
        </button>
      )}
    </div>
  );
}

const X_GAP = 240; // horizontal: depth → x (left-to-right)
const Y_GAP = 56; // vertical: sibling order → y (stacks down)

/**
 * Left-to-right tidy-tree: depth maps to x, leaves stack down the y axis, and
 * each parent is vertically centered over its children. Agent traces are often
 * shallow and wide (one step → many tool calls); stacking children in a column
 * reads far better than a single very wide horizontal row.
 */
function buildGraph(spans: Span[]): { nodes: Node[]; edges: Edge[] } {
  if (spans.length === 0) return { nodes: [], edges: [] };

  const byId = new Map(spans.map((s) => [s.spanId, s]));
  const children = new Map<string, string[]>();
  const roots: string[] = [];
  for (const s of spans) {
    if (s.parentSpanId && byId.has(s.parentSpanId)) {
      const arr = children.get(s.parentSpanId);
      if (arr) arr.push(s.spanId);
      else children.set(s.parentSpanId, [s.spanId]);
    } else {
      roots.push(s.spanId);
    }
  }

  const pos = new Map<string, { x: number; y: number }>();
  let nextRowY = 0;
  const seen = new Set<string>();

  const layout = (id: string, depth: number): number => {
    if (seen.has(id)) return pos.get(id)?.y ?? 0; // guard against cycles
    seen.add(id);
    const kids = children.get(id) ?? [];
    if (kids.length === 0) {
      const y = nextRowY * Y_GAP;
      nextRowY++;
      pos.set(id, { x: depth * X_GAP, y });
      return y;
    }
    const ys = kids.map((k) => layout(k, depth + 1));
    const first = ys[0] ?? 0;
    const last = ys[ys.length - 1] ?? first;
    const y = (first + last) / 2;
    pos.set(id, { x: depth * X_GAP, y });
    return y;
  };
  for (const r of roots) layout(r, 0);

  const nodes: Node[] = spans.map((span) => ({
    id: span.spanId,
    position: pos.get(span.spanId) ?? { x: 0, y: 0 },
    data: { label: span.name },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    style: {
      background: span.status === 'error' ? '#7f1d1d' : '#1f1f23',
      color: '#f5f5f5',
      border: '1px solid #3f3f46',
      borderRadius: 6,
      padding: 8,
      fontSize: 12,
      width: 170,
      textAlign: 'center',
    },
  }));

  const edges: Edge[] = spans
    .filter((s) => s.parentSpanId !== null && byId.has(s.parentSpanId as string))
    .map((s) => ({
      id: `${s.parentSpanId}-${s.spanId}`,
      source: s.parentSpanId as string,
      target: s.spanId,
      animated: s.status === 'ok',
    }));

  return { nodes, edges };
}
