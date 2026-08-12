import { createHash, timingSafeEqual } from 'node:crypto';
import cors from 'cors';
import express, { type Express } from 'express';
import type { ApiContext } from './context.js';
import { createAlertsRouter } from './routes/alerts.js';
import { createCostsRouter } from './routes/costs.js';
import { createDatasetsRouter, createRunsRouter } from './routes/datasets.js';
import { createExportRouter } from './routes/export.js';
import { createHealthRouter } from './routes/health.js';
import { createIngestRouter } from './routes/ingest.js';
import { createOtlpRouter } from './routes/otlp.js';
import { createReplayRouter } from './routes/replay.js';
import { createScoresRouter } from './routes/scores.js';
import { createSessionsRouter } from './routes/sessions.js';
import { createStatsRouter } from './routes/stats.js';
import { createStreamRouter } from './routes/stream.js';
import { createToolsRouter } from './routes/tools.js';
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
  /**
   * When set, every API/OTLP request (except `/api/health` and the dashboard
   * assets) must present `Authorization: Bearer <token>` or `?token=<token>`.
   * Intended for when the server is exposed beyond loopback. Unset = open,
   * which is fine on the default `127.0.0.1` bind.
   */
  authToken?: string;
}

/**
 * Compare two tokens without leaking their contents through timing.
 *
 * Hashed first so both sides are the same length whatever was sent —
 * `timingSafeEqual` throws on a length mismatch, and the mismatch itself is
 * information. Over a LAN this is a small margin, but it costs one hash on a
 * path that already does far more work.
 */
function sameToken(provided: string, expected: string): boolean {
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
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
  // OTLP/HTTP exporters default to protobuf — accept it as a raw Buffer.
  app.use(express.raw({ type: 'application/x-protobuf', limit: '10mb' }));

  if (options.authToken) {
    const token = options.authToken;
    app.use((req, res, next) => {
      // Express routes case-insensitively by default, so `/API/traces` reaches
      // the traces router. This check has to match on the same terms or the
      // guard and the router disagree about what a path is — `GET /API/traces`
      // returned the whole database, and `POST /API/ingest` accepted writes.
      const path = req.path.toLowerCase();
      if (path === '/api/health') return next();
      if (!path.startsWith('/api') && !path.startsWith('/v1')) return next();
      const header = req.get('authorization');
      const bearer = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
      const provided =
        bearer ?? (typeof req.query.token === 'string' ? req.query.token : undefined);
      if (provided === undefined || !sameToken(provided, token)) {
        res.status(401).json({ error: 'unauthorized' });
        return;
      }
      next();
    });
  }

  app.use('/api/health', createHealthRouter());
  app.use('/api/traces', createTracesRouter(options.context));
  // Replay & LLM-as-judge live under /api/traces/:id/{replay,replays,judge}.
  app.use('/api/traces', createReplayRouter(options.context));
  app.use('/api/costs', createCostsRouter(options.context));
  app.use('/api/stats', createStatsRouter(options.context));
  app.use('/api/alerts', createAlertsRouter(options.context));
  app.use('/api/sessions', createSessionsRouter(options.context));
  app.use('/api/scores', createScoresRouter(options.context));
  app.use('/api/datasets', createDatasetsRouter(options.context));
  app.use('/api/runs', createRunsRouter(options.context));
  app.use('/api/tools', createToolsRouter(options.context));
  app.use('/api/export', createExportRouter(options.context));
  app.use('/api/ingest', createIngestRouter(options.context));
  app.use('/api/stream', createStreamRouter());

  // OpenTelemetry OTLP/HTTP trace receiver (default OTel endpoint path).
  app.use('/v1/traces', createOtlpRouter(options.context));

  // Unknown /api routes are always JSON — never fall through to the SPA.
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'not_found' });
  });

  if (options.dashboardDir) {
    const dashboardRoot = options.dashboardDir;
    app.use(express.static(dashboardRoot));
    // SPA fallback: serve index.html for client-side routes (GET/HEAD only).
    //
    // The file is addressed as `index.html` *relative to an explicit `root`*,
    // not as one absolute path. Express 5 hands an absolute `path` to `send`
    // with the request's own URL still in play and the send stream resolves it
    // to nothing — every deep link (`/traces/:id`, `/sessions`, `/connect`)
    // 404s on hard refresh even though the file is right there. Only `/` used
    // to work, because `express.static` served that one before the fallback.
    app.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      res.sendFile('index.html', { root: dashboardRoot }, (err) => {
        if (err) next();
      });
    });
  }

  app.use((_req, res) => {
    res.status(404).json({ error: 'not_found' });
  });

  return app;
}
