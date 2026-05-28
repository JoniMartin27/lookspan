import { useQuery } from '@tanstack/react-query';
import {
  Background,
  Controls,
  type Edge,
  type Node,
  ReactFlow,
} from '@xyflow/react';
import { useMemo } from 'react';
import { useParams } from 'wouter';
import { api } from '../api/client.ts';
import type { Span } from '@lookspan/types';

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
      <div className="flex-1">
        <ReactFlow nodes={nodes} edges={edges} fitView>
          <Background gap={16} size={1} />
          <Controls />
        </ReactFlow>
      </div>
    </div>
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
  while (current && current.parentSpanId) {
    const parentId: string = current.parentSpanId;
    current = all.find((s) => s.spanId === parentId);
    depth++;
    if (depth > 50) break;
  }
  return depth;
}
