#!/usr/bin/env node
// One-shot backfill: replay inferbench's stored benchmark runs into lookspan.
// Mirrors inferbench/backend/core/lookspan.py::build_spans so the backfilled
// traces are identical to what the live exporter would have produced.
// Idempotent: skips run_ids already present in lookspan (same traceId).
const INFERBENCH = process.env.INFERBENCH_URL || 'http://127.0.0.1:7777';
const LOOKSPAN = process.env.LOOKSPAN_URL || 'http://127.0.0.1:3100';

import { randomUUID } from 'node:crypto';

const sid = () => randomUUID().replace(/-/g, '').slice(0, 16);
const iso = (sec) => new Date(sec * 1000).toISOString().replace('.000Z', 'Z');

function buildSpans(run, model, quant, results, startedTs, endedTs) {
  const anyOk = results.some((r) => !r.error);
  const anyErr = results.some((r) => r.error);
  const rootId = sid();
  const root = {
    traceId: run.id,
    spanId: rootId,
    parentSpanId: null,
    type: 'custom',
    name: `benchmark ${model} · ${run.engine} (${quant})`,
    startedAt: iso(startedTs),
    endedAt: iso(endedTs),
    status: anyErr && !anyOk ? 'error' : 'ok',
    framework: 'inferbench',
    model,
    provider: run.engine,
    attributes: { quant, prompts: results.length, backfilled: true },
  };
  const spans = [root];
  const dur = (r) => {
    const tps = r.tps || 0;
    const toks = r.ctx_used || 0;
    return Math.max((r.ttft_ms || 0) / 1000 + (tps ? toks / tps : 0), 0.01);
  };
  const total = results.reduce((a, r) => a + dur(r), 0);
  let cursor = Math.max(startedTs, endedTs - total);
  for (const r of results) {
    const d = dur(r);
    const err = r.error || '';
    spans.push({
      traceId: run.id,
      spanId: sid(),
      parentSpanId: rootId,
      type: 'llm_call',
      name: `${r.prompt_id ?? '?'} · ${model}`,
      startedAt: iso(cursor),
      endedAt: iso(cursor + d),
      status: err ? 'error' : 'ok',
      framework: 'inferbench',
      model: r.model_id || model,
      provider: run.engine,
      input: { prompt_id: r.prompt_id ?? null },
      output: (r.raw_output || '').slice(0, 2000) || null,
      error: err ? { message: err } : null,
      usage: {
        inputTokens: 0,
        outputTokens: Math.trunc(r.ctx_used || 0),
        costUsd: Number(r.cost || 0),
      },
      attributes: {
        ttft_ms: r.ttft_ms ?? null,
        tps: r.tps ?? null,
        vram_gb: r.vram_gb ?? null,
        ram_gb: r.ram_gb ?? null,
        quality: r.quality ?? null,
        prompt_id: r.prompt_id ?? null,
        quant,
      },
    });
    cursor += d;
  }
  return spans;
}

const j = async (u, o) => {
  const res = await fetch(u, o);
  if (!res.ok) throw new Error(`${u} -> ${res.status}`);
  return res.json();
};

const existing = new Set(
  (await j(`${LOOKSPAN}/api/traces?limit=1000`)).items.map((t) => t.traceId),
);
const runs = await j(`${INFERBENCH}/api/history`);
const todo = runs.filter((r) => r.status === 'done' && !existing.has(r.id));
console.log(
  `inferbench runs: ${runs.length} · ya en lookspan: ${existing.size} · a backfillear: ${todo.length}`,
);

let ok = 0;
let skip = 0;
let fail = 0;
for (const run of todo) {
  try {
    const detail = await j(`${INFERBENCH}/api/history/${run.id}`);
    const results = detail.results || [];
    if (results.length === 0) {
      skip++;
      continue;
    }
    let opts = {};
    try {
      opts = JSON.parse(run.opts_json || '{}');
    } catch {}
    const model = opts.model || results[0].model_id || 'unknown';
    const quant = opts.quant || 'unknown';
    const endedTs = run.ts;
    const spans = buildSpans(run, model, quant, results, endedTs, endedTs);
    const r = await j(`${LOOKSPAN}/api/ingest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ spans, source: 'inferbench-backfill', sentAt: iso(endedTs) }),
    });
    ok++;
    process.stdout.write(
      `\r  ${ok}/${todo.length} ${run.id} (${model}/${quant}, ${r.accepted} spans)   `,
    );
  } catch (e) {
    fail++;
    console.error(`\n  ! ${run.id}: ${e.message}`);
  }
}
console.log(`\nBackfill listo: ${ok} runs enviadas, ${skip} sin results, ${fail} fallos.`);
