import { createHash } from 'node:crypto';
import type { Trace } from '@lookspan/types';
import { Router } from 'express';
import type { ApiContext } from '../context.js';
import { toCsv } from './csv.js';
import { type ExportProvenance, renderHtmlReport } from './export-html.js';
import { parseLimit } from './query.js';
import { LOOKSPAN_VERSION } from './version.js';

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
 * Strip potentially-sensitive fields from a trace for the redacted (default)
 * JSON export. Per GDPR art. 5 (data minimisation) / art. 32 (security), free-form
 * `attributes` may carry personal data or secrets, so they are dropped unless the
 * caller explicitly opts in with `?raw=1`. The CSV is metadata-only and never
 * carries attributes, so it is unaffected.
 */
function redactTrace(t: Trace): Omit<Trace, 'attributes'> {
  const { attributes: _attributes, ...rest } = t;
  return rest;
}

/** SHA-256 hex digest of an exact string body (the CSV bytes), for integrity. */
function sha256Hex(body: string): string {
  return createHash('sha256').update(body, 'utf8').digest('hex');
}

/**
 * Bulk export of traces as a downloadable file. Honours the same
 * `framework` / `status` / `sessionId` filters as the trace list, plus a
 * `limit` (default 1000, clamped server-side).
 *
 * Formats:
 *  - `csv` (default) — RFC 4180 CSV, metadata-only, UTF-8 BOM, formula-injection
 *    safe. Provenance/integrity surfaced via response headers.
 *  - `json` — full trace objects with token usage. By default `attributes` are
 *    REDACTED (GDPR data-minimisation); pass `?raw=1` to include them in the
 *    clear. Includes a provenance + integrity block.
 *  - `html` — a self-contained, printable audit report (provenance header,
 *    summary cards, hand-drawn SVG charts, and the trace table).
 *
 * Provenance/integrity headers (csv) and fields (json/html): `exportedAt`,
 * applied filters, `count`, `truncated`, `totalAvailable`, `tool`, `version`
 * and the SHA-256 of the exact CSV body.
 */
export function createExportRouter(ctx: ApiContext): Router {
  const router = Router();

  router.get('/traces', (req, res) => {
    const format =
      req.query.format === 'json' ? 'json' : req.query.format === 'html' ? 'html' : 'csv';
    const raw = req.query.raw === '1' || req.query.raw === 'true';
    const limit = parseLimit(req.query.limit);
    const framework = typeof req.query.framework === 'string' ? req.query.framework : undefined;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId : undefined;

    const { traces, truncated, totalAvailable } = ctx.traces.export({
      limit,
      framework,
      status,
      sessionId,
    });
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const exportedAt = new Date().toISOString();

    // The CSV body is the canonical artefact whose hash we publish, so every
    // format reports the same integrity digest over the same bytes.
    const rows = traces.map(toCsvRow);
    const csv = toCsv(CSV_COLUMNS, rows);
    const sha256 = sha256Hex(csv);

    const filters: Record<string, string> = {};
    if (framework) filters.framework = framework;
    if (status) filters.status = status;
    if (sessionId) filters.sessionId = sessionId;

    const provenance: ExportProvenance = {
      tool: 'lookspan',
      version: LOOKSPAN_VERSION,
      exportedAt,
      filters,
      count: traces.length,
      truncated,
      totalAvailable,
      sha256,
    };

    // Common provenance/integrity headers on every format.
    res.setHeader('X-Lookspan-Export-Truncated', truncated ? 'true' : 'false');
    res.setHeader('X-Lookspan-Export-Sha256', sha256);
    res.setHeader('X-Lookspan-Export-Count', String(traces.length));

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="lookspan-traces-${stamp}.json"`);
      res.json({
        ...provenance,
        raw,
        traces: raw ? traces : traces.map(redactTrace),
      });
      return;
    }

    if (format === 'html') {
      const html = renderHtmlReport(traces, rows, CSV_COLUMNS, provenance);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="lookspan-traces-${stamp}.html"`);
      res.send(html);
      return;
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="lookspan-traces-${stamp}.csv"`);
    res.send(csv);
  });

  return router;
}
