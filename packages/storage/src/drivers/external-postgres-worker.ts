import { parentPort, workerData } from 'node:worker_threads';
import { Client, types } from 'pg';

interface WorkerData {
  connectionString: string;
  controlBuffer: SharedArrayBuffer;
  requestBuffer: SharedArrayBuffer;
  responseBuffer: SharedArrayBuffer;
}

interface QueryRequest {
  op: 'query' | 'close';
  sql?: string;
}

interface QueryResponse {
  ok: boolean;
  rows?: Record<string, unknown>[];
  rowCount?: number;
  error?: string;
}

const data = workerData as WorkerData;
const control = new Int32Array(data.controlBuffer);
const request = new Uint8Array(data.requestBuffer);
const response = new Uint8Array(data.responseBuffer);
const decoder = new TextDecoder();
const encoder = new TextEncoder();
// Keep ordinary COUNT(*) and identity columns numeric, but preserve integers
// that cannot be represented exactly by JavaScript.
types.setTypeParser(20, (value) => {
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) ? numeric : value;
});
let client: Client | undefined;

function readRequest(): QueryRequest {
  const length = Atomics.load(control, 1);
  return JSON.parse(decoder.decode(request.subarray(0, length))) as QueryRequest;
}

function writeResponse(result: QueryResponse): void {
  const bytes = encoder.encode(JSON.stringify(result));
  if (bytes.length > response.byteLength) {
    const fallback = encoder.encode(
      JSON.stringify({ ok: false, error: 'Postgres response exceeded worker buffer' }),
    );
    response.set(fallback);
    Atomics.store(control, 1, fallback.length);
    Atomics.store(control, 0, 2);
    Atomics.notify(control, 0);
    return;
  }
  response.set(bytes);
  Atomics.store(control, 1, bytes.length);
  Atomics.store(control, 0, result.ok ? 1 : 2);
  Atomics.notify(control, 0);
}

async function handle(requestMessage: QueryRequest): Promise<void> {
  try {
    if (requestMessage.op === 'close') {
      await client?.end();
      writeResponse({ ok: true });
      parentPort?.close();
      return;
    }
    if (!client) {
      client = new Client({ connectionString: data.connectionString });
      client.on('error', () => {
        void client?.end().catch(() => undefined);
        client = undefined;
      });
      await client.connect();
    }
    const result = await client.query(requestMessage.sql ?? '');
    writeResponse({
      ok: true,
      rows: result.rows as Record<string, unknown>[],
      rowCount: result.rowCount ?? 0,
    });
  } catch (error) {
    if (client) {
      await client.end().catch(() => undefined);
      client = undefined;
    }
    writeResponse({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

if (!parentPort) throw new Error('Postgres worker requires a parent port');

let queue = Promise.resolve();
parentPort.on('message', () => {
  queue = queue.then(() => handle(readRequest()));
});
