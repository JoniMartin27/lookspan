import { Router } from 'express';
import type { ApiContext } from '../context.js';

export function createCostsRouter(ctx: ApiContext): Router {
  const router = Router();

  router.get('/summary', (req, res) => {
    const since = typeof req.query.since === 'string' ? req.query.since : undefined;
    const until = typeof req.query.until === 'string' ? req.query.until : undefined;
    const framework = typeof req.query.framework === 'string' ? req.query.framework : undefined;
    res.json(ctx.costs.summary({ since, until, framework }));
  });

  return router;
}
