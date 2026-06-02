import { Router } from 'express';
import type { ApiContext } from '../context.js';

export function createScoresRouter(ctx: ApiContext): Router {
  const router = Router();

  // Average value per score name across all traces.
  router.get('/summary', (_req, res) => {
    res.json({ items: ctx.scores.averages() });
  });

  return router;
}
