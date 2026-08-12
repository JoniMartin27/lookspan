import { randomUUID } from 'node:crypto';
import { computeCostUsd } from '@lookspan/collector';
import {
  type DatasetItemInput,
  MAX_DATASET_RUN_ITEMS,
  type RunStatus,
  runCoverage,
} from '@lookspan/types';
import { Router } from 'express';
import type { ApiContext } from '../context.js';
import {
  buildJudgeUser,
  defaultJudgeModel,
  JUDGE_SYSTEM,
  parseVerdict,
} from '../inference/judge.js';
import {
  keyFor,
  MissingKeyError,
  type Provider,
  resolveProvider,
  runChat,
  runJudge,
} from '../inference/provider.js';

// The cap lives in @lookspan/types so the dashboard can state it before the
// run rather than after — same reason DEFAULT_EXPORT_LIMIT moved there.
const MAX_ITEMS_PER_RUN = MAX_DATASET_RUN_ITEMS;

function coerceItem(raw: unknown): DatasetItemInput | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (!o.input || typeof o.input !== 'object') return null;
  return {
    input: o.input as Record<string, unknown>,
    expected: typeof o.expected === 'string' ? o.expected : null,
  };
}

export function createDatasetsRouter(ctx: ApiContext): Router {
  const router = Router();

  // Create a dataset.
  router.post('/', (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (typeof body.name !== 'string' || !body.name.trim()) {
      res.status(400).json({ error: 'invalid', detail: 'name must be a non-empty string' });
      return;
    }
    const id = `ds_${randomUUID().slice(0, 8)}`;
    const description = typeof body.description === 'string' ? body.description : null;
    const dataset = ctx.datasets.create(
      id,
      body.name.trim(),
      description,
      new Date().toISOString(),
    );
    res.status(201).json({ dataset });
  });

  // List datasets.
  router.get('/', (_req, res) => {
    res.json({ items: ctx.datasets.list() });
  });

  // Dataset detail: dataset + items + runs.
  router.get('/:id', (req, res) => {
    const id = req.params.id;
    const dataset = id ? ctx.datasets.get(id) : null;
    if (!dataset) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.json({
      dataset,
      items: ctx.datasets.listItems(id as string),
      runs: ctx.runs.listByDataset(id as string),
    });
  });

  // Add one item ({input, expected?}) or many ({items: [...]}).
  router.post('/:id/items', (req, res) => {
    const id = req.params.id;
    if (!id || !ctx.datasets.get(id)) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    // Accept one item ({input, expected?}) or a batch ({items: [...]}). If the
    // caller sends `items`, it must be an array — don't silently treat a
    // malformed `items` value as a single item.
    if ('items' in body && !Array.isArray(body.items)) {
      res.status(400).json({ error: 'invalid', detail: '`items` must be an array' });
      return;
    }
    const raw = Array.isArray(body.items) ? body.items : [body];
    const items = raw.map(coerceItem).filter((x): x is DatasetItemInput => x !== null);
    if (items.length === 0) {
      res.status(400).json({ error: 'invalid', detail: 'each item needs an `input` object' });
      return;
    }
    const created = ctx.datasets.addItems(id, items, new Date().toISOString());
    // Surface dropped items rather than swallowing them: a partial batch
    // succeeds, but the caller learns how many were skipped as invalid.
    res
      .status(201)
      .json({ items: created, received: raw.length, skipped: raw.length - items.length });
  });

  // Seed an item from an existing trace's captured prompt (+ output as expected).
  router.post('/:id/items/from-trace', (req, res) => {
    const id = req.params.id;
    if (!id || !ctx.datasets.get(id)) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const traceId = typeof body.traceId === 'string' ? body.traceId : '';
    if (!traceId || !ctx.traces.getById(traceId)) {
      res.status(404).json({ error: 'trace_not_found' });
      return;
    }
    const span = ctx.spans
      .listByTrace(traceId)
      .find((s) => s.input && Object.keys(s.input).length > 0 && s.model);
    if (!span?.input) {
      res.status(400).json({
        error: 'no_capturable_span',
        detail: 'that trace has no captured prompt; enable captureContent in the SDK',
      });
      return;
    }
    const item = ctx.datasets.addItem(
      id,
      { input: span.input, expected: span.output ?? null },
      new Date().toISOString(),
    );
    res.status(201).json({ item });
  });

  // Run the dataset against a model (batch replay + optional LLM judge per item).
  router.post('/:id/run', async (req, res) => {
    const id = req.params.id;
    if (!id || !ctx.datasets.get(id)) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    const allItems = ctx.datasets.listItems(id);
    if (allItems.length === 0) {
      res.status(400).json({ error: 'empty_dataset', detail: 'add items before running' });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const model = typeof body.model === 'string' && body.model ? body.model : '';
    if (!model) {
      res.status(400).json({ error: 'invalid', detail: 'model is required' });
      return;
    }
    const provider: Provider | null = resolveProvider(
      model,
      typeof body.provider === 'string' ? body.provider : undefined,
    );
    if (!provider) {
      res
        .status(400)
        .json({ error: 'unknown_provider', detail: `cannot map model "${model}" to a provider` });
      return;
    }

    let apiKey: string;
    try {
      apiKey = keyFor(provider, ctx.inferenceKeys);
    } catch (err) {
      if (err instanceof MissingKeyError) {
        res.status(400).json({
          error: 'no_api_key',
          detail: `set LOOKSPAN_${provider.toUpperCase()}_API_KEY to run datasets`,
        });
        return;
      }
      throw err;
    }

    const useJudge = body.judge === true;
    const metric =
      typeof body.metric === 'string' && body.metric.trim() ? body.metric.trim() : 'quality';
    const rubric =
      typeof body.rubric === 'string' && body.rubric.trim()
        ? body.rubric.trim()
        : `Rate the overall ${metric} of the assistant's response to the user's request.`;
    const judgeModel = defaultJudgeModel(provider);

    const coverage = runCoverage(allItems.length, MAX_ITEMS_PER_RUN);
    const items = allItems.slice(0, coverage.willRun);
    const run = ctx.runs.create(
      {
        datasetId: id,
        model,
        provider,
        status: 'running',
        itemCount: items.length,
        judgeMetric: useJudge ? metric : null,
      },
      new Date().toISOString(),
    );

    let okCount = 0;
    let errorCount = 0;
    let totalCost = 0;
    const scores: number[] = [];

    for (const item of items) {
      const startedAt = Date.now();
      try {
        const result = await runChat({ provider, model, apiKey, params: item.input });
        const durationMs = Date.now() - startedAt;
        const costUsd = computeCostUsd(result.model, result.usage);
        if (costUsd) totalCost += costUsd;

        let score: number | null = null;
        let rationale: string | null = null;
        if (useJudge) {
          const verdict = await runJudge({
            provider,
            model: judgeModel,
            apiKey,
            system: JUDGE_SYSTEM,
            user: buildJudgeUser({
              rubric,
              input: item.input,
              output: result.text,
              expected: item.expected,
            }),
          });
          const parsed = parseVerdict(verdict.raw);
          if (parsed) {
            score = parsed.score;
            rationale = parsed.rationale || null;
            scores.push(parsed.score);
          }
        }

        ctx.runs.insertRunItem(
          {
            runId: run.id,
            itemId: item.id,
            status: 'ok',
            output: result.text,
            error: null,
            costUsd,
            durationMs,
            score,
            rationale,
          },
          new Date().toISOString(),
        );
        okCount++;
      } catch (err) {
        ctx.runs.insertRunItem(
          {
            runId: run.id,
            itemId: item.id,
            status: 'error',
            output: null,
            error: (err as Error).message,
            costUsd: null,
            durationMs: Date.now() - startedAt,
            score: null,
            rationale: null,
          },
          new Date().toISOString(),
        );
        errorCount++;
      }
    }

    const avgScore = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
    const status: RunStatus = okCount === 0 ? 'error' : 'done';
    ctx.runs.finalize(run.id, {
      status,
      okCount,
      errorCount,
      totalCostUsd: okCount > 0 ? totalCost : null,
      avgScore,
    });

    res.status(201).json({
      run: ctx.runs.get(run.id),
      items: ctx.runs.listItems(run.id),
      truncated: coverage.skipped,
      // The dataset size, so a caller can say "100 of 150" without a second
      // request. `run.itemCount` is the capped number and reads as the total.
      totalItems: allItems.length,
    });
  });

  return router;
}

export function createRunsRouter(ctx: ApiContext): Router {
  const router = Router();
  router.get('/:id', (req, res) => {
    const runId = Number(req.params.id);
    const run = Number.isFinite(runId) ? ctx.runs.get(runId) : null;
    if (!run) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.json({ run, items: ctx.runs.listItems(runId) });
  });
  return router;
}
