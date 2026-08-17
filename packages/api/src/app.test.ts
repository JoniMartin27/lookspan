import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import type { Server } from 'node:http';
import { request as httpRequest } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrate, openDatabase } from '@lookspan/storage';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { createContext } from './context.js';

let server: Server;
let base: string;

function start(authToken?: string) {
  const db = openDatabase({ path: ':memory:' });
  migrate(db);
  const app = createApp({ context: createContext(db), authToken });
  return new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      base = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
}

afterEach(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe('createApp routing (no auth)', () => {
  beforeEach(() => start());

  it('serves health', async () => {
    const res = await fetch(`${base}/api/health`);
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });

  it('ingests and reads back a trace', async () => {
    const res = await fetch(`${base}/api/ingest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        spans: [
          {
            traceId: 'tr_1',
            spanId: 'sp_1',
            parentSpanId: null,
            type: 'llm_call',
            name: 'x',
            startedAt: '2026-06-01T10:00:00Z',
            endedAt: '2026-06-01T10:00:01Z',
            status: 'ok',
            framework: 'custom',
          },
        ],
      }),
    });
    expect(res.status).toBe(200);
    const list = await (await fetch(`${base}/api/traces`)).json();
    expect(list.items).toHaveLength(1);
  });

  it('404s unknown /api routes as JSON', async () => {
    const res = await fetch(`${base}/api/nope`);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('not_found');
  });

  it('attaches and returns scores on a trace', async () => {
    await fetch(`${base}/api/ingest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        spans: [
          {
            traceId: 'tr_s',
            spanId: 'sp_s',
            parentSpanId: null,
            type: 'llm_call',
            name: 'x',
            startedAt: '2026-06-01T10:00:00Z',
            endedAt: '2026-06-01T10:00:01Z',
            status: 'ok',
            framework: 'custom',
          },
        ],
      }),
    });

    const add = await fetch(`${base}/api/traces/tr_s/scores`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'correctness', value: 1, source: 'llm-judge' }),
    });
    expect(add.status).toBe(201);

    const bad = await fetch(`${base}/api/traces/tr_s/scores`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'x' }),
    });
    expect(bad.status).toBe(400);

    const missing = await fetch(`${base}/api/traces/nope/scores`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'x', value: 1 }),
    });
    expect(missing.status).toBe(404);

    const detail = await (await fetch(`${base}/api/traces/tr_s`)).json();
    expect(detail.scores).toHaveLength(1);
    expect(detail.scores[0]).toMatchObject({ name: 'correctness', value: 1 });
  });

  it('exports traces as CSV (default) and JSON, honouring filters', async () => {
    await fetch(`${base}/api/ingest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        spans: [
          {
            traceId: 'tr_csv1',
            spanId: 'sp1',
            parentSpanId: null,
            type: 'llm_call',
            name: 'one',
            startedAt: '2026-06-01T10:00:00Z',
            endedAt: '2026-06-01T10:00:01Z',
            status: 'ok',
            framework: 'mcp',
          },
          {
            traceId: 'tr_csv2',
            spanId: 'sp2',
            parentSpanId: null,
            type: 'llm_call',
            name: 'two',
            startedAt: '2026-06-01T11:00:00Z',
            endedAt: '2026-06-01T11:00:02Z',
            status: 'error',
            framework: 'langgraph',
          },
        ],
      }),
    });

    // CSV is the default format.
    const csvRes = await fetch(`${base}/api/export/traces`);
    expect(csvRes.status).toBe(200);
    expect(csvRes.headers.get('content-type')).toContain('text/csv');
    expect(csvRes.headers.get('content-disposition')).toMatch(/attachment; filename=".*\.csv"/);
    // UTF-8 BOM so Excel reads accents correctly (point 2). `fetch().text()`
    // strips a leading BOM per the Encoding Standard, so check the raw bytes.
    const csvBytes = new Uint8Array(await csvRes.clone().arrayBuffer());
    expect([csvBytes[0], csvBytes[1], csvBytes[2]]).toEqual([0xef, 0xbb, 0xbf]);
    const csv = await csvRes.text();
    const lines = csv.trim().split('\r\n');
    expect(lines[0]).toContain('traceId');
    expect(lines).toHaveLength(3); // header + 2 traces
    expect(csv).toContain('tr_csv1');
    expect(csv).toContain('tr_csv2');

    // Provenance/integrity headers (points 4 & 5).
    expect(csvRes.headers.get('x-lookspan-export-truncated')).toBe('false');
    expect(csvRes.headers.get('x-lookspan-export-count')).toBe('2');
    expect(csvRes.headers.get('x-lookspan-export-sha256')).toMatch(/^[0-9a-f]{64}$/);

    // JSON format returns full trace objects with a provenance block.
    const jsonRes = await fetch(`${base}/api/export/traces?format=json`);
    expect(jsonRes.headers.get('content-type')).toContain('application/json');
    const body = await jsonRes.json();
    expect(body.count).toBe(2);
    expect(body.traces).toHaveLength(2);
    expect(body.traces[0]).toHaveProperty('totalUsage');
    // Provenance fields (point 5).
    expect(body.tool).toBe('lookspan');
    expect(typeof body.version).toBe('string');
    expect(body.truncated).toBe(false);
    expect(body.totalAvailable).toBe(2);
    expect(body.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(typeof body.exportedAt).toBe('string');
    // PII redaction by default (point 6): attributes are dropped.
    expect(body.traces[0]).not.toHaveProperty('attributes');
    expect(body.raw).toBe(false);

    // ?raw=1 returns attributes in the clear.
    const rawBody = await (await fetch(`${base}/api/export/traces?format=json&raw=1`)).json();
    expect(rawBody.raw).toBe(true);
    expect(rawBody.traces[0]).toHaveProperty('attributes');

    // The status filter narrows the export.
    const filtered = await (
      await fetch(`${base}/api/export/traces?format=json&status=error`)
    ).json();
    expect(filtered.count).toBe(1);
    expect(filtered.traces[0].traceId).toBe('tr_csv2');
    expect(filtered.filters).toEqual({ status: 'error' });

    // HTML audit report (point 7).
    const htmlRes = await fetch(`${base}/api/export/traces?format=html`);
    expect(htmlRes.headers.get('content-type')).toContain('text/html');
    expect(htmlRes.headers.get('content-disposition')).toMatch(/attachment; filename=".*\.html"/);
    const html = await htmlRes.text();
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('Lookspan');
    expect(html).toContain('<svg'); // hand-drawn charts
    expect(html).toContain('tr_csv1'); // trace table
    expect(html).toContain(htmlRes.headers.get('x-lookspan-export-sha256') ?? 'NO_HASH');
  });

  it('reports truncation explicitly when the export limit drops rows', async () => {
    await fetch(`${base}/api/ingest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        spans: [
          {
            traceId: 'tr_t1',
            spanId: 'spt1',
            parentSpanId: null,
            type: 'llm_call',
            name: 'one',
            startedAt: '2026-06-01T10:00:00Z',
            endedAt: '2026-06-01T10:00:01Z',
            status: 'ok',
            framework: 'mcp',
          },
          {
            traceId: 'tr_t2',
            spanId: 'spt2',
            parentSpanId: null,
            type: 'llm_call',
            name: 'two',
            startedAt: '2026-06-01T11:00:00Z',
            endedAt: '2026-06-01T11:00:02Z',
            status: 'ok',
            framework: 'mcp',
          },
        ],
      }),
    });

    const res = await fetch(`${base}/api/export/traces?format=json&limit=1`);
    expect(res.headers.get('x-lookspan-export-truncated')).toBe('true');
    const body = await res.json();
    expect(body.count).toBe(1);
    expect(body.truncated).toBe(true);
    expect(body.totalAvailable).toBe(2);
  });

  it('neutralises CSV formula injection in exported string fields', async () => {
    await fetch(`${base}/api/ingest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        spans: [
          {
            traceId: 'tr_inj',
            spanId: 'spinj',
            parentSpanId: null,
            type: 'llm_call',
            name: '=cmd|/c calc',
            startedAt: '2026-06-01T10:00:00Z',
            endedAt: '2026-06-01T10:00:01Z',
            status: 'ok',
            framework: 'custom',
          },
        ],
      }),
    });

    const csv = await (await fetch(`${base}/api/export/traces`)).text();
    // The dangerous rootName is neutralised with a leading single quote.
    expect(csv).toContain("'=cmd|/c calc");
    expect(csv).not.toMatch(/,=cmd/);
  });
});

describe('aggregation & session routes', () => {
  beforeEach(async () => {
    await start();
    // two traces in one session, two agents, with cost
    await fetch(`${base}/api/ingest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        spans: [
          {
            traceId: 'tr_a',
            spanId: 'sp_a',
            parentSpanId: null,
            type: 'llm_call',
            name: 'a',
            startedAt: '2026-06-01T10:00:00Z',
            endedAt: '2026-06-01T10:00:01Z',
            status: 'ok',
            framework: 'mcp',
            agentId: 'ag1',
            sessionId: 'sess',
            model: 'gpt-4o',
            provider: 'openai',
            usage: { inputTokens: 1000000, outputTokens: 0, costUsd: 0 },
          },
          {
            traceId: 'tr_b',
            spanId: 'sp_b',
            parentSpanId: null,
            type: 'llm_call',
            name: 'b',
            startedAt: '2026-06-01T11:00:00Z',
            endedAt: '2026-06-01T11:00:02Z',
            status: 'error',
            framework: 'mcp',
            agentId: 'ag2',
            sessionId: 'sess',
          },
        ],
      }),
    });
  });

  it('GET /api/stats returns totals, error rate and latency', async () => {
    const s = await (await fetch(`${base}/api/stats`)).json();
    expect(s.totalTraces).toBe(2);
    expect(s.errorTraces).toBe(1);
    expect(s.errorRate).toBe(0.5);
    expect(s.latencyMs).not.toBeNull();
  });

  it('GET /api/costs/summary breaks cost down', async () => {
    const c = await (await fetch(`${base}/api/costs/summary`)).json();
    expect(c.total).toBe(2.5); // 1M input gpt-4o @ $2.5
    expect(c.byProvider.openai).toBe(2.5);
    // Reasoning cost is itemized in the summary (zero here — fixture has no
    // reasoning tokens — but the field is always present and queryable).
    expect(c.reasoning).toBe(0);
    expect(c.reasoningByModel).toBeDefined();
  });

  it('GET /api/sessions lists the session with its agents', async () => {
    const { items } = await (await fetch(`${base}/api/sessions`)).json();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ sessionId: 'sess', traceCount: 2, agentCount: 2 });
  });

  it('GET /api/sessions/:id returns summary + traces; 404 for unknown', async () => {
    const res = await (await fetch(`${base}/api/sessions/sess`)).json();
    expect(res.session).toMatchObject({ sessionId: 'sess', traceCount: 2 });
    expect(res.traces).toHaveLength(2);
    expect((await fetch(`${base}/api/sessions/nope`)).status).toBe(404);
  });

  it('GET /api/alerts returns an items array', async () => {
    const a = await (await fetch(`${base}/api/alerts`)).json();
    expect(Array.isArray(a.items)).toBe(true);
  });

  it('GET /api/scores/summary averages scores by name', async () => {
    await fetch(`${base}/api/traces/tr_a/scores`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'quality', value: 1 }),
    });
    await fetch(`${base}/api/traces/tr_b/scores`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'quality', value: 0 }),
    });
    const { items } = await (await fetch(`${base}/api/scores/summary`)).json();
    const q = items.find((i: { name: string }) => i.name === 'quality');
    expect(q).toMatchObject({ name: 'quality', avg: 0.5, count: 2 });
  });
});

describe('createApp auth token', () => {
  beforeEach(() => start('secret123'));

  it('allows health without a token', async () => {
    expect((await fetch(`${base}/api/health`)).status).toBe(200);
  });

  it('rejects API requests without a token', async () => {
    expect((await fetch(`${base}/api/traces`)).status).toBe(401);
  });

  it('accepts a valid Bearer token', async () => {
    const res = await fetch(`${base}/api/traces`, {
      headers: { authorization: 'Bearer secret123' },
    });
    expect(res.status).toBe(200);
  });

  it('rejects tokens supplied in query strings', async () => {
    expect((await fetch(`${base}/api/traces?token=secret123`)).status).toBe(401);
  });

  it('accepts the dashboard auth cookie without exposing a token in the URL', async () => {
    const res = await fetch(`${base}/api/traces`, {
      headers: { cookie: 'lookspan_auth=secret123' },
    });
    expect(res.status).toBe(200);
  });

  it('rejects a wrong token', async () => {
    const res = await fetch(`${base}/api/traces`, {
      headers: { authorization: 'Bearer nope' },
    });
    expect(res.status).toBe(401);
  });

  it('guards the OTLP endpoint too', async () => {
    const res = await fetch(`${base}/v1/traces`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ resourceSpans: [] }),
    });
    expect(res.status).toBe(401);
  });

  // Express routes case-insensitively, so `/API/traces` reached the traces
  // router while `req.path.startsWith('/api')` said it was not an API request
  // at all. One capital letter returned the whole database, and `POST
  // /API/ingest` accepted writes. The guard has to agree with the router about
  // what a path is.
  it.each([
    '/API/traces',
    '/Api/traces',
    '/aPi/traces',
    '/API/stats',
    '/API/sessions',
    '/API/export/traces?format=json',
  ])('rejects %s without a token', async (path) => {
    expect((await fetch(`${base}${path}`)).status).toBe(401);
  });

  it.each(['/API/ingest', '/V1/traces'])('rejects writes to %s without a token', async (path) => {
    const res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ spans: [], resourceSpans: [] }),
    });
    expect(res.status).toBe(401);
  });

  it('still accepts a capitalised path when the token is right', async () => {
    // Closing the hole must not turn a working request into a 401 for someone
    // who was relying on Express's case-insensitive routing.
    const res = await fetch(`${base}/API/traces`, {
      headers: { authorization: 'Bearer secret123' },
    });
    expect(res.status).toBe(200);
  });

  it('rejects a token that is a prefix of the real one', async () => {
    // The comparison is hashed before `timingSafeEqual`, which throws on a
    // length mismatch — a shorter token must be rejected, not crash the server.
    const res = await fetch(`${base}/api/traces`, {
      headers: { authorization: 'Bearer secret' },
    });
    expect(res.status).toBe(401);
  });

  it('rejects an empty Bearer token', async () => {
    const res = await fetch(`${base}/api/traces`, { headers: { authorization: 'Bearer ' } });
    expect(res.status).toBe(401);
  });
});

describe('dashboard SPA fallback', () => {
  let dashboardDir: string;

  beforeEach(async () => {
    // Un `dist/` de mentira, pero de VERDAD en disco: el fallo que esto cubre
    // solo aparece cuando `send` resuelve una ruta real.
    //
    // Y el directorio empieza por PUNTO a propósito. Ese es justo el caso que
    // se rompía: `npm i -g` instala bajo `~/.local`, `~/.nvm` o `~/.volta` en
    // media Linux, y `send` sin `root` mira TODOS los tramos de la ruta
    // absoluta y aplica su `dotfiles: 'ignore'` — así que un `.algo` en medio
    // convertía el index.html en un 404 aunque el fichero estuviera ahí.
    dashboardDir = await mkdtemp(join(tmpdir(), '.lookspan-dash-'));
    await writeFile(join(dashboardDir, 'index.html'), '<!doctype html><title>Lookspan</title>');
    await writeFile(join(dashboardDir, 'app.js'), 'export const x = 1;\n');
    const db = openDatabase({ path: ':memory:' });
    migrate(db);
    const app = createApp({ context: createContext(db), dashboardDir });
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const { port } = server.address() as AddressInfo;
        base = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  afterEach(async () => {
    await rm(dashboardDir, { recursive: true, force: true });
  });

  it('serves the app shell at the root', async () => {
    const res = await fetch(`${base}/`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('Lookspan');
  });

  // El caso que se rompió: `/` funcionaba (lo servía express.static) y todo lo
  // demás daba 404, así que abrir una traza por enlace o recargar la página la
  // dejaba en blanco.
  it.each([
    '/traces/tr_abc123',
    '/sessions',
    '/sessions/voz@2026-08-12',
    '/connect',
    '/costs',
  ])('serves the app shell on a hard request to %s', async (path) => {
    const res = await fetch(`${base}${path}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(await res.text()).toContain('Lookspan');
  });

  it('still serves real static assets instead of the shell', async () => {
    const res = await fetch(`${base}/app.js`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('export const x');
  });

  it('keeps unknown /api routes as JSON 404s, never the shell', async () => {
    const res = await fetch(`${base}/api/nope`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not_found' });
  });

  it('does not answer non-GET requests with the shell', async () => {
    const res = await fetch(`${base}/traces/tr_abc123`, { method: 'DELETE' });
    expect(res.status).toBe(404);
  });
});

describe('CORS', () => {
  // The browser reaches loopback even when the network cannot, so reflecting
  // whatever origin asked let any page the user visited read the local database
  // — and, with no token on a default install, write to it.
  describe('by default', () => {
    beforeEach(() => start());

    it('grants nothing to an unknown origin', async () => {
      const res = await fetch(`${base}/api/traces`, {
        headers: { origin: 'https://evil.example' },
      });
      expect(res.headers.get('access-control-allow-origin')).toBeNull();
    });

    it('still answers same-origin requests normally', async () => {
      // The dashboard is served from this very origin: locking CORS down must
      // not break the UI, which sends no Origin header at all.
      expect((await fetch(`${base}/api/traces`)).status).toBe(200);
    });

    it('still accepts spans from a non-browser client', async () => {
      // Agents post from Node/Python, which do not enforce CORS. Their path
      // must be untouched.
      const res = await fetch(`${base}/api/ingest`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ spans: [] }),
      });
      expect(res.status).toBe(200);
    });
  });

  describe('with an explicit origin', () => {
    beforeEach(() => {
      const db = openDatabase({ path: ':memory:' });
      migrate(db);
      const app = createApp({ context: createContext(db), corsOrigin: ['https://app.example'] });
      return new Promise<void>((resolve) => {
        server = app.listen(0, '127.0.0.1', () => {
          base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
          resolve();
        });
      });
    });

    it('grants the configured origin', async () => {
      const res = await fetch(`${base}/api/traces`, {
        headers: { origin: 'https://app.example' },
      });
      expect(res.headers.get('access-control-allow-origin')).toBe('https://app.example');
    });

    it('grants nothing to any other origin', async () => {
      const res = await fetch(`${base}/api/traces`, {
        headers: { origin: 'https://evil.example' },
      });
      expect(res.headers.get('access-control-allow-origin')).toBeNull();
    });
  });
});

describe('Host header guard', () => {
  // The defence against DNS rebinding, which CORS cannot touch: once the
  // attacker's domain resolves to loopback the browser calls it same-origin.
  //
  // `fetch` silently drops a `host` header you set — verified: the server sees
  // the real authority — so these have to go out over a raw request or they
  // assert nothing at all.
  function request(
    path: string,
    { host, method = 'GET', body }: { host?: string; method?: string; body?: string } = {},
  ): Promise<{ status: number; body: string }> {
    const { port } = server.address() as AddressInfo;
    return new Promise((resolve, reject) => {
      const req = httpRequest(
        {
          host: '127.0.0.1',
          port,
          path,
          method,
          headers: {
            ...(host ? { Host: host } : {}),
            ...(body ? { 'content-type': 'application/json' } : {}),
          },
        },
        (res) => {
          let data = '';
          res.on('data', (c) => {
            data += c;
          });
          res.on('end', () => resolve({ status: res.statusCode ?? 0, body: data }));
        },
      );
      req.on('error', reject);
      if (body) req.write(body);
      req.end();
    });
  }

  function startGuarded() {
    const db = openDatabase({ path: ':memory:' });
    migrate(db);
    const app = createApp({ context: createContext(db), requireLoopbackHost: true });
    return new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        resolve();
      });
    });
  }

  describe('when bound to loopback', () => {
    beforeEach(() => startGuarded());

    it('answers a request addressed to loopback', async () => {
      expect((await request('/api/traces')).status).toBe(200);
      expect((await request('/api/traces', { host: 'localhost:1234' })).status).toBe(200);
    });

    it('refuses a request addressed to somewhere else', async () => {
      const res = await request('/api/traces', { host: 'evil.example' });
      expect(res.status).toBe(421);
      expect(JSON.parse(res.body).error).toBe('misdirected_request');
    });

    it('refuses writes too, not just reads', async () => {
      const res = await request('/api/ingest', {
        host: 'evil.example',
        method: 'POST',
        body: JSON.stringify({ spans: [] }),
      });
      expect(res.status).toBe(421);
    });

    it('guards the dashboard and health as well', async () => {
      // The rebound page loads the SPA from the same origin; there is no
      // reason to hand it anything at all.
      for (const path of ['/', '/api/health']) {
        expect((await request(path, { host: 'evil.example' })).status, path).toBe(421);
      }
    });
  });

  describe('when the user has exposed the server', () => {
    beforeEach(() => start()); // no requireLoopbackHost

    it('answers whatever name it is reached by', async () => {
      // `--host 0.0.0.0` is reachable directly, so enforcing the header would
      // only break reaching it as `myserver.lan`.
      expect((await request('/api/traces', { host: 'myserver.lan' })).status).toBe(200);
    });
  });
});
