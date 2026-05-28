#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { createApp, createContext } from '@lookspan/api';
import { defaultDatabasePath, migrate, openDatabase } from '@lookspan/storage';

interface CliFlags {
  port: number;
  host: string;
  db: string;
  open: boolean;
}

function parseFlags(argv: string[]): CliFlags {
  const { values } = parseArgs({
    args: argv,
    allowPositionals: false,
    options: {
      port: { type: 'string', short: 'p', default: '3100' },
      host: { type: 'string', default: '127.0.0.1' },
      db: { type: 'string' },
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

  return {
    port: Number(values.port),
    host: values.host as string,
    db: (values.db as string) ?? defaultDatabasePath(),
    open: Boolean(values.open),
  };
}

function printHelp(): void {
  console.log(`lookspan — local-first observability dashboard for AI agents

Usage:
  npx lookspan [options]

Options:
  -p, --port <port>     Port to listen on (default: 3100)
      --host <host>     Host to bind to (default: 127.0.0.1)
      --db <path>       SQLite database path (default: ~/.lookspan/lookspan.db)
      --open            Open the dashboard in your browser
  -h, --help            Show this help
  -v, --version         Show version

Environment:
  LOOKSPAN_PORT         Same as --port
  LOOKSPAN_HOST         Same as --host
  LOOKSPAN_DB           Same as --db

Quick start:
  npx lookspan
  → http://127.0.0.1:3100
`);
}

function main(): void {
  const flags = parseFlags(process.argv.slice(2));

  const db = openDatabase({ path: flags.db });
  const result = migrate(db);
  if (result.applied.length > 0) {
    console.log(`[lookspan] migrations applied: ${result.applied.join(', ')}`);
  }

  const ctx = createContext(db);
  const app = createApp({ context: ctx });

  const server = app.listen(flags.port, flags.host, () => {
    const url = `http://${flags.host}:${flags.port}`;
    console.log(`\n  Lookspan running at ${url}`);
    console.log(`  Database: ${flags.db}`);
    console.log(`  Press Ctrl+C to stop\n`);
    if (flags.open) {
      void openInBrowser(url);
    }
  });

  const shutdown = (signal: string) => {
    console.log(`\n[lookspan] received ${signal}, shutting down`);
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
  const cmd =
    platform === 'darwin' ? 'open' : platform === 'win32' ? 'start' : 'xdg-open';
  const args = platform === 'win32' ? ['', url] : [url];
  spawn(cmd, args, { detached: true, stdio: 'ignore', shell: platform === 'win32' }).unref();
}

main();
