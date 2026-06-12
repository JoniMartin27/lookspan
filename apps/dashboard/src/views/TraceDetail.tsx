import type { Replay, Score, Span } from '@lookspan/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Background, Controls, type Edge, type Node, Position, ReactFlow } from '@xyflow/react';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'wouter';
import { api } from '../api/client.ts';
import { agentColor } from '../lib/agentColor.ts';
import { diffLines } from '../lib/diff.ts';

export default function TraceDetail() {
  const params = useParams<{ id: string }>();
  const traceId = params.id;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showLab, setShowLab] = useState(false);
  const [view, setView] = useState<'timeline' | 'tree'>('timeline');

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
            {fmtTokens(data.trace.totalUsage) && (
              <span className="text-neutral-500"> · {fmtTokens(data.trace.totalUsage)}</span>
            )}
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
        <div className="flex overflow-hidden rounded border border-neutral-800 text-xs">
          {(['timeline', 'tree'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`px-2 py-0.5 ${
                view === v
                  ? 'bg-neutral-800 text-neutral-100'
                  : 'text-neutral-500 hover:text-neutral-300'
              }`}
            >
              {v === 'timeline' ? 'Timeline' : 'Tree'}
            </button>
          ))}
        </div>
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
        {view === 'timeline' ? (
          <Timeline
            spans={data.spans}
            selectedId={selectedId}
            onSelect={(id) => setSelectedId(id)}
          />
        ) : (
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
        )}
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

interface TimelineRow {
  span: Span;
  depth: number;
  startMs: number;
  durMs: number;
}

/**
 * Waterfall view: every span is a bar positioned by its start time (relative to
 * the trace) with width proportional to its duration, indented by tree depth.
 * Answers "where did the time go?" — the question a tree can't.
 */
function Timeline({
  spans,
  selectedId,
  onSelect,
}: {
  spans: Span[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const rows = useMemo<TimelineRow[]>(() => {
    if (spans.length === 0) return [];
    const t0 = Math.min(...spans.map((s) => new Date(s.startedAt).getTime()));
    const t1 = Math.max(...spans.map((s) => new Date(s.endedAt ?? s.startedAt).getTime()));
    const total = Math.max(1, t1 - t0);

    // depth from parent chain
    const byId = new Map(spans.map((s) => [s.spanId, s]));
    const depthOf = (s: Span): number => {
      let d = 0;
      let cur: Span | undefined = s;
      const seen = new Set<string>();
      while (cur?.parentSpanId && byId.has(cur.parentSpanId) && !seen.has(cur.spanId)) {
        seen.add(cur.spanId);
        cur = byId.get(cur.parentSpanId);
        d++;
        if (d > 20) break;
      }
      return d;
    };

    return [...spans]
      .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime())
      .map((span) => {
        const start = new Date(span.startedAt).getTime();
        const end = new Date(span.endedAt ?? span.startedAt).getTime();
        return {
          span,
          depth: depthOf(span),
          startMs: ((start - t0) / total) * 100,
          durMs: Math.max(0.5, ((end - start) / total) * 100),
        };
      });
  }, [spans]);

  const totalMs = useMemo(() => {
    if (spans.length === 0) return 0;
    const t0 = Math.min(...spans.map((s) => new Date(s.startedAt).getTime()));
    const t1 = Math.max(...spans.map((s) => new Date(s.endedAt ?? s.startedAt).getTime()));
    return t1 - t0;
  }, [spans]);

  if (rows.length === 0) {
    return <div className="p-8 text-sm text-neutral-500">No spans.</div>;
  }

  return (
    <div className="h-full overflow-auto p-4">
      <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-wider text-neutral-600">
        <span>span</span>
        <span>{formatMs(totalMs)} total</span>
      </div>
      <div className="space-y-1">
        {rows.map(({ span, depth, startMs, durMs }) => {
          const accent = agentColor(span.agentId);
          const isError = span.status === 'error';
          const isSel = span.spanId === selectedId;
          return (
            <button
              key={span.spanId}
              type="button"
              onClick={() => onSelect(span.spanId)}
              className={`flex w-full items-center gap-3 rounded px-2 py-1 text-left hover:bg-neutral-900 ${
                isSel ? 'bg-neutral-900' : ''
              }`}
              style={isSel ? { boxShadow: `inset 0 0 0 1px ${accent}` } : undefined}
            >
              <div
                className="flex min-w-0 shrink-0 items-center gap-1.5"
                style={{ width: 220, paddingLeft: depth * 12 }}
              >
                <span
                  className="inline-block size-2 shrink-0 rounded-full"
                  style={{ background: accent }}
                />
                <span className="truncate text-xs text-neutral-200">{span.name}</span>
                <span className="shrink-0 text-[10px] text-neutral-600">
                  {TYPE_LABEL[span.type] ?? span.type}
                </span>
              </div>
              <div className="relative h-4 flex-1">
                <div
                  className="absolute top-0.5 flex h-3 items-center rounded-sm"
                  style={{
                    left: `${startMs}%`,
                    width: `${durMs}%`,
                    minWidth: 3,
                    background: isError ? '#b91c1c' : accent,
                    opacity: isError ? 0.9 : 0.75,
                  }}
                  title={span.durationMs !== null ? formatMs(span.durationMs) : ''}
                />
              </div>
              <span className="w-16 shrink-0 text-right font-mono text-[10px] text-neutral-500">
                {span.durationMs !== null ? formatMs(span.durationMs) : '—'}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
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
          <Field
            label="Status"
            value={span.status}
            tone={span.status === 'error' ? 'bad' : span.status === 'cancelled' ? undefined : 'ok'}
          />
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
        <Conversation input={span.input} output={span.output} />
        {span.attributes && <Json label="Attributes" value={span.attributes} />}
      </div>
    </aside>
  );
}

interface ChatMessage {
  role: string;
  text: string;
}

function partsToText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((p) => {
        if (typeof p === 'string') return p;
        if (p && typeof p === 'object') {
          const o = p as { text?: unknown; type?: unknown };
          if (typeof o.text === 'string') return o.text;
          if (typeof o.type === 'string') return `「${o.type}」`;
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

/** Pull a readable list of chat turns out of a stored request `input`. */
function toMessages(input: Record<string, unknown> | null | undefined): ChatMessage[] | null {
  if (!input || typeof input !== 'object') return null;
  const out: ChatMessage[] = [];
  if (typeof input.system === 'string' && input.system) {
    out.push({ role: 'system', text: input.system });
  }
  const msgs = input.messages;
  if (!Array.isArray(msgs)) return out.length > 0 ? out : null;
  for (const m of msgs) {
    if (!m || typeof m !== 'object') continue;
    const mm = m as { role?: unknown; content?: unknown; tool_calls?: unknown };
    const role = typeof mm.role === 'string' ? mm.role : 'user';
    let text = partsToText(mm.content);
    if (Array.isArray(mm.tool_calls)) {
      const calls = mm.tool_calls
        .map((c) => {
          const fn = (c as { function?: { name?: unknown; arguments?: unknown } }).function;
          return fn?.name ? `🔧 ${String(fn.name)}(${String(fn.arguments ?? '')})` : '';
        })
        .filter(Boolean)
        .join('\n');
      text = [text, calls].filter(Boolean).join('\n');
    }
    out.push({ role, text });
  }
  return out;
}

const ROLE_STYLE: Record<string, string> = {
  system: 'border-neutral-700 bg-neutral-800/40 text-neutral-400',
  user: 'border-sky-500/30 bg-sky-500/5 text-neutral-200',
  assistant: 'border-emerald-500/30 bg-emerald-500/5 text-neutral-200',
  tool: 'border-amber-500/30 bg-amber-500/5 text-amber-200/90',
};

/** Render a span's prompt + reply as a chat transcript; falls back to raw JSON. */
function Conversation({
  input,
  output,
}: {
  input: Record<string, unknown> | null | undefined;
  output: string | null | undefined;
}) {
  const [raw, setRaw] = useState(false);
  const messages = toMessages(input);
  const hasChat = (messages && messages.length > 0) || Boolean(output);

  if (!hasChat) {
    return (
      <>
        {input && <Json label="Input" value={input} />}
        {output && <Json label="Output" value={output} />}
      </>
    );
  }

  if (raw) {
    return (
      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider text-neutral-500">
            Conversation
          </span>
          <button
            type="button"
            onClick={() => setRaw(false)}
            className="text-[10px] text-brand-500 hover:underline"
          >
            chat view
          </button>
        </div>
        {input && <Json label="Input" value={input} />}
        {output && <Json label="Output" value={output} />}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-neutral-500">Conversation</span>
        <button
          type="button"
          onClick={() => setRaw(true)}
          className="text-[10px] text-brand-500 hover:underline"
        >
          raw
        </button>
      </div>
      <div className="space-y-1.5">
        {(messages ?? []).map((m, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: chat turns are a static, ordered list
          <Bubble key={`${m.role}-${i}`} who={m.role} text={m.text} />
        ))}
        {output && <Bubble who="assistant" text={output} reply />}
      </div>
    </div>
  );
}

function Bubble({ who, text, reply }: { who: string; text: string; reply?: boolean }) {
  const style = ROLE_STYLE[who] ?? ROLE_STYLE.tool;
  return (
    <div className={`rounded-lg border px-2.5 py-1.5 ${style}`}>
      <div className="mb-0.5 flex items-center gap-1 text-[10px] uppercase tracking-wider opacity-70">
        {who}
        {reply && <span className="text-emerald-400">· reply</span>}
      </div>
      <div className="whitespace-pre-wrap break-words text-[11px] leading-relaxed">
        {text || <span className="italic opacity-50">(empty)</span>}
      </div>
    </div>
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

/** Maps a score source to a compact glyph + label so the judge's verdicts are
 *  distinguishable from human/assertion scores at a glance. */
function sourceBadge(source?: string | null): { icon: string; label: string } | null {
  switch (source) {
    case 'llm-judge':
      return { icon: '⚖', label: 'LLM judge' };
    case 'human':
      return { icon: '✎', label: 'human' };
    case 'assertion':
      return { icon: '✓', label: 'assertion' };
    default:
      return source ? { icon: '•', label: source } : null;
  }
}

/** Compact scores UI in the header: existing scores as chips (with source +
 *  expandable rationale) + a small inline add form. */
function Scores({ traceId, scores }: { traceId: string; scores: Score[] }) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [openId, setOpenId] = useState<number | null>(null);

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
  const open = scores.find((s) => s.id === openId) ?? null;

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        {scores.map((s) => {
          const badge = sourceBadge(s.source);
          const hasComment = Boolean(s.comment);
          const isOpen = s.id === openId;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => hasComment && setOpenId(isOpen ? null : (s.id ?? null))}
              title={badge?.label ?? ''}
              className={`flex items-center gap-1 rounded px-2 py-0.5 text-xs text-neutral-300 ${
                isOpen ? 'bg-neutral-700' : 'bg-neutral-800'
              } ${hasComment ? 'cursor-pointer hover:bg-neutral-700' : 'cursor-default'}`}
            >
              {badge && (
                <span className={s.source === 'llm-judge' ? 'text-brand-400' : 'text-neutral-500'}>
                  {badge.icon}
                </span>
              )}
              {s.name} <span className="font-mono text-neutral-100">{s.value}</span>
              {hasComment && <span className="text-neutral-500">{isOpen ? '▾' : '▸'}</span>}
            </button>
          );
        })}
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
      {open?.comment && (
        <div className="max-w-md rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-[11px] text-neutral-400">
          <span className="text-neutral-500">{sourceBadge(open.source)?.label ?? 'note'}:</span>{' '}
          {open.comment}
        </div>
      )}
    </div>
  );
}

function fmtCost(v: number | null): string {
  return v === null ? '—' : `$${v.toFixed(4)}`;
}

/** Compact "1.2k → 300 tok" summary of a trace's aggregate token usage, or '' if none. */
function fmtTokens(
  usage: { inputTokens: number; outputTokens: number } | null | undefined,
): string {
  const input = usage?.inputTokens ?? 0;
  const output = usage?.outputTokens ?? 0;
  if (input + output === 0) return '';
  const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
  return `${compact(input)} → ${compact(output)} tok`;
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
          <ReplayOutput original={replay.originalOutput} output={replay.output ?? ''} />
        </>
      )}
    </div>
  );
}

/** Replay output with an optional line-diff against the original answer. */
function ReplayOutput({ original, output }: { original: string | null; output: string }) {
  const canDiff = Boolean(original) && original !== output;
  const [mode, setMode] = useState<'output' | 'diff'>(canDiff ? 'diff' : 'output');
  const lines = useMemo(
    () => (mode === 'diff' && original !== null ? diffLines(original, output) : null),
    [mode, original, output],
  );

  return (
    <div className="mt-1.5">
      {canDiff && (
        <div className="mb-1 flex gap-2 text-[9px] uppercase tracking-wider">
          {(['diff', 'output'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={
                mode === m ? 'text-neutral-200' : 'text-neutral-600 hover:text-neutral-400'
              }
            >
              {m === 'diff' ? 'diff vs original' : 'output'}
            </button>
          ))}
        </div>
      )}
      {lines ? (
        <div className="max-h-40 overflow-auto rounded bg-neutral-950 p-1.5 font-mono text-[10px] leading-relaxed">
          {lines.map((l, i) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: diff lines are a static ordered list
              key={i}
              className={
                l.type === 'add'
                  ? 'bg-emerald-500/10 text-emerald-300'
                  : l.type === 'del'
                    ? 'bg-red-500/10 text-red-300'
                    : 'text-neutral-400'
              }
            >
              <span className="select-none opacity-50">
                {l.type === 'add' ? '+ ' : l.type === 'del' ? '- ' : '  '}
              </span>
              {l.text || ' '}
            </div>
          ))}
        </div>
      ) : (
        <pre className="max-h-32 overflow-auto rounded bg-neutral-950 p-1.5 font-mono text-[10px] text-neutral-300">
          {output}
        </pre>
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
