import { migrate, openDatabase } from '@lookspan/storage';
import { createApp } from './app.js';
import { createContext } from './context.js';

const PORT = Number(process.env.LOOKSPAN_PORT ?? 3100);
const HOST = process.env.LOOKSPAN_HOST ?? '127.0.0.1';

function main(): void {
  const db = openDatabase({ path: process.env.LOOKSPAN_DB });
  const result = migrate(db);
  if (result.applied.length > 0) {
    console.log(`[lookspan/api] applied migrations: ${result.applied.join(', ')}`);
  }

  const ctx = createContext(db);
  const app = createApp({ context: ctx });

  const server = app.listen(PORT, HOST, () => {
    console.log(`[lookspan/api] listening on http://${HOST}:${PORT}`);
  });

  const shutdown = (signal: string) => {
    console.log(`[lookspan/api] received ${signal}, shutting down`);
    server.close(() => {
      db.close();
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main();
