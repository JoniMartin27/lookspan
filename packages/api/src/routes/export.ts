import type { Trace } from '@lookspan/types';
import { Router } from 'express';
import type { ApiContext } from '../context.js';
import { toCsv } from './csv.js';
import { parseLimit } from './query.js';

/** Columns emitted (in order) when exporting traces as CSV. */
const CSV_COLUMNS = [
  'traceId',
  'rootName',
  'framework',
  'agentId',
  'sessionId',
  'parentTraceId',
  'startedAt',
  'endedAt',
  'durationMs',
  'status',
  'spanCount',
  'errorCount',
  'inputTokens',
  'outputTokens',
  'cachedInputTokens',
  'reasoningTokens',
  'costUsd',
] as const;

/** Flatten a Trace into the flat record the CSV columns expect. */
function toCsvRow(t: Trace): Record<(typeof CSV_COLUMNS)[number], unknown> {
  return {
    traceId: t.traceId,
    rootName: t.rootName,
    framework: t.framework,
    agentId: t.agentId,
    sessionId: t.sessionId,
    parentTraceId: t.parentTraceId,
    startedAt: t.startedAt,
    endedAt: t.endedAt,
    durationMs: t.durationMs,
    status: t.status,
    spanCount: t.spanCount,
    errorCount: t.errorCount,
    inputTokens: t.totalUsage.inputTokens,
    outputTokens: t.totalUsage.outputTokens,
    cachedInputTokens: t.totalUsage.cachedInputTokens ?? 0,
    reasoningTokens: t.totalUsage.reasoningTokens ?? 0,
    costUsd: t.costUsd,
  };
}

/**
 * Bulk export of traces as a downloadable file. Honours the same
 * `framework` / `status` / `sessionId` filters as the trace list, plus a
 * `limit` (default 1000, clamped server-side). `format=csv` (default) returns a
 * spreadsheet-friendly CSV; `format=json` returns the full trace objects
 * including token usage and attributes. A `Content-Disposition` header makes the
 * browser save it with a timestamped filename.
 */
export function createExportRouter(ctx: ApiContext): Router {
  const router = Router();

  router.get('/traces', (req, res) => {
    const format = req.query.format === 'json' ? 'json' : 'csv';
    const limit = parseLimit(req.query.limit);
    const framework = typeof req.query.framework === 'string' ? req.query.framework : undefined;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId : undefined;

    const traces = ctx.traces.export({ limit, framework, status, sessionId });
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="lookspan-traces-${stamp}.json"`);
      res.json({ exportedAt: new Date().toISOString(), count: traces.length, traces });
      return;
    }

    const csv = toCsv(CSV_COLUMNS, traces.map(toCsvRow));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="lookspan-traces-${stamp}.csv"`);
    res.send(csv);
  });

  return router;
}
