import { join } from 'node:path';
import cors from 'cors';
import express, { type Express } from 'express';
import type { ApiContext } from './context.js';
import { createCostsRouter } from './routes/costs.js';
import { createHealthRouter } from './routes/health.js';
import { createIngestRouter } from './routes/ingest.js';
import { createOtlpRouter } from './routes/otlp.js';
import { createStreamRouter } from './routes/stream.js';
import { createTracesRouter } from './routes/traces.js';

export interface CreateAppOptions {
  context: ApiContext;
  corsOrigin?: string | string[] | boolean;
  /**
   * Absolute path to the built dashboard (the Vite `dist/` directory). When
   * provided, the SPA is served at `/` and any non-`/api` route falls back to
   * its `index.html` so client-side routing works on hard refresh.
   */
  dashboardDir?: string;
}

export function createApp(options: CreateAppOptions): Express {
  const app = express();

  app.use(
    cors({
      origin: options.corsOrigin ?? true,
      credentials: false,
    }),
  );
  app.use(express.json({ limit: '10mb' }));

  app.use('/api/health', createHealthRouter());
  app.use('/api/traces', createTracesRouter(options.context));
  app.use('/api/costs', createCostsRouter(options.context));
  app.use('/api/ingest', createIngestRouter(options.context));
  app.use('/api/stream', createStreamRouter());

  // OpenTelemetry OTLP/HTTP trace receiver (default OTel endpoint path).
  app.use('/v1/traces', createOtlpRouter(options.context));

  // Unknown /api routes are always JSON — never fall through to the SPA.
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'not_found' });
  });

  if (options.dashboardDir) {
    const indexHtml = join(options.dashboardDir, 'index.html');
    app.use(express.static(options.dashboardDir));
    // SPA fallback: serve index.html for client-side routes (GET/HEAD only).
    app.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      res.sendFile(indexHtml, (err) => {
        if (err) next();
      });
    });
  }

  app.use((_req, res) => {
    res.status(404).json({ error: 'not_found' });
  });

  return app;
}
