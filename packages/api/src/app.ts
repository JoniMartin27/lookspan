import cors from 'cors';
import express, { type Express } from 'express';
import type { ApiContext } from './context.js';
import { createCostsRouter } from './routes/costs.js';
import { createHealthRouter } from './routes/health.js';
import { createIngestRouter } from './routes/ingest.js';
import { createStreamRouter } from './routes/stream.js';
import { createTracesRouter } from './routes/traces.js';

export interface CreateAppOptions {
  context: ApiContext;
  corsOrigin?: string | string[] | boolean;
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

  app.use((_req, res) => {
    res.status(404).json({ error: 'not_found' });
  });

  return app;
}
