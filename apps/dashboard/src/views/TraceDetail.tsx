import type { Replay, Score, Span } from '@lookspan/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Background, Controls, type Edge, type Node, Position, ReactFlow } from '@xyflow/react';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'wouter';
import { api } from '../api/client.ts';
import { agentColor } from '../lib/agentColor.ts';

export default function TraceDetail() {
  const params = useParams<{ id: string }>();
  const traceId = params.id;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showLab, setShowLab] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['trace', traceId],
    queryFn: () => api.getTrace(traceId),
    enabled: Boolean(traceId),
  });

  const { nodes, edges } = useMemo(
    () => buildGraph(data?.spans ?? [], selectedId),
    [data?.spans, selectedId],
  );

  if (isLoading) return <div className="p-8 text-neutral-400">Loading trace…</div>;
  if (error) return <div className="p-8 text-red-400">Error: {(error as Error).message}</div>;
  if (!data) return <div className="p-8 text-neutral-400">Not found.</div>;

  const agentIds = [...new Set(data.spans.map((s) => s.agentId).filter(Boolean))] as string[];
  const selected = data.spans.find((s) => s.spanId === selectedId) ?? null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-neutral-800 px-6 py-3">
        <div className="mr-auto">
          <h1 className="text-lg font-semibold">{data.trace.rootName}</h1>
          <p className="text-xs text-neutral-500">
            {data.trace.framework} · {data.trace.spanCount} spans
            {data.trace.durationMs !== null ? ` · ${formatMs(data.trace.durationMs)}` : ''} · $
            {data.trace.costUsd.toFixed(4)}
            {data.trace.sessionId && (
              <>
                {' · '}
                <Link
                  href={`/sessions/${data.trace.sessionId}`}
                  className="text-brand-500 hover:underline"
                >
                  view session
                </Link>
              </>
            )}
            {data.trace.parentTraceId && (
              <>
                {' · '}
                <Link
                  href={`/traces/${data.trace.parentTraceId}`}
                  className="text-brand-500 hover:underline"
                >
                  spawned by ↑
                </Link>
              </>
            )}
          </p>
        </div>
        {agentIds.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {agentIds.length > 1 && (
              <span className="text-xs text-amber-400">{agentIds.length} agents</span>
            )}
            {agentIds.map((id) => (
              <span
                key={id}
                className="inline-flex items-center gap-1.5 rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300"
              >
                <span
                  className="inline-block size-2 rounded-full"
                  style={{ background: agentColor(id) }}
                />
                {id}
              </span>
            ))}
          </div>
        )}
        <Scores traceId={traceId} scores={data.scores ?? []} />
        <button
          type="button"
          onClick={() => {
            setSelectedId(null);
            setShowLab((v) => !v);
          }}
          className={`rounded border px-2 py-0.5 text-xs ${
            showLab
              ? 'border-brand-500 text-neutral-100'
              : 'border-neutral-800 text-neutral-400 hover:border-brand-500 hover:text-neutral-200'
          }`}
        >
          🧪 Replay &amp; judge
        </button>
      </div>

      <div className="relative min-h-0 flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          fitView
          fitViewOptions={{ padding: 0.25 }}
          minZoom={0.1}
          nodesConnectable={false}
          onNodeClick={(_, n) => setSelectedId(n.id)}
          onPaneClick={() => setSelectedId(null)}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={16} size={1} color="#27272a" />
          <Controls showInteractive={false} />
        </ReactFlow>
        {selected && <SpanDrawer span={selected} onClose={() => setSelectedId(null)} />}
        {showLab && <LabDrawer traceId={traceId} onClose={() => setShowLab(false)} />}
      </div>
    </div>
  );
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

const TYPE_LABEL: Record<string, string> = {
  agent_step: 'agent',
  llm_call: 'llm',
  tool_call: 'tool',
  retrieval: 'retrieval',
  embedding: 'embedding',
  error: 'error',
  custom: 'custom',
};

/** Slide-over panel with the full detail of the clicked span. */
function SpanDrawer({ span, onClose }: { span: Span; onClose: () => void }) {
  return (
    <aside className="absolute right-0 top-0 flex h-full w-96 max-w-[90%] flex-col overflow-auto border-l border-neutral-800 bg-neutral-950/95 backdrop-blur">
      <div className="flex items-start justify-between gap-2 border-b border-neutral-800 p-4">
        <div>
          <div className="flex items-center gap-2">
            <span
              className="inline-block size-2 rounded-full"
              style={{ background: agentColor(span.agentId) }}
            />
            <h2 className="text-sm font-semibold text-neutral-100">{span.name}</h2>
          </div>
          <p className="mt-1 text-xs text-neutral-500">
            {TYPE_LABEL[span.type] ?? span.type}
            {span.agentId ? ` · ${span.agentId}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-neutral-500 hover:text-neutral-200"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      <div className="space-y-4 p-4 text-xs">
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
          <Field label="Status" value={span.status} tone={span.status === 'error' ? 'bad' : 'ok'} />
          <Field
            label="Duration"
            value={span.durationMs !== null ? formatMs(span.durationMs) : '—'}
          />
          {span.model && <Field label="Model" value={span.model} />}
          {span.provider && <Field label="Provider" value={span.provider} />}
          {span.usage && (
            <>
              <Field label="Tokens in" value={String(span.usage.inputTokens ?? 0)} />
              <Field label="Tokens out" value={String(span.usage.outputTokens ?? 0)} />
              <Field label="Cost" value={`$${(span.usage.costUsd ?? 0).toFixed(4)}`} />
            </>
          )}
          <Field label="Started" value={new Date(span.startedAt).toLocaleString()} />
          {span.endedAt && <Field label="Ended" value={new Date(span.endedAt).toLocaleString()} />}
        </dl>

        {span.error && <Json label="Error" value={span.error} />}
        {span.input && <Json label="Input" value={span.input} />}
        {span.output && <Json label="Output" value={span.output} />}
        {span.attributes && <Json label="Attributes" value={span.attributes} />}
      </div>
    </aside>
  );
}

function Field({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'bad' }) {
  const color =
    tone === 'bad' ? 'text-red-400' : tone === 'ok' ? 'text-emerald-400' : 'text-neutral-200';
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-neutral-500">{label}</dt>
      <dd className={`font-mono ${color}`}>{value}</dd>
    </div>
  );
}

function Json({ label, value }: { label: string; value: unknown }) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return (
    <div>
      <div className="mb-1 text-[10px] uppercase tracking-wider text-neutral-500">{label}</div>
      <pre className="max-h-60 overflow-auto rounded border border-neutral-800 bg-neutral-900 p-2 font-mono text-[11px] text-neutral-300">
        {text}
      </pre>
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

function fmtCost(v: number | null): string {
  return v === null ? '—' : `$${v.toFixed(4)}`;
}

function Delta({ original, next }: { original: number | null; next: number | null }) {
  if (original === null || next === null || original === 0) return null;
  const pct = ((next - original) / original) * 100;
  if (!Number.isFinite(pct) || Math.abs(pct) < 0.5)
    return <span className="text-neutral-500"> ·</span>;
  const cheaper = pct < 0;
  return (
    <span className={cheaper ? 'text-emerald-400' : 'text-amber-400'}>
      {' '}
      {cheaper ? '▼' : '▲'}
      {Math.abs(pct).toFixed(0)}%
    </span>
  );
}

/** A single past replay rendered as an original-vs-replay diff card. */
function ReplayCard({ replay }: { replay: Replay }) {
  return (
    <div className="rounded border border-neutral-800 bg-neutral-900 p-2">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] text-neutral-200">{replay.replayModel}</span>
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
            replay.status === 'error'
              ? 'bg-red-500/10 text-red-400'
              : 'bg-emerald-500/10 text-emerald-400'
          }`}
        >
          {replay.status}
        </span>
      </div>
      {replay.status === 'error' ? (
        <p className="mt-1 text-[11px] text-red-400">{replay.error}</p>
      ) : (
        <>
          <div className="mt-1 grid grid-cols-2 gap-x-3 text-[10px] text-neutral-400">
            <div>
              cost: <span className="font-mono text-neutral-200">{fmtCost(replay.costUsd)}</span>
              <Delta original={replay.originalCostUsd} next={replay.costUsd} />
            </div>
            <div>
              latency:{' '}
              <span className="font-mono text-neutral-200">
                {replay.durationMs !== null ? `${replay.durationMs} ms` : '—'}
              </span>
              <Delta original={replay.originalDurationMs} next={replay.durationMs} />
            </div>
          </div>
          <pre className="mt-1.5 max-h-32 overflow-auto rounded bg-neutral-950 p-1.5 font-mono text-[10px] text-neutral-300">
            {replay.output ?? ''}
          </pre>
        </>
      )}
    </div>
  );
}

/** Right-side panel: re-run the prompt against a model, or score it with an LLM judge. */
function LabDrawer({ traceId, onClose }: { traceId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [model, setModel] = useState('');
  const [metric, setMetric] = useState('quality');
  const [datasetId, setDatasetId] = useState('');
  const [added, setAdded] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const replays = useQuery({
    queryKey: ['replays', traceId],
    queryFn: () => api.listReplays(traceId),
  });
  const datasets = useQuery({ queryKey: ['datasets'], queryFn: api.listDatasets });

  const addToDatasetM = useMutation({
    mutationFn: () => api.addDatasetItemFromTrace(datasetId, traceId),
    onSuccess: () => {
      setErr(null);
      setAdded(true);
      qc.invalidateQueries({ queryKey: ['dataset', datasetId] });
    },
    onError: (e) => setErr((e as Error).message),
  });

  const replayM = useMutation({
    mutationFn: () => api.replay(traceId, model.trim() ? { model: model.trim() } : {}),
    onSuccess: () => {
      setErr(null);
      qc.invalidateQueries({ queryKey: ['replays', traceId] });
    },
    onError: (e) => setErr((e as Error).message),
  });

  const judgeM = useMutation({
    mutationFn: () => api.judge(traceId, { metric: metric.trim() || 'quality' }),
    onSuccess: () => {
      setErr(null);
      qc.invalidateQueries({ queryKey: ['trace', traceId] });
    },
    onError: (e) => setErr((e as Error).message),
  });

  const items = replays.data?.items ?? [];

  return (
    <aside className="absolute right-0 top-0 flex h-full w-96 max-w-[90%] flex-col overflow-auto border-l border-neutral-800 bg-neutral-950/95 backdrop-blur">
      <div className="flex items-center justify-between border-b border-neutral-800 p-4">
        <h2 className="text-sm font-semibold text-neutral-100">Replay &amp; judge</h2>
        <button
          type="button"
          onClick={onClose}
          className="text-neutral-500 hover:text-neutral-200"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      <div className="space-y-5 p-4 text-xs">
        {err && (
          <div className="rounded border border-red-500/40 bg-red-500/5 p-2 text-[11px] text-red-300">
            {err}
          </div>
        )}

        <section>
          <div className="mb-1.5 text-[10px] uppercase tracking-wider text-neutral-500">
            Replay the prompt
          </div>
          <div className="flex items-center gap-1.5">
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="model (blank = same)"
              className="min-w-0 flex-1 rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs focus:border-brand-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => replayM.mutate()}
              disabled={replayM.isPending}
              className="rounded bg-brand-600 px-2 py-1 text-xs font-medium text-white disabled:opacity-40"
            >
              {replayM.isPending ? 'Running…' : 'Run'}
            </button>
          </div>
          <p className="mt-1 text-[10px] text-neutral-600">
            Re-runs the captured prompt. Needs a provider key on the server.
          </p>
        </section>

        <section>
          <div className="mb-1.5 text-[10px] uppercase tracking-wider text-neutral-500">
            LLM-as-judge
          </div>
          <div className="flex items-center gap-1.5">
            <input
              value={metric}
              onChange={(e) => setMetric(e.target.value)}
              placeholder="metric"
              className="min-w-0 flex-1 rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs focus:border-brand-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => judgeM.mutate()}
              disabled={judgeM.isPending}
              className="rounded bg-brand-600 px-2 py-1 text-xs font-medium text-white disabled:opacity-40"
            >
              {judgeM.isPending ? 'Judging…' : 'Score'}
            </button>
          </div>
          <p className="mt-1 text-[10px] text-neutral-600">
            Scores the response 0–1; appears as a score chip above.
          </p>
        </section>

        <section>
          <div className="mb-1.5 text-[10px] uppercase tracking-wider text-neutral-500">
            Add prompt to a dataset
          </div>
          <div className="flex items-center gap-1.5">
            <select
              value={datasetId}
              onChange={(e) => {
                setDatasetId(e.target.value);
                setAdded(false);
              }}
              className="min-w-0 flex-1 rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs focus:border-brand-500 focus:outline-none"
            >
              <option value="">choose dataset…</option>
              {(datasets.data?.items ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => addToDatasetM.mutate()}
              disabled={!datasetId || addToDatasetM.isPending}
              className="rounded bg-brand-600 px-2 py-1 text-xs font-medium text-white disabled:opacity-40"
            >
              {added ? 'Added ✓' : 'Add'}
            </button>
          </div>
          <p className="mt-1 text-[10px] text-neutral-600">
            Captures this trace's prompt (and output as the reference) into a{' '}
            <Link href="/datasets" className="text-brand-500 hover:underline">
              dataset
            </Link>
            .
          </p>
        </section>

        {items.length > 0 && (
          <section>
            <div className="mb-1.5 text-[10px] uppercase tracking-wider text-neutral-500">
              Replays ({items.length})
            </div>
            <div className="space-y-2">
              {items.map((r) => (
                <ReplayCard key={r.id} replay={r} />
              ))}
            </div>
          </section>
        )}
      </div>
    </aside>
  );
}

const X_GAP = 240; // horizontal: depth → x (left-to-right)
const Y_GAP = 60; // vertical: sibling order → y (stacks down)

/**
 * Left-to-right tidy-tree: depth maps to x, leaves stack down the y axis, and
 * each parent is vertically centered over its children. Agent traces are often
 * shallow and wide (one step → many tool calls); stacking children in a column
 * reads far better than a single very wide horizontal row.
 */
function buildGraph(spans: Span[], selectedId: string | null): { nodes: Node[]; edges: Edge[] } {
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

  const nodes: Node[] = spans.map((span) => {
    const accent = agentColor(span.agentId);
    const isError = span.status === 'error';
    const isSelected = span.spanId === selectedId;
    return {
      id: span.spanId,
      position: pos.get(span.spanId) ?? { x: 0, y: 0 },
      data: {
        label: (
          <div className="text-left leading-tight">
            <div className="truncate font-medium text-neutral-100">{span.name}</div>
            <div className="mt-0.5 text-[10px] text-neutral-400">
              {TYPE_LABEL[span.type] ?? span.type}
              {span.durationMs !== null ? ` · ${formatMs(span.durationMs)}` : ''}
            </div>
          </div>
        ),
      },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      style: {
        background: isError ? '#2a1416' : '#18181b',
        color: '#f5f5f5',
        border: `1px solid ${isSelected ? accent : isError ? '#7f1d1d' : '#3f3f46'}`,
        borderLeft: `4px solid ${accent}`,
        borderRadius: 8,
        padding: '6px 10px',
        fontSize: 12,
        width: 180,
        boxShadow: isSelected ? `0 0 0 1px ${accent}` : 'none',
      },
    };
  });

  const edges: Edge[] = spans
    .filter((s) => s.parentSpanId !== null && byId.has(s.parentSpanId as string))
    .map((s) => ({
      id: `${s.parentSpanId}-${s.spanId}`,
      source: s.parentSpanId as string,
      target: s.spanId,
      animated: s.status === 'ok',
      style: { stroke: '#3f3f46' },
    }));

  return { nodes, edges };
}
