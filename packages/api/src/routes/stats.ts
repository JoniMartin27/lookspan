import { Router } from 'express';
import type { ApiContext } from '../context.js';

export function createStatsRouter(ctx: ApiContext): Router {
  const router = Router();

  router.get('/', (req, res) => {
    const since = typeof req.query.since === 'string' ? req.query.since : undefined;
    const framework = typeof req.query.framework === 'string' ? req.query.framework : undefined;
    res.json(ctx.stats.summary({ since, framework }));
  });

  return router;
}
