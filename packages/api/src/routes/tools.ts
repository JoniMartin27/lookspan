import { Router } from 'express';
import type { ApiContext } from '../context.js';
import { parseLimit } from './query.js';

export function createToolsRouter(ctx: ApiContext): Router {
  const router = Router();

  router.get('/', (req, res) => {
    const limit = parseLimit(req.query.limit);
    const framework = typeof req.query.framework === 'string' ? req.query.framework : undefined;
    res.json({ items: ctx.spans.listRecentToolCalls(limit, framework) });
  });

  return router;
}
