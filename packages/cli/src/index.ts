#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { createApp, createContext } from '@lookspan/api';
import {
  cutoffFrom,
  defaultDatabasePath,
  type LookspanDatabase,
  migrate,
  openDatabase,
  parseDuration,
  pruneOlderThan,
  vacuum,
} from '@lookspan/storage';

interface CliFlags {
  port: number;
  host: string;
  db: string;
  open: boolean;
  retentionMs: number | null;
}

function parseFlags(argv: string[]): CliFlags {
  const { values } = parseArgs({
    args: argv,
    allowPositionals: false,
    options: {
      port: { type: 'string', short: 'p' },
      host: { type: 'string' },
      db: { type: 'string' },
      retention: { type: 'string' },
      open: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
      version: { type: 'boolean', short: 'v', default: false },
    },
  });

  if (values.help) {
    printHelp();
    process.exit(0);
  }
  if (values.version) {
    console.log('lookspan 0.0.1');
    process.exit(0);
  }

  // Precedence: explicit flag > environment variable > built-in default.
  const retentionRaw = (values.retention as string) ?? process.env.LOOKSPAN_RETENTION;
  let retentionMs: number | null = null;
  if (retentionRaw) {
    retentionMs = parseDuration(retentionRaw);
    if (retentionMs === null) {
      console.error(`[lookspan] invalid --retention "${retentionRaw}" (use e.g. 7d, 24h, 30m)`);
      process.exit(1);
    }
  }

  return {
    port: Number(values.port ?? process.env.LOOKSPAN_PORT ?? '3100'),
    host: (values.host as string) ?? process.env.LOOKSPAN_HOST ?? '127.0.0.1',
    db: (values.db as string) ?? process.env.LOOKSPAN_DB ?? defaultDatabasePath(),
    open: Boolean(values.open),
    retentionMs,
  };
}

/**
 * Prune traces older than the retention window now, then on an hourly timer.
 * VACUUMs only when a prune actually deleted rows. Returns a stop() callback.
 */
function startRetention(db: LookspanDatabase, retentionMs: number): () => void {
  const prune = () => {
    const res = pruneOlderThan(db, cutoffFrom(retentionMs, Date.now()));
    if (res.deletedTraces > 0) {
      console.log(
        `[lookspan] retention: pruned ${res.deletedTraces} trace(s) before ${res.cutoff}`,
      );
      vacuum(db);
    }
  };
  prune();
  const interval = Math.min(retentionMs, 3_600_000); // at most hourly
  const timer = setInterval(prune, interval);
  timer.unref();
  return () => clearInterval(timer);
}

function printHelp(): void {
  console.log(`lookspan — local-first observability dashboard for AI agents

Usage:
  npx lookspan [options]

Options:
  -p, --port <port>     Port to listen on (default: 3100)
      --host <host>     Host to bind to (default: 127.0.0.1)
      --db <path>       SQLite database path (default: ~/.lookspan/lookspan.db)
      --retention <dur> Prune traces older than <dur> (e.g. 7d, 24h, 30m)
      --open            Open the dashboard in your browser
  -h, --help            Show this help
  -v, --version         Show version

Environment:
  LOOKSPAN_PORT         Same as --port
  LOOKSPAN_HOST         Same as --host
  LOOKSPAN_DB           Same as --db
  LOOKSPAN_RETENTION    Same as --retention

Quick start:
  npx lookspan
  → http://127.0.0.1:3100
`);
}

/**
 * Locate the built dashboard (`apps/dashboard/dist`). Honors
 * LOOKSPAN_DASHBOARD_DIR, otherwise walks up from this module looking for the
 * monorepo's `apps/dashboard/dist/index.html`. Returns null if not built yet.
 */
function findDashboardDir(): string | null {
  const fromEnv = process.env.LOOKSPAN_DASHBOARD_DIR;
  if (fromEnv) return existsSync(join(fromEnv, 'index.html')) ? fromEnv : null;

  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    const candidate = join(dir, 'apps', 'dashboard', 'dist');
    if (existsSync(join(candidate, 'index.html'))) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function main(): void {
  const flags = parseFlags(process.argv.slice(2));

  const db = openDatabase({ path: flags.db });
  const result = migrate(db);
  if (result.applied.length > 0) {
    console.log(`[lookspan] migrations applied: ${result.applied.join(', ')}`);
  }

  const ctx = createContext(db);
  const dashboardDir = findDashboardDir();
  const app = createApp({ context: ctx, dashboardDir: dashboardDir ?? undefined });
  const stopRetention = flags.retentionMs ? startRetention(db, flags.retentionMs) : null;

  const server = app.listen(flags.port, flags.host, () => {
    const url = `http://${flags.host}:${flags.port}`;
    console.log(`\n  Lookspan running at ${url}`);
    console.log(`  Database: ${flags.db}`);
    if (flags.retentionMs) {
      console.log(`  Retention: pruning traces older than ${flags.retentionMs / 86_400_000}d`);
    }
    if (!dashboardDir) {
      console.log('  (dashboard not built — run `npm run build` to serve the UI)');
    }
    console.log(`  Press Ctrl+C to stop\n`);
    if (flags.open) {
      void openInBrowser(url);
    }
  });

  const shutdown = (signal: string) => {
    console.log(`\n[lookspan] received ${signal}, shutting down`);
    stopRetention?.();
    server.close(() => {
      db.close();
      process.exit(0);
    });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

async function openInBrowser(url: string): Promise<void> {
  const { spawn } = await import('node:child_process');
  const platform = process.platform;
  const cmd = platform === 'darwin' ? 'open' : platform === 'win32' ? 'start' : 'xdg-open';
  const args = platform === 'win32' ? ['', url] : [url];
  spawn(cmd, args, { detached: true, stdio: 'ignore', shell: platform === 'win32' }).unref();
}

main();
