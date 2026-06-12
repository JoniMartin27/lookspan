import type { Trace } from '@lookspan/types';

/** Provenance block shared by JSON and HTML audit exports. */
export interface ExportProvenance {
  tool: 'lookspan';
  version: string;
  exportedAt: string;
  filters: Record<string, string>;
  count: number;
  truncated: boolean;
  totalAvailable: number;
  sha256: string;
}

/** HTML-escape a string for safe interpolation into the report body. */
function esc(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtNum(n: number): string {
  return n.toLocaleString('en-US');
}

function fmtUsd(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
}

function pct(part: number, whole: number): string {
  if (whole === 0) return '0.0%';
  return `${((part / whole) * 100).toFixed(1)}%`;
}

/** A single labelled bar value for the hand-rolled SVG bar charts. */
interface BarDatum {
  label: string;
  value: number;
  display?: string;
}

/**
 * Render a minimal, dependency-free horizontal-bar SVG chart. No external CSS,
 * no JS — safe to inline in a self-contained, printable report.
 */
function barChartSvg(title: string, data: BarDatum[], color: string): string {
  if (data.length === 0) {
    return `<div class="chart"><h3>${esc(title)}</h3><p class="empty">No data</p></div>`;
  }
  const max = Math.max(...data.map((d) => d.value), 1);
  const rowH = 26;
  const gap = 8;
  const labelW = 130;
  const barW = 360;
  const width = labelW + barW + 70;
  const height = data.length * (rowH + gap) + gap;
  const rows = data
    .map((d, i) => {
      const y = gap + i * (rowH + gap);
      const w = Math.max(1, (d.value / max) * barW);
      const display = d.display ?? fmtNum(d.value);
      return `
      <text x="0" y="${y + rowH / 2 + 4}" class="lbl">${esc(d.label)}</text>
      <rect x="${labelW}" y="${y}" width="${w}" height="${rowH}" rx="3" fill="${color}" />
      <text x="${labelW + w + 6}" y="${y + rowH / 2 + 4}" class="val">${esc(display)}</text>`;
    })
    .join('');
  return `<div class="chart"><h3>${esc(title)}</h3>
    <svg viewBox="0 0 ${width} ${height}" width="100%" role="img" aria-label="${esc(title)}">
      ${rows}
    </svg></div>`;
}

/** Render a status breakdown as a simple SVG donut. */
function donutSvg(title: string, segments: { label: string; value: number; color: string }[]): string {
  const total = segments.reduce((s, x) => s + x.value, 0);
  if (total === 0) {
    return `<div class="chart"><h3>${esc(title)}</h3><p class="empty">No data</p></div>`;
  }
  const cx = 80;
  const cy = 80;
  const r = 60;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const rings = segments
    .filter((s) => s.value > 0)
    .map((s) => {
      const frac = s.value / total;
      const dash = frac * c;
      const ring = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s.color}" stroke-width="24" stroke-dasharray="${dash} ${c - dash}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${cx} ${cy})" />`;
      offset += dash;
      return ring;
    })
    .join('');
  const legend = segments
    .map(
      (s) =>
        `<div class="leg"><span class="sw" style="background:${s.color}"></span>${esc(s.label)} — ${fmtNum(s.value)} (${pct(s.value, total)})</div>`,
    )
    .join('');
  return `<div class="chart"><h3>${esc(title)}</h3>
    <div class="donut-wrap">
      <svg viewBox="0 0 160 160" width="160" height="160" role="img" aria-label="${esc(title)}">
        ${rings}
        <text x="${cx}" y="${cy + 5}" text-anchor="middle" class="donut-total">${fmtNum(total)}</text>
      </svg>
      <div class="legend">${legend}</div>
    </div></div>`;
}

const COLUMN_LABELS: Record<string, string> = {
  traceId: 'traceId',
  rootName: 'rootName',
  framework: 'framework',
  agentId: 'agentId',
  sessionId: 'sessionId',
  parentTraceId: 'parentTraceId',
  startedAt: 'startedAt',
  endedAt: 'endedAt',
  durationMs: 'durationMs',
  status: 'status',
  spanCount: 'spanCount',
  errorCount: 'errorCount',
  inputTokens: 'inputTokens',
  outputTokens: 'outputTokens',
  cachedInputTokens: 'cachedInputTokens',
  reasoningTokens: 'reasoningTokens',
  costUsd: 'costUsd',
};

/**
 * Build a self-contained, printable HTML audit report from the export set.
 * Zero client dependencies (no CDN, no external CSS/JS); all charts are
 * hand-drawn inline SVG. Columns mirror the CSV export exactly.
 */
export function renderHtmlReport(
  traces: Trace[],
  rows: readonly Record<string, unknown>[],
  columns: readonly string[],
  provenance: ExportProvenance,
): string {
  const total = traces.length;
  const errorCount = traces.filter((t) => t.status === 'error').length;
  const cancelledCount = traces.filter((t) => t.status === 'cancelled').length;
  const okCount = traces.filter((t) => t.status === 'ok').length;
  const otherCount = total - errorCount - cancelledCount - okCount;
  const totalCost = traces.reduce((s, t) => s + (t.costUsd ?? 0), 0);
  const tokensIn = traces.reduce((s, t) => s + (t.totalUsage.inputTokens ?? 0), 0);
  const tokensOut = traces.reduce((s, t) => s + (t.totalUsage.outputTokens ?? 0), 0);

  // (a) traces per day
  const perDay = new Map<string, number>();
  for (const t of traces) {
    const day = t.startedAt.slice(0, 10);
    perDay.set(day, (perDay.get(day) ?? 0) + 1);
  }
  const perDayData: BarDatum[] = [...perDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, value]) => ({ label, value }));

  // (b) cost per framework
  const perFw = new Map<string, number>();
  for (const t of traces) {
    perFw.set(t.framework, (perFw.get(t.framework) ?? 0) + (t.costUsd ?? 0));
  }
  const perFwData: BarDatum[] = [...perFw.entries()]
    .sort(([, a], [, b]) => b - a)
    .map(([label, value]) => ({ label, value, display: fmtUsd(value) }));

  // (d) tokens in vs out
  const tokenData: BarDatum[] = [
    { label: 'input', value: tokensIn },
    { label: 'output', value: tokensOut },
  ];

  const filtersStr =
    Object.keys(provenance.filters).length > 0
      ? Object.entries(provenance.filters)
          .map(([k, v]) => `${esc(k)}=${esc(v)}`)
          .join(', ')
      : 'none';

  const truncBanner = provenance.truncated
    ? `<div class="trunc">⚠ Truncated export — showing ${fmtNum(total)} of ${fmtNum(provenance.totalAvailable)} matching traces. Raise <code>?limit=</code> to widen.</div>`
    : '';

  const tableHead = columns.map((c) => `<th>${esc(COLUMN_LABELS[c] ?? c)}</th>`).join('');
  const tableBody = rows
    .map(
      (row) =>
        `<tr>${columns.map((c) => `<td>${esc(row[c])}</td>`).join('')}</tr>`,
    )
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Lookspan audit export — ${esc(provenance.exportedAt)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { font: 14px/1.5 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1a1a1a; background: #fff; margin: 0; padding: 2rem; }
  h1 { font-size: 1.5rem; margin: 0 0 0.25rem; }
  h2 { font-size: 1.1rem; margin: 2rem 0 0.75rem; border-bottom: 1px solid #ddd; padding-bottom: 0.25rem; }
  h3 { font-size: 0.95rem; margin: 0 0 0.5rem; }
  .prov { background: #f6f8fa; border: 1px solid #e1e4e8; border-radius: 6px; padding: 0.75rem 1rem; font-size: 0.85rem; margin: 1rem 0; }
  .prov dl { display: grid; grid-template-columns: max-content 1fr; gap: 0.15rem 1rem; margin: 0; }
  .prov dt { font-weight: 600; color: #57606a; }
  .prov dd { margin: 0; font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace; word-break: break-all; }
  .trunc { background: #fff8e1; border: 1px solid #f0c36d; border-radius: 6px; padding: 0.6rem 1rem; margin: 1rem 0; color: #7a5c00; }
  .cards { display: flex; flex-wrap: wrap; gap: 0.75rem; margin: 1rem 0; }
  .card { flex: 1 1 130px; background: #f6f8fa; border: 1px solid #e1e4e8; border-radius: 6px; padding: 0.75rem 1rem; }
  .card .n { font-size: 1.4rem; font-weight: 700; }
  .card .k { font-size: 0.75rem; color: #57606a; text-transform: uppercase; letter-spacing: 0.03em; }
  .charts { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin: 1rem 0; }
  .chart svg { max-width: 100%; }
  .chart .lbl { font-size: 12px; fill: #24292f; }
  .chart .val { font-size: 11px; fill: #57606a; }
  .empty { color: #999; font-style: italic; }
  .donut-wrap { display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; }
  .donut-total { font-size: 18px; font-weight: 700; fill: #24292f; }
  .legend { font-size: 0.8rem; }
  .leg { display: flex; align-items: center; gap: 0.4rem; margin: 0.2rem 0; }
  .sw { width: 12px; height: 12px; border-radius: 2px; display: inline-block; }
  table { border-collapse: collapse; width: 100%; font-size: 0.78rem; margin-top: 0.5rem; }
  th, td { border: 1px solid #e1e4e8; padding: 0.3rem 0.5rem; text-align: left; white-space: nowrap; }
  th { background: #f6f8fa; position: sticky; top: 0; }
  .table-wrap { overflow-x: auto; }
  footer { margin-top: 2rem; padding-top: 1rem; border-top: 1px solid #ddd; font-size: 0.75rem; color: #57606a; }
  footer code { font-family: ui-monospace, Consolas, monospace; word-break: break-all; }
  @media print { body { padding: 0; } th { position: static; } .charts { grid-template-columns: 1fr 1fr; } }
</style>
</head>
<body>
  <h1>Lookspan — trace audit export</h1>
  <div class="prov">
    <dl>
      <dt>tool</dt><dd>${esc(provenance.tool)} v${esc(provenance.version)}</dd>
      <dt>exported at</dt><dd>${esc(provenance.exportedAt)}</dd>
      <dt>filters</dt><dd>${filtersStr}</dd>
      <dt>count</dt><dd>${fmtNum(provenance.count)}</dd>
      <dt>total available</dt><dd>${fmtNum(provenance.totalAvailable)}</dd>
      <dt>truncated</dt><dd>${provenance.truncated ? 'true' : 'false'}</dd>
      <dt>sha256 (CSV)</dt><dd>${esc(provenance.sha256)}</dd>
    </dl>
  </div>
  ${truncBanner}

  <h2>Summary</h2>
  <div class="cards">
    <div class="card"><div class="n">${fmtNum(total)}</div><div class="k">Traces</div></div>
    <div class="card"><div class="n">${pct(errorCount, total)}</div><div class="k">Error rate</div></div>
    <div class="card"><div class="n">${pct(cancelledCount, total)}</div><div class="k">Cancelled</div></div>
    <div class="card"><div class="n">${fmtUsd(totalCost)}</div><div class="k">Total cost</div></div>
    <div class="card"><div class="n">${fmtNum(tokensIn)}</div><div class="k">Tokens in</div></div>
    <div class="card"><div class="n">${fmtNum(tokensOut)}</div><div class="k">Tokens out</div></div>
  </div>

  <h2>Charts</h2>
  <div class="charts">
    ${barChartSvg('Traces per day', perDayData, '#4c78a8')}
    ${barChartSvg('Cost per framework', perFwData, '#54a24b')}
    ${donutSvg('Status breakdown', [
      { label: 'ok', value: okCount, color: '#54a24b' },
      { label: 'error', value: errorCount, color: '#e45756' },
      { label: 'cancelled', value: cancelledCount, color: '#b279a2' },
      ...(otherCount > 0 ? [{ label: 'other', value: otherCount, color: '#9d9d9d' }] : []),
    ])}
    ${barChartSvg('Tokens in vs out', tokenData, '#f58518')}
  </div>

  <h2>Traces (${fmtNum(total)})</h2>
  <div class="table-wrap">
    <table>
      <thead><tr>${tableHead}</tr></thead>
      <tbody>
${tableBody}
      </tbody>
    </table>
  </div>

  <footer>
    Generated by ${esc(provenance.tool)} v${esc(provenance.version)} at ${esc(provenance.exportedAt)}.
    Evidence integrity — SHA-256 of the equivalent CSV body:
    <code>${esc(provenance.sha256)}</code>.
    This report is metadata-only; trace attributes are redacted by default (GDPR art. 5/32).
  </footer>
</body>
</html>`;
}
