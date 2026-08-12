import { IngestValidationError } from '@lookspan/collector';
import { Router } from 'express';
import type { ApiContext } from '../context.js';

export function createIngestRouter(ctx: ApiContext): Router {
  const router = Router();

  router.post('/', (req, res) => {
    try {
      const result = ctx.collector.ingest(req.body);
      res.status(result.rejected > 0 && result.accepted === 0 ? 400 : 200).json(result);
    } catch (err) {
      // Only a malformed payload is the caller's fault. Anything else — a
      // storage failure, a bug — must not come back as 400: exporters treat
      // 4xx as "don't retry" and would drop the batch on the floor.
      if (err instanceof IngestValidationError) {
        res.status(400).json({ error: 'invalid_payload', detail: err.message });
        return;
      }
      console.error('[lookspan] ingest failed:', err);
      res.status(500).json({ error: 'ingest_failed', detail: (err as Error).message });
    }
  });

  return router;
}
