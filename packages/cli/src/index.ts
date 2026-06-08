#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { createApp, createContext, type InferenceKeys } from '@lookspan/api';
import { parsePricingTable, setPricingTable } from '@lookspan/collector';
import { LookspanEventType, subscribe } from '@lookspan/events';
import {
  cutoffFrom,
  defaultDatabasePath,
  isPostgresTarget,
  type LookspanDatabase,
  migrate,
  openDatabase,
  parseDuration,
  pruneOlderThan,
  vacuum,
} from '@lookspan/storage';
import { AlertCondition, type AlertRule } from '@lookspan/types';

interface CliFlags {
  port: number;
  host: string;
  db: string;
  open: boolean;
  retentionMs: number | null;
  token: string | undefined;
  alertRules: AlertRule[];
  pricingFile: string | undefined;
  inferenceKeys: InferenceKeys;
}

function buildAlertRules(values: Record<string, unknown>): AlertRule[] {
  const rules: AlertRule[] = [];
  const numFromEnv = (flag: unknown, env: string | undefined): number | undefined => {
    const raw = (flag as string) ?? env;
    if (raw === undefined) return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  };

  if (values['alert-error'] || process.env.LOOKSPAN_ALERT_ERROR) {
    rules.push({ id: 'error', condition: AlertCondition.Error });
  }
  const cost = numFromEnv(values['alert-cost'], process.env.LOOKSPAN_ALERT_COST);
  if (cost !== undefined)
    rules.push({ id: 'cost', condition: AlertCondition.CostOver, threshold: cost });
  const tokens = numFromEnv(values['alert-tokens'], process.env.LOOKSPAN_ALERT_TOKENS);
  if (tokens !== undefined)
    rules.push({ id: 'tokens', condition: AlertCondition.TokensOver, threshold: tokens });
  const duration = numFromEnv(values['alert-duration'], process.env.LOOKSPAN_ALERT_DURATION);
  if (duration !== undefined)
    rules.push({ id: 'duration', condition: AlertCondition.DurationOver, threshold: duration });

  return rules;
}

/** Human-readable DB target for startup logs, with any Postgres password redacted. */
function describeDb(target: string): string {
  if (!isPostgresTarget(target)) return target;
  try {
    const url = new URL(target);
    if (url.password) url.password = '***';
    return `${url.toString()} (postgres)`;
  } catch {
    return 'postgres';
  }
}

/** Read the published package version at runtime (package.json sits next to dist). */
function readVersion(): string {
  for (const rel of ['../package.json', '../../package.json']) {
    try {
      const path = fileURLToPath(new URL(rel, import.meta.url));
      return (JSON.parse(readFileSync(path, 'utf8')) as { version?: string }).version ?? '0.0.0';
    } catch {
      /* try next */
    }
  }
  return '0.0.0';
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
      token: { type: 'string' },
      pricing: { type: 'string' },
      'openai-key': { type: 'string' },
      'anthropic-key': { type: 'string' },
      'alert-error': { type: 'boolean', default: false },
      'alert-cost': { type: 'string' },
      'alert-tokens': { type: 'string' },
      'alert-duration': { type: 'string' },
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
    console.log(`lookspan ${readVersion()}`);
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
    token: (values.token as string) ?? process.env.LOOKSPAN_TOKEN ?? undefined,
    alertRules: buildAlertRules(values),
    pricingFile: (values.pricing as string) ?? process.env.LOOKSPAN_PRICING ?? undefined,
    inferenceKeys: {
      openai: (values['openai-key'] as string) ?? process.env.LOOKSPAN_OPENAI_API_KEY ?? undefined,
      anthropic:
        (values['anthropic-key'] as string) ?? process.env.LOOKSPAN_ANTHROPIC_API_KEY ?? undefined,
    },
  };
}

/** Load a user pricing JSON file and install it as the active price table. */
function applyPricingFile(file: string): void {
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8'));
    const table = parsePricingTable(raw);
    setPricingTable(table);
    console.log(`[lookspan] pricing: loaded ${table.length} model(s) from ${file}`);
  } catch (err) {
    console.error(`[lookspan] failed to load pricing file "${file}": ${(err as Error).message}`);
    process.exit(1);
  }
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
      --db <path|url>   SQLite path (default: ~/.lookspan/lookspan.db) or a
                        Postgres connection string (postgres://… / postgresql://…)
      --retention <dur> Prune traces older than <dur> (e.g. 7d, 24h, 30m)
      --token <token>   Require Authorization: Bearer <token> on the API
      --pricing <file>  Load a custom model pricing table (JSON) to keep costs current
      --openai-key <k>      OpenAI key for Replay & LLM-as-judge (in-memory only)
      --anthropic-key <k>   Anthropic key for Replay & LLM-as-judge (in-memory only)
      --alert-error     Alert when a trace fails
      --alert-cost <usd>      Alert when a trace costs more than <usd>
      --alert-tokens <n>      Alert when a trace exceeds <n> tokens
      --alert-duration <ms>   Alert when a trace takes longer than <ms>
      --open            Open the dashboard in your browser
  -h, --help            Show this help
  -v, --version         Show version

Environment:
  LOOKSPAN_PORT         Same as --port
  LOOKSPAN_HOST         Same as --host
  LOOKSPAN_DB           Same as --db (SQLite path or postgres:// URL)
  LOOKSPAN_RETENTION    Same as --retention
  LOOKSPAN_TOKEN        Same as --token
  LOOKSPAN_PRICING      Same as --pricing
  LOOKSPAN_OPENAI_API_KEY / LOOKSPAN_ANTHROPIC_API_KEY   Enable Replay & LLM-as-judge
  LOOKSPAN_INFERENCE_TIMEOUT_MS    Replay/judge provider timeout (default: 60000)
  LOOKSPAN_INFERENCE_MAX_RETRIES   Replay/judge provider retries (default: 1)
  LOOKSPAN_ALERT_ERROR / _COST / _TOKENS / _DURATION   Same as --alert-*

  Full reference: docs/CONFIGURATION.md

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

  const here = dirname(fileURLToPath(import.meta.url));

  // Published layout: the dashboard is bundled next to the CLI as `public/`
  // (dist/index.js → ../public). Checked first so installs are self-contained.
  for (const bundled of [join(here, '..', 'public'), join(here, 'public')]) {
    if (existsSync(join(bundled, 'index.html'))) return bundled;
  }

  // Monorepo/dev layout: walk up to apps/dashboard/dist.
  let dir = here;
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

  if (flags.pricingFile) applyPricingFile(flags.pricingFile);

  const ctx = createContext(db, {
    alertRules: flags.alertRules,
    inferenceKeys: flags.inferenceKeys,
  });
  const dashboardDir = findDashboardDir();
  const app = createApp({
    context: ctx,
    dashboardDir: dashboardDir ?? undefined,
    authToken: flags.token,
  });
  const stopRetention = flags.retentionMs ? startRetention(db, flags.retentionMs) : null;

  let unsubscribeAlerts: (() => void) | null = null;
  if (flags.alertRules.length > 0) {
    unsubscribeAlerts = subscribe((event) => {
      if (event.type === LookspanEventType.AlertTriggered) {
        console.log(`\n  🔔 ALERT [${event.alert.condition}] ${event.alert.message}\n`);
      }
    });
  }

  const server = app.listen(flags.port, flags.host, () => {
    const url = `http://${flags.host}:${flags.port}`;
    console.log(`\n  Lookspan running at ${url}`);
    console.log(`  Database: ${describeDb(flags.db)}`);
    if (flags.retentionMs) {
      console.log(`  Retention: pruning traces older than ${flags.retentionMs / 86_400_000}d`);
    }
    if (flags.token) {
      console.log('  Auth: Bearer token required');
    }
    if (flags.alertRules.length > 0) {
      console.log(`  Alerts: ${flags.alertRules.map((r) => r.id).join(', ')}`);
    }
    const replayProviders = [
      flags.inferenceKeys.openai ? 'openai' : null,
      flags.inferenceKeys.anthropic ? 'anthropic' : null,
    ].filter(Boolean);
    if (replayProviders.length > 0) {
      console.log(`  Replay/judge: ${replayProviders.join(', ')}`);
    }
    const loopback =
      flags.host === '127.0.0.1' || flags.host === 'localhost' || flags.host === '::1';
    if (!loopback && !flags.token) {
      console.log(`  ⚠ Bound to ${flags.host} with no --token: the API is open to your network.`);
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
    unsubscribeAlerts?.();
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
