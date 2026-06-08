#!/usr/bin/env node
// Seed a Lookspan instance with a realistic, fully synthetic "support-copilot"
// demo dataset: ~16 traces across frameworks, a rich star trace with a chat
// conversation, a multi-agent delegation session, scores, a synthetic replay,
// and a populated dataset + run. Used to record the project demo GIF.
//
// Usage: node scripts/seed-demo.mjs [--base http://127.0.0.1:3100] [--db <path>]
//
// All content is invented — no PII, no real keys, no real order ids.
import Database from 'better-sqlite3';

const args = process.argv.slice(2);
function flag(name, def) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
}
const BASE = flag('base', 'http://127.0.0.1:3100').replace(/\/$/, '');
const DB_PATH = flag('db', null); // for the synthetic replay insert

const iso = (ms) => new Date(ms).toISOString();
const now = Date.now();
// Spread traces across ~3.5 hours so the time axis & cost sparkline have shape.
const HOUR = 3_600_000;

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`POST ${path} -> ${res.status}: ${text}`);
  }
  return res.json();
}

async function ingest(spans, source = 'seed-demo') {
  return post('/api/ingest', { source, spans });
}

let spanSeq = 0;
const sid = () => `sp_${(++spanSeq).toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

// ---------------------------------------------------------------------------
// 1) The star trace: support.handle_ticket (langgraph, agent triage).
// ---------------------------------------------------------------------------
const STAR_TRACE = 'tr_star_ticket';
const STAR_SESSION = 'sess-ticket-A4471';

const userQuestion = "My order #A-4471 hasn't shipped, what's going on?";
const planSystem =
  'You are support-copilot, a calm and concise customer-support assistant. Plan the steps needed to resolve the ticket before answering.';
const composeSystem =
  'You are support-copilot. Answer the customer directly and warmly, citing the order status you looked up. Never invent tracking numbers.';
const finalAnswer =
  "Thanks for reaching out! I looked up order #A-4471 — it's packed and waiting on the carrier pickup, which was delayed by a regional backlog. It's now scheduled to ship tomorrow morning, and you'll get a tracking link by email as soon as it's on the truck. Sorry for the wait — is there anything else I can help with?";

function starSpans() {
  const t0 = now - 2 * HOUR;
  const planEnd = t0 + 1200;
  const searchStart = planEnd + 50;
  const searchEnd = searchStart + 600;
  const lookupStart = searchEnd + 40;
  const lookupEnd = lookupStart + 400;
  const composeStart = lookupEnd + 60;
  const composeEnd = composeStart + 6800; // dominates the waterfall (~6.8s)
  const rootEnd = composeEnd + 80;

  const rootId = sid();
  const planId = sid();
  const searchId = sid();
  const lookupId = sid();
  const composeId = sid();

  const common = {
    traceId: STAR_TRACE,
    framework: 'langgraph',
    agentId: 'triage',
    sessionId: STAR_SESSION,
  };

  return [
    {
      ...common,
      spanId: rootId,
      parentSpanId: null,
      type: 'agent_step',
      name: 'support.handle_ticket',
      startedAt: iso(t0),
      endedAt: iso(rootEnd),
      status: 'ok',
      attributes: { ticket: '#A-4471', channel: 'email', priority: 'normal' },
    },
    {
      ...common,
      spanId: planId,
      parentSpanId: rootId,
      type: 'llm_call',
      name: 'plan',
      startedAt: iso(t0 + 80),
      endedAt: iso(planEnd),
      status: 'ok',
      model: 'gpt-4o',
      provider: 'openai',
      input: {
        system: planSystem,
        messages: [{ role: 'user', content: userQuestion }],
      },
      output:
        '1. Look up the order status for #A-4471.\n2. Check the support docs for shipping-delay policy.\n3. Draft a warm, specific reply.',
      usage: { inputTokens: 1240, outputTokens: 300, costUsd: 0 },
    },
    {
      ...common,
      spanId: searchId,
      parentSpanId: rootId,
      type: 'tool_call',
      name: 'mcp.search_docs',
      startedAt: iso(searchStart),
      endedAt: iso(searchEnd),
      status: 'ok',
      input: {
        messages: [
          {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: 'call_docs',
                type: 'function',
                function: {
                  name: 'search_docs',
                  arguments: '{"query":"shipping delay carrier backlog policy"}',
                },
              },
            ],
          },
        ],
      },
      output:
        'Policy: when a carrier reports a regional backlog, reassure the customer, give the next pickup window, and promise a tracking link on dispatch.',
      attributes: { tool: 'search_docs', hits: 3, retrievalMs: 600 },
    },
    {
      ...common,
      spanId: lookupId,
      parentSpanId: rootId,
      type: 'tool_call',
      name: 'mcp.lookup_order',
      startedAt: iso(lookupStart),
      endedAt: iso(lookupEnd),
      status: 'ok',
      input: {
        messages: [
          {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: 'call_order',
                type: 'function',
                function: { name: 'lookup_order', arguments: '{"orderId":"A-4471"}' },
              },
            ],
          },
        ],
      },
      output:
        '{"orderId":"A-4471","status":"packed","carrier":"regional-backlog","nextPickup":"tomorrow 08:00"}',
      attributes: { tool: 'lookup_order' },
    },
    {
      ...common,
      spanId: composeId,
      parentSpanId: rootId,
      type: 'llm_call',
      name: 'compose_answer',
      startedAt: iso(composeStart),
      endedAt: iso(composeEnd),
      status: 'ok',
      model: 'gpt-4o',
      provider: 'openai',
      input: {
        system: composeSystem,
        messages: [
          { role: 'user', content: userQuestion },
          {
            role: 'assistant',
            content:
              'Order #A-4471 is packed; carrier reports a regional backlog; next pickup is tomorrow 08:00.',
          },
          { role: 'user', content: 'Please write the final reply to the customer.' },
        ],
      },
      output: finalAnswer,
      // Large context (full ticket history + retrieved docs) so this single call
      // both dominates the waterfall and trips the $0.50 cost alert.
      usage: { inputTokens: 92_000, outputTokens: 38_000, costUsd: 0 },
    },
  ];
}

// ---------------------------------------------------------------------------
// 2) Multi-agent delegation session for the graph view.
//    coordinator -> {researcher, writer} -> editor, one child in error.
// ---------------------------------------------------------------------------
const ONBOARD_SESSION = 'sess-onboard-demo';

function delegationTraces() {
  const base = now - 3 * HOUR;
  const mk = (id, name, agent, parentTrace, offsetMs, durMs, status, model, inTok, outTok) => {
    const start = base + offsetMs;
    const rootId = sid();
    const llmId = sid();
    const spans = [
      {
        traceId: id,
        spanId: rootId,
        parentSpanId: null,
        parentTraceId: parentTrace,
        type: 'agent_step',
        name,
        startedAt: iso(start),
        endedAt: iso(start + durMs),
        status,
        framework: 'crewai',
        agentId: agent,
        sessionId: ONBOARD_SESSION,
      },
    ];
    if (status !== 'error') {
      spans.push({
        traceId: id,
        spanId: llmId,
        parentSpanId: rootId,
        type: 'llm_call',
        name: `${agent}.generate`,
        startedAt: iso(start + 60),
        endedAt: iso(start + durMs - 40),
        status: 'ok',
        framework: 'crewai',
        agentId: agent,
        sessionId: ONBOARD_SESSION,
        model,
        provider: model.startsWith('claude') ? 'anthropic' : 'openai',
        input:
          agent === 'writer'
            ? {
                system: 'You are the writer agent in an onboarding crew.',
                messages: [
                  { role: 'user', content: 'Write a welcome message for a new support teammate.' },
                ],
              }
            : undefined,
        output: agent === 'writer' ? 'Welcome aboard! Here is how we handle tickets…' : undefined,
        usage: { inputTokens: inTok, outputTokens: outTok, costUsd: 0 },
      });
    } else {
      spans[0].error = { code: 'tool_timeout', message: 'editor handoff timed out after 8s' };
    }
    return spans;
  };

  return [
    mk(
      'tr_onb_coord',
      'onboard.coordinate',
      'coordinator',
      null,
      0,
      2400,
      'ok',
      'gpt-4o-mini',
      900,
      220,
    ),
    mk(
      'tr_onb_research',
      'onboard.research',
      'researcher',
      'tr_onb_coord',
      700,
      3100,
      'ok',
      'claude-sonnet-4-6',
      1800,
      640,
    ),
    mk(
      'tr_onb_write',
      'onboard.write',
      'writer',
      'tr_onb_coord',
      1200,
      2600,
      'ok',
      'gpt-4o',
      1500,
      520,
    ),
    mk(
      'tr_onb_edit',
      'onboard.edit',
      'editor',
      'tr_onb_write',
      4200,
      1300,
      'error',
      'gpt-4o-mini',
      0,
      0,
    ),
  ].flat();
}

// ---------------------------------------------------------------------------
// 3) Filler traces across frameworks for the list + health strip + costs.
// ---------------------------------------------------------------------------
function fillerTraces() {
  const frameworks = [
    'mcp',
    'openai-agents',
    'otlp',
    'custom',
    'langgraph',
    'mcp',
    'openai-agents',
    'langgraph',
    'crewai',
    'mcp',
    'otlp',
  ];
  const agents = [
    'triage',
    'router',
    'summarizer',
    'classifier',
    'triage',
    'router',
    'summarizer',
    'triage',
    'researcher',
    'router',
    'classifier',
  ];
  const models = [
    ['gpt-4o-mini', 'openai', 6_500, 1_400],
    ['gpt-4o', 'openai', 14_000, 4_200],
    ['claude-sonnet-4-6', 'anthropic', 18_000, 5_200],
    ['gpt-4o-mini', 'openai', 4_800, 1_100],
    ['gpt-4o-mini', 'openai', 7_200, 1_900],
    ['claude-sonnet-4-6', 'anthropic', 22_000, 6_400],
    ['gpt-4o', 'openai', 16_000, 4_800],
    ['gpt-4o', 'openai', 9_500, 2_600],
    ['claude-sonnet-4-6', 'anthropic', 12_000, 3_300],
    ['gpt-4o-mini', 'openai', 5_400, 1_250],
    ['gpt-4o', 'openai', 11_000, 3_100],
  ];
  const names = [
    'support.classify_intent',
    'support.route_ticket',
    'support.summarize_thread',
    'support.detect_sentiment',
    'support.draft_reply',
    'support.escalate',
    'support.tag_conversation',
    'support.suggest_macro',
    'support.gather_context',
    'support.dedupe_ticket',
    'support.translate_reply',
  ];

  // A captured prompt for a few filler traces so they can seed dataset items.
  const prompts = [
    'A customer asks where their refund is — classify the intent.',
    'Ticket: "Wrong size shipped." Decide which queue to route it to.',
    null,
    null,
    'Draft a brief, friendly reply confirming a delivery date change.',
    null,
    null,
    null,
    null,
    null,
    null,
  ];

  const all = [];
  for (let i = 0; i < frameworks.length; i++) {
    const start = now - 3.5 * HOUR + i * (HOUR / 3) + Math.floor(Math.random() * 90_000);
    const dur = 800 + Math.floor(Math.random() * 1800);
    const [model, provider, inTok, outTok] = models[i];
    const id = `tr_fill_${i}`;
    const rootId = sid();
    const llmId = sid();
    const prompt = prompts[i];
    all.push(
      {
        traceId: id,
        spanId: rootId,
        parentSpanId: null,
        type: 'agent_step',
        name: names[i],
        startedAt: iso(start),
        endedAt: iso(start + dur),
        status: 'ok',
        framework: frameworks[i],
        agentId: agents[i],
      },
      {
        traceId: id,
        spanId: llmId,
        parentSpanId: rootId,
        type: 'llm_call',
        name: `${names[i]}.llm`,
        startedAt: iso(start + 40),
        endedAt: iso(start + dur - 30),
        status: 'ok',
        framework: frameworks[i],
        agentId: agents[i],
        model,
        provider,
        input: prompt
          ? { system: 'You are support-copilot.', messages: [{ role: 'user', content: prompt }] }
          : undefined,
        output: prompt ? 'Done.' : undefined,
        usage: { inputTokens: inTok, outputTokens: outTok, costUsd: 0 },
      },
    );
  }

  // One clearly-slow trace (~9s) to push p95 and color a mini-bar amber.
  {
    const start = now - HOUR;
    const dur = 9200;
    const id = 'tr_slow_research';
    const rootId = sid();
    const llmId = sid();
    all.push(
      {
        traceId: id,
        spanId: rootId,
        parentSpanId: null,
        type: 'agent_step',
        name: 'support.deep_research',
        startedAt: iso(start),
        endedAt: iso(start + dur),
        status: 'ok',
        framework: 'langgraph',
        agentId: 'researcher',
      },
      {
        traceId: id,
        spanId: llmId,
        parentSpanId: rootId,
        type: 'llm_call',
        name: 'deep_research.llm',
        startedAt: iso(start + 60),
        endedAt: iso(start + dur - 40),
        status: 'ok',
        framework: 'langgraph',
        agentId: 'researcher',
        model: 'gpt-4o',
        provider: 'openai',
        usage: { inputTokens: 48_000, outputTokens: 16_000, costUsd: 0 },
      },
    );
  }

  // One standalone error trace + one cancelled to make error-rate ~8%.
  {
    const start = now - 40 * 60_000;
    const id = 'tr_err_payment';
    const rootId = sid();
    all.push({
      traceId: id,
      spanId: rootId,
      parentSpanId: null,
      type: 'agent_step',
      name: 'support.refund_lookup',
      startedAt: iso(start),
      endedAt: iso(start + 1100),
      status: 'error',
      framework: 'mcp',
      agentId: 'router',
      error: { code: 'upstream_503', message: 'payments service returned 503' },
    });
  }
  {
    const start = now - 25 * 60_000;
    const id = 'tr_cancel_user';
    const rootId = sid();
    all.push({
      traceId: id,
      spanId: rootId,
      parentSpanId: null,
      type: 'agent_step',
      name: 'support.long_summary',
      startedAt: iso(start),
      endedAt: iso(start + 700),
      status: 'cancelled',
      framework: 'custom',
      agentId: 'summarizer',
    });
  }

  return all;
}

// ---------------------------------------------------------------------------
// Synthetic replay (no provider key in CI/demo): insert directly into the DB
// so the ReplayCard renders a green ▼ delta + a +/- line diff.
// ---------------------------------------------------------------------------
function seedSyntheticReplay() {
  if (!DB_PATH) {
    console.warn('[seed] --db not provided; skipping synthetic replay insert');
    return;
  }
  const db = new Database(DB_PATH);
  try {
    const composeSpan = db
      .prepare(
        "SELECT span_id, output, cost_usd, duration_ms FROM spans WHERE trace_id = ? AND name = 'compose_answer'",
      )
      .get(STAR_TRACE);
    if (!composeSpan) {
      console.warn('[seed] compose_answer span not found; skipping replay');
      return;
    }
    const replayOutput =
      "Thanks for getting in touch! I checked order #A-4471 — it's packed and waiting on the carrier, which hit a regional backlog. It's set to ship tomorrow morning and you'll receive a tracking link by email the moment it leaves. Apologies for the delay — anything else I can do for you?";
    db.prepare(
      `INSERT INTO replays (
         trace_id, span_id, provider, original_model, replay_model, status,
         output, error, input_tokens, output_tokens, cost_usd, duration_ms,
         original_output, original_cost_usd, original_duration_ms, created_at
       ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      STAR_TRACE,
      composeSpan.span_id,
      'openai',
      'gpt-4o',
      'gpt-4o-mini',
      'ok',
      replayOutput,
      null,
      2050,
      500,
      0.00037, // far cheaper than gpt-4o original -> green ▼
      2300, // faster than original ~6.8s
      composeSpan.output,
      composeSpan.cost_usd,
      composeSpan.duration_ms,
      iso(now - 30 * 60_000),
    );
    console.log('[seed] synthetic replay inserted (gpt-4o-mini, green delta + diff)');
  } finally {
    db.close();
  }
}

// A completed dataset run with per-item aggregates, inserted directly so the
// /datasets and run-detail tables are populated without a provider key.
function seedSyntheticRun(datasetId) {
  if (!DB_PATH) return;
  const db = new Database(DB_PATH);
  try {
    const items = db
      .prepare('SELECT id FROM dataset_items WHERE dataset_id = ? ORDER BY id ASC')
      .all(datasetId);
    if (items.length === 0) {
      console.warn('[seed] no dataset items; skipping run');
      return;
    }
    const createdAt = iso(now - 20 * 60_000);
    const okCount = items.length;
    const perItem = [
      {
        output: 'Reassured the customer, gave the next pickup window, promised a tracking link.',
        cost: 0.00041,
        dur: 2100,
        score: 0.92,
        rationale: 'On-policy, specific, warm.',
      },
      {
        output: 'Classified intent as "shipping" with high confidence.',
        cost: 0.00012,
        dur: 880,
        score: 0.88,
        rationale: 'Correct label.',
      },
      {
        output: 'Routed to the logistics queue.',
        cost: 0.00009,
        dur: 760,
        score: 0.85,
        rationale: 'Reasonable routing.',
      },
      {
        output: 'Drafted a concise, on-brand reply.',
        cost: 0.00038,
        dur: 1900,
        score: 0.9,
        rationale: 'Good tone, minor verbosity.',
      },
      {
        output: 'Summarized the onboarding thread accurately.',
        cost: 0.00031,
        dur: 1500,
        score: 0.87,
        rationale: 'Faithful summary.',
      },
    ];
    const used = items.map((_, i) => perItem[i % perItem.length]);
    const totalCost = used.reduce((a, b) => a + b.cost, 0);
    const avgScore = used.reduce((a, b) => a + b.score, 0) / used.length;

    const runInfo = db
      .prepare(
        `INSERT INTO runs (dataset_id, model, provider, status, item_count, ok_count, error_count, total_cost_usd, avg_score, judge_metric, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        datasetId,
        'gpt-4o-mini',
        'openai',
        'done',
        items.length,
        okCount,
        0,
        totalCost,
        avgScore,
        'correctness',
        createdAt,
      );
    const runId = Number(runInfo.lastInsertRowid);

    const insItem = db.prepare(
      `INSERT INTO run_items (run_id, item_id, status, output, error, cost_usd, duration_ms, score, rationale, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
    );
    items.forEach((it, i) => {
      const p = used[i];
      insItem.run(
        runId,
        it.id,
        'ok',
        p.output,
        null,
        p.cost,
        p.dur,
        p.score,
        p.rationale,
        createdAt,
      );
    });
    console.log(
      `[seed] synthetic run #${runId} inserted (gpt-4o-mini · correctness · avg ${avgScore.toFixed(2)})`,
    );
  } finally {
    db.close();
  }
}

async function main() {
  console.log(`[seed] target ${BASE}`);

  // Ingest in a few batches.
  await ingest(starSpans());
  await ingest(delegationTraces());
  await ingest(fillerTraces());
  console.log('[seed] traces ingested');

  // Give the collector a beat to flush, then scores.
  await new Promise((r) => setTimeout(r, 300));

  // Human score on the star trace.
  await post(`/api/traces/${STAR_TRACE}/scores`, {
    name: 'helpfulness',
    value: 0.8,
    source: 'human',
    comment: 'Specific, warm, and sets a clear expectation for the customer.',
  });
  // LLM-judge style score (seeded so the ⚖ chip shows without a key).
  await post(`/api/traces/${STAR_TRACE}/scores`, {
    name: 'correctness',
    value: 0.9,
    source: 'llm-judge',
    comment:
      'Answer matches the looked-up order status, avoids inventing a tracking number, and stays on-policy. Minor deduction for not offering a discount code.',
  });
  console.log('[seed] scores added');

  // Dataset + items from real traces + a completed run with aggregates.
  const { dataset } = await post('/api/datasets', {
    name: 'regressions',
    description: 'Golden support tickets we never want to regress on.',
  });
  const dsId = dataset.id;
  const fromTraces = ['tr_star_ticket', 'tr_fill_0', 'tr_fill_1', 'tr_fill_4', 'tr_onb_write'];
  for (const tid of fromTraces) {
    try {
      await post(`/api/datasets/${dsId}/items/from-trace`, { traceId: tid });
    } catch (e) {
      console.warn(`[seed] dataset item from ${tid} skipped: ${e.message}`);
    }
  }
  console.log(`[seed] dataset ${dsId} seeded from traces`);

  // Synthetic replay + completed run need DB access.
  seedSyntheticReplay();
  seedSyntheticRun(dsId);

  console.log('[seed] done');
}

main().catch((e) => {
  console.error('[seed] failed:', e);
  process.exit(1);
});
