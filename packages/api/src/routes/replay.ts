import { computeCostUsd } from '@lookspan/collector';
import type { Span } from '@lookspan/types';
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

/** Pick the LLM span to replay/judge: explicit id, else the first llm_call with a captured input. */
function pickLlmSpan(spans: Span[], spanId?: string): Span | null {
  if (spanId) return spans.find((s) => s.spanId === spanId) ?? null;
  const withInput = spans.filter((s) => s.input && Object.keys(s.input).length > 0);
  return (
    withInput.find((s) => s.type === 'llm_call' && s.model) ??
    withInput.find((s) => s.model) ??
    withInput[0] ??
    null
  );
}

export function createReplayRouter(ctx: ApiContext): Router {
  const router = Router();

  // List past replays for a trace.
  router.get('/:id/replays', (req, res) => {
    const id = req.params.id;
    if (!id || !ctx.traces.getById(id)) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.json({ items: ctx.replays.listByTrace(id) });
  });

  // Re-run a trace's captured prompt against the same or a different model.
  router.post('/:id/replay', async (req, res) => {
    const id = req.params.id;
    if (!id || !ctx.traces.getById(id)) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const spanId = typeof body.spanId === 'string' ? body.spanId : undefined;
    const span = pickLlmSpan(ctx.spans.listByTrace(id), spanId);
    if (!span?.input || Object.keys(span.input).length === 0) {
      res.status(400).json({
        error: 'no_replayable_span',
        detail: 'no LLM span with a captured prompt; enable captureContent in the SDK',
      });
      return;
    }

    const replayModel =
      typeof body.model === 'string' && body.model ? body.model : (span.model ?? undefined);
    if (!replayModel) {
      res.status(400).json({ error: 'invalid', detail: 'no model to replay (pass { model })' });
      return;
    }
    const recorded = typeof body.provider === 'string' ? body.provider : span.provider;
    const provider = resolveProvider(replayModel, recorded);
    if (!provider) {
      res.status(400).json({
        error: 'unknown_provider',
        detail: `cannot map model "${replayModel}" to a provider`,
      });
      return;
    }

    let apiKey: string;
    try {
      apiKey = keyFor(provider, ctx.inferenceKeys);
    } catch (err) {
      if (err instanceof MissingKeyError) {
        res.status(400).json({
          error: 'no_api_key',
          detail: `set LOOKSPAN_${provider.toUpperCase()}_API_KEY to enable replay`,
        });
        return;
      }
      throw err;
    }

    const startedAt = Date.now();
    const base = {
      traceId: id,
      spanId: span.spanId,
      provider,
      originalModel: span.model ?? null,
      replayModel,
      originalOutput: span.output ?? null,
      originalCostUsd: span.usage?.costUsd ?? null,
      originalDurationMs: span.durationMs,
    };

    try {
      const result = await runChat({ provider, model: replayModel, apiKey, params: span.input });
      const durationMs = Date.now() - startedAt;
      const costUsd = computeCostUsd(result.model, result.usage);
      const replay = ctx.replays.insert(
        {
          ...base,
          status: 'ok',
          output: result.text,
          error: null,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          costUsd,
          durationMs,
        },
        new Date().toISOString(),
      );
      res.status(201).json({ replay });
    } catch (err) {
      const replay = ctx.replays.insert(
        {
          ...base,
          status: 'error',
          output: null,
          error: (err as Error).message,
          inputTokens: null,
          outputTokens: null,
          costUsd: null,
          durationMs: Date.now() - startedAt,
        },
        new Date().toISOString(),
      );
      res.status(201).json({ replay });
    }
  });

  // LLM-as-judge: score a trace's input/output against a rubric and store it.
  router.post('/:id/judge', async (req, res) => {
    const id = req.params.id;
    if (!id || !ctx.traces.getById(id)) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    const span = pickLlmSpan(ctx.spans.listByTrace(id));
    if (!span?.input || !span.output) {
      res.status(400).json({
        error: 'no_content_to_judge',
        detail: 'need a captured prompt and output; enable captureContent in the SDK',
      });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const metric =
      typeof body.metric === 'string' && body.metric.trim() ? body.metric.trim() : 'quality';
    const rubric =
      typeof body.rubric === 'string' && body.rubric.trim()
        ? body.rubric.trim()
        : `Rate the overall ${metric} of the assistant's response to the user's request.`;

    const bodyProvider = typeof body.provider === 'string' ? body.provider.toLowerCase() : '';
    let provider: Provider | null =
      bodyProvider === 'openai' || bodyProvider === 'anthropic' ? bodyProvider : null;
    if (!provider)
      provider = ctx.inferenceKeys.openai
        ? 'openai'
        : ctx.inferenceKeys.anthropic
          ? 'anthropic'
          : null;
    if (!provider) {
      res.status(400).json({
        error: 'no_api_key',
        detail: 'set LOOKSPAN_OPENAI_API_KEY or LOOKSPAN_ANTHROPIC_API_KEY to enable the judge',
      });
      return;
    }
    const model =
      typeof body.model === 'string' && body.model ? body.model : defaultJudgeModel(provider);

    let apiKey: string;
    try {
      apiKey = keyFor(provider, ctx.inferenceKeys);
    } catch (err) {
      if (err instanceof MissingKeyError) {
        res.status(400).json({
          error: 'no_api_key',
          detail: `set LOOKSPAN_${provider.toUpperCase()}_API_KEY to enable the judge`,
        });
        return;
      }
      throw err;
    }

    const system = JUDGE_SYSTEM;
    const user = buildJudgeUser({ rubric, input: span.input, output: span.output });

    try {
      const verdict = await runJudge({ provider, model, apiKey, system, user });
      const parsed = parseVerdict(verdict.raw);
      if (!parsed) {
        res.status(502).json({ error: 'judge_unparseable', detail: verdict.raw.slice(0, 500) });
        return;
      }
      const score = ctx.scores.insert(
        {
          traceId: id,
          name: metric,
          value: parsed.score,
          comment: parsed.rationale || null,
          source: 'llm-judge',
        },
        new Date().toISOString(),
      );
      res.status(201).json({ score, judge: { provider, model: verdict.model } });
    } catch (err) {
      res.status(502).json({ error: 'judge_failed', detail: (err as Error).message });
    }
  });

  return router;
}
