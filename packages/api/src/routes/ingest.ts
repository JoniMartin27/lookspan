import { Router } from 'express';
import type { ApiContext } from '../context.js';

export function createIngestRouter(ctx: ApiContext): Router {
  const router = Router();

  router.post('/', (req, res) => {
    try {
      const result = ctx.collector.ingest(req.body);
      res.status(result.rejected > 0 && result.accepted === 0 ? 400 : 200).json(result);
    } catch (err) {
      res.status(400).json({ error: 'invalid_payload', detail: (err as Error).message });
    }
  });

  return router;
}
