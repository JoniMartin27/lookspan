import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { listenerCount } from '@lookspan/events';
import { migrate, openDatabase } from '@lookspan/storage';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { createContext } from '../context.js';

let server: Server;
let base: string;

function start() {
  const db = openDatabase({ path: ':memory:' });
  migrate(db);
  const app = createApp({ context: createContext(db, {}) });
  return new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      resolve();
    });
  });
}

afterEach(() => new Promise<void>((resolve) => server.close(() => resolve())));

const tick = (ms = 50) => new Promise((r) => setTimeout(r, ms));

describe('SSE stream lifecycle', () => {
  it('subscribes on connect and unsubscribes when the client disconnects', async () => {
    await start();
    const before = listenerCount();

    const ctrl = new AbortController();
    const res = await fetch(`${base}/api/stream`, {
      headers: { accept: 'text/event-stream' },
      signal: ctrl.signal,
    });
    expect(res.headers.get('content-type')).toContain('text/event-stream');

    await tick();
    expect(listenerCount()).toBe(before + 1);

    // Abort mid-stream (the abnormal path that used to leak the listener).
    ctrl.abort();
    await res.body?.cancel().catch(() => {});
    await tick(100);
    expect(listenerCount()).toBe(before);
  });
});
