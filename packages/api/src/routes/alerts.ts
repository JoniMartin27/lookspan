import { Router } from 'express';
import type { ApiContext } from '../context.js';
import { parseLimit } from './query.js';

export function createAlertsRouter(ctx: ApiContext): Router {
  const router = Router();

  router.get('/', (req, res) => {
    const limit = parseLimit(req.query.limit);
    res.json({ items: ctx.alerts.list({ limit }) });
  });

  return router;
}
