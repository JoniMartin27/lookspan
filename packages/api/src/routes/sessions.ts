import { Router } from 'express';
import type { ApiContext } from '../context.js';
import { parseLimit } from './query.js';

export function createSessionsRouter(ctx: ApiContext): Router {
  const router = Router();

  router.get('/', (req, res) => {
    const limit = parseLimit(req.query.limit);
    res.json({ items: ctx.traces.listSessions(limit) });
  });

  router.get('/:id', (req, res) => {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: 'missing_id' });
      return;
    }
    const session = ctx.traces.sessionSummary(id);
    if (!session) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    const traces = ctx.traces.list({ sessionId: id, limit: 500 });
    res.json({ session, traces });
  });

  return router;
}
