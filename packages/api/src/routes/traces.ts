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
    res.json({ trace, spans });
  });

  return router;
}
