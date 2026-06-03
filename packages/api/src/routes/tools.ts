import { Router } from 'express';
import type { ApiContext } from '../context.js';

export function createToolsRouter(ctx: ApiContext): Router {
  const router = Router();

  router.get('/', (req, res) => {
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const framework = typeof req.query.framework === 'string' ? req.query.framework : undefined;
    res.json({ items: ctx.spans.listRecentToolCalls(limit, framework) });
  });

  return router;
}
