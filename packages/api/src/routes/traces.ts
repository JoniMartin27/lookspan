import { Router } from 'express';
import type { ApiContext } from '../context.js';

export function createTracesRouter(ctx: ApiContext): Router {
  const router = Router();

  router.get('/', (req, res) => {
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
    const framework = typeof req.query.framework === 'string' ? req.query.framework : undefined;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId : undefined;
    const items = ctx.traces.list({ limit, cursor, framework, status, sessionId });
    res.json({ items });
  });

  router.get('/:id', (req, res) => {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: 'missing_id' });
      return;
    }
    const trace = ctx.traces.getById(id);
    if (!trace) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    const spans = ctx.spans.listByTrace(id);
    const scores = ctx.scores.listByTrace(id);
    res.json({ trace, spans, scores });
  });

  // Attach an evaluation score to a trace (LLM-as-judge, assertion, human…).
  router.post('/:id/scores', (req, res) => {
    const id = req.params.id;
    if (!id || !ctx.traces.getById(id)) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (typeof body.name !== 'string' || !body.name) {
      res.status(400).json({ error: 'invalid', detail: 'name must be a non-empty string' });
      return;
    }
    if (typeof body.value !== 'number' || !Number.isFinite(body.value)) {
      res.status(400).json({ error: 'invalid', detail: 'value must be a number' });
      return;
    }
    const score = ctx.scores.insert(
      {
        traceId: id,
        name: body.name,
        value: body.value,
        comment: typeof body.comment === 'string' ? body.comment : null,
        source: typeof body.source === 'string' ? body.source : null,
      },
      new Date().toISOString(),
    );
    res.status(201).json({ score });
  });

  return router;
}
