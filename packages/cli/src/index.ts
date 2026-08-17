#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bindsToLoopback, createApp, createContext } from '@lookspan/api';
import { parsePricingTable, setPricingTable } from '@lookspan/collector';
import { LookspanEventType, subscribe } from '@lookspan/events';
import {
  cutoffFrom,
  isPostgresTarget,
  type LookspanDatabase,
  migrate,
  openDatabase,
  pruneOlderThan,
  vacuum,
} from '@lookspan/storage';
import {
  APP_NAME,
  currentDesktopInput,
  installDesktop,
  isEphemeralInstall,
  supportedPlatform,
  uninstallDesktop,
} from './desktop.js';
import { type CliFlags, FlagError, parseFlags } from './flags.js';

/**
 * Human-readable DB target for startup logs, with any Postgres password
 * redacted.
 *
 * The password is redacted before the connection target is printed. A
 * postgres:// target is a real external connection; the in-memory dialect
 * harness is only selected by storage tests.
 */
function describeDb(target: string): string {
  if (!isPostgresTarget(target)) return target;
  try {
    const url = new URL(target);
    if (url.password) url.password = '***';
    return `${url.toString()} (external Postgres)`;
  } catch {
    return 'external Postgres';
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

Commands:
  install-desktop [options]   Add a one-click desktop launcher (Desktop + Start
                              Menu on Windows, ~/Applications on macOS, the app
                              menu on Linux). Any options given are baked in,
                              e.g. \`lookspan install-desktop --port 3200\`.
                              Needs a real install: \`npm install -g lookspan\`.
  uninstall-desktop           Remove it again.

Options:
  -p, --port <port>     Port to listen on (default: 3100)
      --host <host>     Host to bind to (default: 127.0.0.1)
      --db <path|url>   SQLite path (default: ~/.lookspan/lookspan.db) or a
                        Postgres connection string (postgres://… / postgresql://…)
      --retention <dur> Prune traces older than <dur> (e.g. 7d, 24h, 30m)
      --token <token>   Require Authorization: Bearer <token> on the API
      --cors-origin <o> Browser origins allowed to call the API (comma-separated).
                        Empty by default — the dashboard is same-origin and agents
                        post from outside a browser, so nothing normally needs this.
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
  LOOKSPAN_CORS_ORIGIN  Same as --cors-origin
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

/** Absolute path to this entrypoint — what a desktop shortcut has to invoke. */
function cliEntrypoint(): string {
  return fileURLToPath(import.meta.url);
}

/**
 * `lookspan install-desktop [flags]` / `uninstall-desktop`.
 *
 * Any flags after the subcommand are baked into the launcher, so
 * `install-desktop --port 3200 --retention 7d` gives you an icon that starts
 * Lookspan exactly that way. They're parsed here too, so a typo fails now
 * instead of silently producing an icon that does nothing when clicked.
 */
async function runDesktopCommand(command: string, rest: string[]): Promise<void> {
  if (!supportedPlatform(process.platform)) {
    console.error(`[lookspan] no desktop launcher for ${process.platform}`);
    process.exit(1);
  }

  const cliPath = cliEntrypoint();
  const input = currentDesktopInput(cliPath, rest);

  if (command === 'uninstall-desktop') {
    const removed = uninstallDesktop(input);
    console.log(`\n  ${APP_NAME} desktop launcher removed:`);
    for (const path of removed) console.log(`  · ${path}`);
    console.log('');
    return;
  }

  if (isEphemeralInstall(cliPath)) {
    console.error(
      '[lookspan] this copy runs from the npx cache, which npm may delete —\n' +
        '           a shortcut to it would stop working. Install it first:\n\n' +
        '             npm install -g lookspan\n' +
        '             lookspan install-desktop\n',
    );
    process.exit(1);
  }

  parseFlags(rest); // validate before writing anything

  try {
    const created = await installDesktop(input);
    console.log(`\n  ${APP_NAME} is now one click away:`);
    for (const path of created) console.log(`  · ${path}`);
    console.log('\n  Click it to start Lookspan and open the dashboard.');
    console.log(`  Undo with: lookspan uninstall-desktop\n`);
  } catch (err) {
    console.error(`[lookspan] could not create the desktop launcher: ${(err as Error).message}`);
    process.exit(1);
  }
}

function main(): void {
  const argv = process.argv.slice(2);
  const command = argv[0];
  if (command === 'install-desktop' || command === 'uninstall-desktop') {
    void runDesktopCommand(command, argv.slice(1));
    return;
  }

  let flags: CliFlags;
  try {
    flags = parseFlags(argv);
  } catch (err) {
    if (err instanceof FlagError) {
      console.error(`[lookspan] ${err.message}`);
      process.exit(1);
    }
    throw err;
  }

  if (flags.showHelp) {
    printHelp();
    return;
  }
  if (flags.showVersion) {
    console.log(`lookspan ${readVersion()}`);
    return;
  }

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
    corsOrigin: flags.corsOrigins.length > 0 ? flags.corsOrigins : false,
    // Only when we are actually bound to loopback. A server the user has
    // deliberately exposed is reachable by whatever name they gave it, and an
    // attacker can reach it directly there anyway — rebinding buys nothing.
    requireLoopbackHost: bindsToLoopback(flags.host),
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

  const url = `http://${flags.host}:${flags.port}`;

  /**
   * On Windows the `listen` callback runs *before* the `error` event, so a
   * second instance on a busy port announced "Lookspan running" and then
   * exited silently with code 0. Double-clicking the desktop icon twice did
   * exactly that: a window flashed claiming success and vanished.
   *
   * Deferring one tick and checking `listening` means the banner only appears
   * when the port really is ours.
   */
  const server = app.listen(flags.port, flags.host, () => {
    setImmediate(() => {
      if (!server.listening) return;
      announce();
    });
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(
        `\n[lookspan] port ${flags.port} is already in use — Lookspan may be running there already.` +
          `\n           Open ${url}, or start this one elsewhere with --port <port>.\n`,
      );
      process.exit(1);
    }
    if (err.code === 'EACCES') {
      console.error(`\n[lookspan] not allowed to bind ${flags.host}:${flags.port}.\n`);
      process.exit(1);
    }
    throw err;
  });

  function announce(): void {
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
    if (!dashboardDir) {
      console.log('  (dashboard not built — run `npm run build` to serve the UI)');
    }
    console.log(`  Press Ctrl+C to stop\n`);
    if (flags.open) {
      void openInBrowser(url);
    }
  }

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
