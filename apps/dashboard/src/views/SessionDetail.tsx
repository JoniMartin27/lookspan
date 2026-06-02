import type { TraceListItem } from '@lookspan/types';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useLocation, useParams } from 'wouter';
import { api } from '../api/client.ts';
import { agentColor } from '../lib/agentColor.ts';

export default function SessionDetail() {
  const params = useParams<{ id: string }>();
  const sessionId = params.id;

  const { data, isLoading, error } = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => api.getSession(sessionId),
    enabled: Boolean(sessionId),
  });

  if (isLoading) return <div className="p-8 text-neutral-400">Loading session…</div>;
  if (error) return <div className="p-8 text-red-400">Error: {(error as Error).message}</div>;
  if (!data) return <div className="p-8 text-neutral-400">Not found.</div>;

  const { session, traces } = data;

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold">Session</h1>
      <p className="mb-4 font-mono text-xs text-neutral-500">{session.sessionId}</p>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Agents" value={String(session.agentCount)} />
        <Stat label="Traces" value={String(session.traceCount)} />
        <Stat
          label="Errors"
          value={String(session.errorCount)}
          tone={session.errorCount > 0 ? 'bad' : undefined}
        />
        <Stat label="Cost" value={`$${session.totalCostUsd.toFixed(4)}`} />
      </div>

      <h2 className="mb-2 text-sm font-medium text-neutral-300">Timeline by agent</h2>
      <Timeline traces={traces} />
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'bad' }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-3">
      <div className="text-[10px] uppercase tracking-wider text-neutral-500">{label}</div>
      <div
        className={`mt-0.5 font-mono text-xl ${tone === 'bad' ? 'text-red-400' : 'text-neutral-100'}`}
      >
        {value}
      </div>
    </div>
  );
}

interface Bar {
  trace: TraceListItem;
  start: number;
  end: number;
}

function Timeline({ traces }: { traces: TraceListItem[] }) {
  const [, navigate] = useLocation();
  const [hovered, setHovered] = useState<TraceListItem | null>(null);

  // Ordinal time axis: position by the *rank* of each timestamp among all event
  // boundaries, not raw wall-clock. This compresses long idle gaps (an empty
  // 24h stretch costs no width) while keeping cross-agent alignment — two traces
  // that started at the same instant still line up vertically.
  const { lanes, rankOf, maxRank, startLabel, endLabel } = useMemo(() => {
    const ts = traces.map((t) => new Date(t.startedAt).getTime());
    const boundaries = new Set<number>();
    traces.forEach((t, i) => {
      const s = ts[i] ?? 0;
      boundaries.add(s);
      boundaries.add(s + (t.durationMs ?? 0));
    });
    const sorted = [...boundaries].sort((a, b) => a - b);
    const rank = new Map(sorted.map((t, i) => [t, i]));

    const byAgent = new Map<string, Bar[]>();
    traces.forEach((t, i) => {
      const key = t.agentId ?? '(unattributed)';
      const start = ts[i] ?? 0;
      const bar: Bar = { trace: t, start, end: start + (t.durationMs ?? 0) };
      const arr = byAgent.get(key);
      if (arr) arr.push(bar);
      else byAgent.set(key, [bar]);
    });
    return {
      lanes: [...byAgent.entries()].sort((a, b) => a[0].localeCompare(b[0])),
      rankOf: rank,
      maxRank: Math.max(1, sorted.length - 1),
      startLabel: sorted.length ? new Date(sorted[0] as number).toLocaleString() : '',
      endLabel: sorted.length ? new Date(sorted[sorted.length - 1] as number).toLocaleString() : '',
    };
  }, [traces]);

  if (traces.length === 0) {
    return <p className="text-xs text-neutral-500">No traces in this session.</p>;
  }

  return (
    <div className="space-y-1.5">
      {lanes.map(([agent, bars]) => (
        <div key={agent} className="flex items-center gap-3">
          <div className="flex w-32 shrink-0 items-center gap-1.5 truncate text-xs text-neutral-300">
            <span
              className="inline-block size-2 shrink-0 rounded-full"
              style={{ background: agentColor(agent === '(unattributed)' ? null : agent) }}
            />
            <span className="truncate">{agent}</span>
          </div>
          <div className="relative h-6 flex-1 rounded bg-neutral-900">
            {bars.map((b) => {
              const left = ((rankOf.get(b.start) ?? 0) / maxRank) * 100;
              const right = ((rankOf.get(b.end) ?? 0) / maxRank) * 100;
              const width = Math.max(0.8, right - left);
              return (
                <button
                  type="button"
                  key={b.trace.traceId}
                  onClick={() => navigate(`/traces/${b.trace.traceId}`)}
                  onMouseEnter={() => setHovered(b.trace)}
                  onFocus={() => setHovered(b.trace)}
                  title={`${b.trace.rootName} · ${b.trace.durationMs ?? 0}ms · ${b.trace.status}`}
                  className="absolute top-0.5 h-5 rounded-sm border hover:brightness-125"
                  style={{
                    left: `${left}%`,
                    width: `${width}%`,
                    minWidth: 4,
                    background: agentColor(agent === '(unattributed)' ? null : agent),
                    opacity: b.trace.status === 'error' ? 1 : 0.6,
                    borderColor: b.trace.status === 'error' ? '#ef4444' : 'transparent',
                  }}
                />
              );
            })}
          </div>
        </div>
      ))}
      <div className="flex justify-between pl-[8.75rem] pt-1 text-[10px] text-neutral-600">
        <span>{startLabel}</span>
        <span>ordinal axis · idle gaps compressed</span>
        <span>{endLabel}</span>
      </div>

      <TracePreview trace={hovered} onOpen={(id) => navigate(`/traces/${id}`)} />
    </div>
  );
}

/** Preview card shown below the timeline for the hovered trace. */
function TracePreview({
  trace,
  onOpen,
}: {
  trace: TraceListItem | null;
  onOpen: (id: string) => void;
}) {
  if (!trace) {
    return (
      <div className="mt-4 flex h-24 items-center justify-center rounded-lg border border-dashed border-neutral-800 text-xs text-neutral-600">
        Hover a trace to preview it
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onOpen(trace.traceId)}
      className="mt-4 block w-full rounded-lg border border-neutral-800 bg-neutral-900/50 p-4 text-left hover:border-brand-500"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className="inline-block size-2 rounded-full"
            style={{ background: agentColor(trace.agentId) }}
          />
          <span className="text-sm font-medium text-neutral-100">{trace.rootName}</span>
        </div>
        <span
          className={`rounded px-2 py-0.5 text-xs font-medium ${
            trace.status === 'error'
              ? 'bg-red-500/10 text-red-400'
              : 'bg-emerald-500/10 text-emerald-400'
          }`}
        >
          {trace.status}
        </span>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
        <Pair label="Agent" value={trace.agentId ?? '—'} />
        <Pair label="Framework" value={trace.framework} />
        <Pair label="Spans" value={String(trace.spanCount)} />
        <Pair
          label="Duration"
          value={trace.durationMs !== null ? formatRange(trace.durationMs) : '—'}
        />
        <Pair label="Cost" value={`$${trace.costUsd.toFixed(4)}`} />
        <Pair label="Started" value={new Date(trace.startedAt).toLocaleString()} />
      </dl>
      <p className="mt-2 text-[10px] text-neutral-500">Click to open the full trace →</p>
    </button>
  );
}

function Pair({ label, value }: { label: string; value: string }) {
  return (
    <div className="truncate">
      <dt className="text-[10px] uppercase tracking-wider text-neutral-500">{label}</dt>
      <dd className="truncate font-mono text-neutral-200" title={value}>
        {value}
      </dd>
    </div>
  );
}

function formatRange(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${(ms / 60_000).toFixed(1)} min`;
}
