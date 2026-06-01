import { otlpToIngest } from '@lookspan/collector';
import { Router } from 'express';
import type { ApiContext } from '../context.js';

/**
 * OTLP/HTTP trace receiver. Mounted at `/v1/traces` (the OpenTelemetry default
 * path) so an OTel exporter pointed at this server ingests with no extra SDK.
 * Accepts JSON `ExportTraceServiceRequest`; responds with the OTLP-style
 * `{ partialSuccess }` envelope.
 */
export function createOtlpRouter(ctx: ApiContext): Router {
  const router = Router();

  router.post('/', (req, res) => {
    try {
      const payload = otlpToIngest(req.body);
      const result = ctx.collector.ingest(payload);
      res.status(200).json({
        partialSuccess:
          result.rejected > 0
            ? { rejectedSpans: result.rejected, errorMessage: 'some spans were rejected' }
            : {},
      });
    } catch (err) {
      res.status(400).json({ error: 'invalid_otlp_payload', detail: (err as Error).message });
    }
  });

  return router;
}
