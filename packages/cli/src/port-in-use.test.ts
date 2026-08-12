/**
 * Starting on a busy port must say so, not claim success.
 *
 * On Windows the `listen` callback runs *before* the `error` event, so the
 * second instance printed "Lookspan running at …" and then exited with code
 * **0**. Double-clicking the desktop icon a second time did exactly that: a
 * console window flashed claiming it had started, and vanished.
 *
 * Runs the built CLI as a real process, because the bug lives in the ordering
 * of Node's own events and nothing short of that would show it.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const CLI = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'index.js');
const PORT = 39117; // high and unusual, to keep CI from colliding with itself
let dir: string;
let first: ReturnType<typeof spawn>;

interface Run {
  code: number | null;
  output: string;
}

function start(db: string): { proc: ReturnType<typeof spawn>; done: Promise<Run> } {
  const proc = spawn(process.execPath, [CLI, '--port', String(PORT), '--db', db], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  proc.stdout?.on('data', (d) => {
    output += d;
  });
  proc.stderr?.on('data', (d) => {
    output += d;
  });
  const done = new Promise<Run>((res) => {
    proc.on('exit', (code) => res({ code, output }));
  });
  return { proc, done };
}

const settle = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'lookspan-port-'));
  first = start(join(dir, 'a.db')).proc;
  // Wait for the first one to own the port.
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${PORT}/api/health`)).ok) break;
    } catch {
      /* not yet */
    }
    await settle(300);
  }
}, 40_000);

afterAll(async () => {
  // Windows keeps the SQLite file locked until the process is really gone, so
  // wait for the exit before cleaning up — and never fail the suite over
  // leftover scratch files.
  if (first && first.exitCode === null) {
    const gone = new Promise((res) => first.on('exit', res));
    first.kill();
    await Promise.race([gone, settle(5_000)]);
  }
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* the OS will collect the temp dir */
  }
});

describe('a second instance on a busy port', () => {
  it('says the port is taken and exits non-zero', async () => {
    const second = start(join(dir, 'b.db'));
    const run = await second.done;

    expect(run.output).toMatch(/already in use/);
    expect(run.code).not.toBe(0);
  }, 40_000);

  it('does not claim to be running', async () => {
    const second = start(join(dir, 'c.db'));
    const run = await second.done;

    // The lie that started all this.
    expect(run.output).not.toMatch(/Lookspan running at/);
  }, 40_000);

  it('points at where Lookspan already is', async () => {
    const second = start(join(dir, 'd.db'));
    const run = await second.done;

    expect(run.output).toContain(`http://127.0.0.1:${PORT}`);
    expect(run.output).toMatch(/--port/);
  }, 40_000);

  it('leaves the first instance serving', async () => {
    const res = await fetch(`http://127.0.0.1:${PORT}/api/health`);
    expect(res.status).toBe(200);
  });
});
