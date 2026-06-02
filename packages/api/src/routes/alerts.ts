import { Router } from 'express';
import type { ApiContext } from '../context.js';

export function createAlertsRouter(ctx: ApiContext): Router {
  const router = Router();

  router.get('/', (req, res) => {
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    res.json({ items: ctx.alerts.list({ limit }) });
  });

  return router;
}
