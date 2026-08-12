import type { StatsSummary, TraceListItem } from '@lookspan/types';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { api } from '../api/client.ts';
import { EmptyState } from '../components/EmptyState.tsx';
import { agentColor } from '../lib/agentColor.ts';
import { relativeTime } from '../lib/time.ts';

const FRAMEWORKS = ['mcp', 'langgraph', 'crewai', 'agent-os', 'openai-agents', 'otlp', 'custom'];
const STATUSES = ['ok', 'error', 'cancelled'];
const PAGE = 50;

function fmtMs(ms: number | null): string {
  if (ms === null) return '—';
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export default function TraceList() {
  const [framework, setFramework] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');

  const stats = useQuery({ queryKey: ['stats'], queryFn: api.stats, refetchInterval: 10_000 });

  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: ['traces', framework, status],
      queryFn: ({ pageParam }) =>
        api.listTraces({
          framework: framework || undefined,
          status: status || undefined,
          cursor: pageParam,
          limit: PAGE,
        }),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (last) =>
        last.items.length === PAGE ? last.items[last.items.length - 1]?.startedAt : undefined,
      refetchInterval: 10_000,
    });

  const allItems = useMemo(() => data?.pages.flatMap((p) => p.items) ?? [], [data]);
  const items = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? allItems.filter((t) => t.rootName.toLowerCase().includes(q)) : allItems;
  }, [allItems, search]);

  // Scale mini-bars to the loaded set so each row reads relative to its peers.
  const maxDur = useMemo(() => Math.max(1, ...items.map((t) => t.durationMs ?? 0)), [items]);
  const maxCost = useMemo(() => Math.max(0.000001, ...items.map((t) => t.costUsd)), [items]);
  const p95 = stats.data?.latencyMs?.p95 ?? Number.POSITIVE_INFINITY;

  return (
    <div className="p-6">
      <HealthStrip stats={stats.data} />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-xl font-semibold">Recent traces</h1>
        <input
          type="search"
          placeholder="Search name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-sm placeholder:text-neutral-600 focus:border-brand-500 focus:outline-none"
        />
        <Select
          value={framework}
          onChange={setFramework}
          placeholder="All frameworks"
          options={FRAMEWORKS}
        />
        <Select value={status} onChange={setStatus} placeholder="All statuses" options={STATUSES} />
        <ExportMenu
          disabled={allItems.length === 0}
          framework={framework || undefined}
          status={status || undefined}
        />
      </div>

      {isLoading ? (
        <div className="py-8 text-neutral-400">Loading traces…</div>
      ) : error ? (
        <div className="py-8 text-red-400">Error: {(error as Error).message}</div>
      ) : items.length === 0 ? (
        <TracesEmptyState filtered={allItems.length > 0} />
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-neutral-500">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Agent</th>
              <th className="px-3 py-2">Started</th>
              <th className="px-3 py-2">Latency</th>
              <th className="px-3 py-2">Cost</th>
              <th className="px-3 py-2">Spans</th>
            </tr>
          </thead>
          <tbody>
            {items.map((t) => (
              <Row
                key={t.traceId}
                t={t}
                maxDur={maxDur}
                maxCost={maxCost}
                slow={(t.durationMs ?? 0) > p95}
              />
            ))}
          </tbody>
        </table>
      )}

      {!search && hasNextPage && (
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="rounded border border-neutral-800 px-4 py-1.5 text-sm text-neutral-300 hover:border-brand-500 hover:text-neutral-100 disabled:opacity-40"
          >
            {isFetchingNextPage ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
      {!isLoading && allItems.length > 0 && (
        <p className="mt-3 text-center text-xs text-neutral-600">
          {search ? `${items.length} of ${allItems.length} loaded` : `${allItems.length} loaded`}
        </p>
      )}
    </div>
  );
}

/** A compact at-a-glance health bar above the list. */
function HealthStrip({ stats }: { stats: StatsSummary | undefined }) {
  if (!stats || stats.totalTraces === 0) return null;
  const errPct = (stats.errorRate * 100).toFixed(
    stats.errorRate > 0 && stats.errorRate < 0.01 ? 1 : 0,
  );
  return (
    <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Tile label="Traces" value={String(stats.totalTraces)} />
      <Tile label="Error rate" value={`${errPct}%`} tone={stats.errorTraces > 0 ? 'bad' : 'good'} />
      <Tile label="p95 latency" value={stats.latencyMs ? fmtMs(stats.latencyMs.p95) : '—'} />
      <Tile label="Total cost" value={`$${stats.totalCostUsd.toFixed(2)}`} />
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) {
  const color =
    tone === 'bad' ? 'text-red-400' : tone === 'good' ? 'text-emerald-400' : 'text-neutral-100';
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider text-neutral-500">{label}</div>
      <div className={`mt-0.5 text-lg font-semibold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}

function Row({
  t,
  maxDur,
  maxCost,
  slow,
}: {
  t: TraceListItem;
  maxDur: number;
  maxCost: number;
  slow: boolean;
}) {
  const accent =
    t.status === 'error' ? '#b91c1c' : t.status === 'cancelled' ? '#5f5044' : agentColor(t.agentId);
  return (
    <tr className="border-t border-neutral-800 hover:bg-neutral-900">
      <td className="py-2 pr-3 pl-3" style={{ boxShadow: `inset 3px 0 0 ${accent}` }}>
        <Link href={`/traces/${t.traceId}`} className="text-neutral-100 hover:text-brand-400">
          {t.rootName}
        </Link>
        <div className="text-[10px] text-neutral-600">{t.framework}</div>
      </td>
      <td className="px-3 py-2 text-neutral-400">
        {t.agentId ? (
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block size-2 rounded-full"
              style={{ background: agentColor(t.agentId) }}
            />
            <span className="truncate">{t.agentId}</span>
          </span>
        ) : (
          <span className="text-neutral-600">—</span>
        )}
      </td>
      <td className="px-3 py-2 text-neutral-500" title={new Date(t.startedAt).toLocaleString()}>
        {relativeTime(t.startedAt)}
      </td>
      <td className="px-3 py-2">
        <MiniBar
          text={fmtMs(t.durationMs)}
          frac={(t.durationMs ?? 0) / maxDur}
          color={slow ? '#ffb02e' : '#5bc8d8'}
        />
      </td>
      <td className="px-3 py-2">
        <MiniBar text={`$${t.costUsd.toFixed(4)}`} frac={t.costUsd / maxCost} color="#ffb02e" />
      </td>
      <td className="px-3 py-2 text-neutral-400 tabular-nums">{t.spanCount}</td>
    </tr>
  );
}

/** A number with a thin proportional bar underneath — turns a column into a glanceable chart. */
function MiniBar({ text, frac, color }: { text: string; frac: number; color: string }) {
  const pct = Math.max(2, Math.min(100, frac * 100));
  return (
    <div className="w-28">
      <div className="font-mono text-xs text-neutral-300 tabular-nums">{text}</div>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-neutral-800">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function Select({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: string[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none"
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

/**
 * Download the current (filtered) trace set as CSV or JSON. Uses plain anchor
 * links to the export endpoint so the browser saves the file with the
 * server-supplied filename — no blob juggling. Respects the active
 * framework/status filters.
 */
function ExportMenu({
  disabled,
  framework,
  status,
}: {
  disabled: boolean;
  framework: string | undefined;
  status: string | undefined;
}) {
  const [open, setOpen] = useState(false);
  const link = (fmt: 'csv' | 'json') => api.exportTracesUrl(fmt, { framework, status });
  const linkCls =
    'block px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800 hover:text-neutral-100';
  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="rounded border border-neutral-800 px-3 py-1.5 text-sm text-neutral-300 hover:border-brand-500 hover:text-neutral-100 disabled:opacity-40"
      >
        Export ▾
      </button>
      {open && !disabled && (
        <>
          {/* Invisible backdrop closes the menu on outside click (and Esc). */}
          <button
            type="button"
            aria-label="Close export menu"
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 z-20 mt-1 w-32 overflow-hidden rounded border border-neutral-800 bg-neutral-900 shadow-lg">
            {/* download attr asks the browser to save rather than navigate. */}
            <a href={link('csv')} download className={linkCls} onClick={() => setOpen(false)}>
              CSV
            </a>
            <a href={link('json')} download className={linkCls} onClick={() => setOpen(false)}>
              JSON
            </a>
          </div>
        </>
      )}
    </div>
  );
}

function TracesEmptyState({ filtered }: { filtered: boolean }) {
  if (filtered) {
    return <EmptyState>No traces match the current filters.</EmptyState>;
  }
  return (
    <EmptyState title="No traces yet">
      Head to{' '}
      <Link href="/connect" className="text-brand-500 hover:underline">
        Connect
      </Link>{' '}
      to wire up your agent in a couple of lines.
    </EmptyState>
  );
}
