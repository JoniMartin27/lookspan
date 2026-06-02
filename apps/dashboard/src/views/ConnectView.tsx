import { useState } from 'react';

const ORIGIN = typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1:3100';

export default function ConnectView() {
  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="mb-1 text-xl font-semibold">Connect an agent</h1>
      <p className="mb-2 text-sm text-neutral-400">
        Lookspan is a passive receiver — your app <em>sends</em> spans to it. Pick the path that
        fits your stack; they all post to the same endpoint.
      </p>
      <p className="mb-6 text-xs text-neutral-500">
        Endpoint:{' '}
        <code className="rounded bg-neutral-800 px-1.5 py-0.5 font-mono text-neutral-200">
          {ORIGIN}
        </code>{' '}
        · data stays on this machine.
      </p>

      <Section
        title="Zero code — OpenAI / Anthropic via OpenTelemetry"
        subtitle="Easiest for LLM apps: auto-instruments your existing SDK calls, no Lookspan code."
        recommended
        code={`# pip install traceloop-sdk
from traceloop.sdk import Traceloop
Traceloop.init(api_endpoint="${ORIGIN}/v1/traces", disable_batch=True)

# ...use the OpenAI / Anthropic / LangChain SDK as usual —
# every model call now shows up in Lookspan.`}
      />

      <Section
        title="OpenAI SDK (drop-in, TypeScript)"
        subtitle="One line — wrap your client and every call is traced. No OTel, no proxy."
        recommended
        code={`// npm install @lookspan/openai
import OpenAI from 'openai';
import { observeOpenAI } from '@lookspan/openai';

const openai = observeOpenAI(new OpenAI(), { endpoint: '${ORIGIN}/api/ingest' });

// use openai exactly as before — every chat/embeddings call is now traced
await openai.chat.completions.create({ model: 'gpt-4o', messages });`}
      />

      <Section
        title="Anthropic SDK (drop-in, TypeScript)"
        subtitle="Same one-liner for Claude — wrap the client, every message call is traced."
        recommended
        code={`// npm install @lookspan/anthropic
import Anthropic from '@anthropic-ai/sdk';
import { observeAnthropic } from '@lookspan/anthropic';

const anthropic = observeAnthropic(new Anthropic(), { endpoint: '${ORIGIN}/api/ingest' });

await anthropic.messages.create({ model: 'claude-sonnet-4-6', max_tokens: 1024, messages });`}
      />

      <Section
        title="Any language — HTTP"
        subtitle="The universal path. Anything that can POST JSON works."
        code={`curl -X POST ${ORIGIN}/api/ingest \\
  -H "Content-Type: application/json" \\
  -d '{
    "spans": [{
      "traceId": "tr_1", "spanId": "sp_1", "parentSpanId": null,
      "type": "llm_call", "name": "my-agent.completion",
      "startedAt": "2026-06-03T10:00:00Z", "endedAt": "2026-06-03T10:00:01Z",
      "status": "ok", "framework": "custom",
      "model": "gpt-4o", "provider": "openai",
      "usage": { "inputTokens": 1200, "outputTokens": 300, "costUsd": 0 }
    }]
  }'`}
      />

      <Section
        title="Python"
        subtitle="Generic client, plus drop-in adapters for LangGraph / CrewAI."
        code={`# pip install lookspan          (+ lookspan-langgraph / lookspan-crewai)
from lookspan import LookspanClient
from lookspan_langgraph import LookspanCallbackHandler

client = LookspanClient(endpoint="${ORIGIN}/api/ingest")
handler = LookspanCallbackHandler(client=client, agent_id="my-agent")

graph.invoke({"messages": []}, config={"callbacks": [handler]})
client.flush()`}
      />

      <Section
        title="TypeScript / MCP"
        subtitle="Wrap any MCP client — every tool call becomes a span automatically."
        code={`// npm install @lookspan/mcp
import { wrapMcpClient, HttpSpanExporter } from '@lookspan/mcp';

const exporter = new HttpSpanExporter({ endpoint: '${ORIGIN}/api/ingest' });
const { client } = wrapMcpClient(mcpClient, { exporter, agentId: 'my-agent' });

await client.callTool({ name: 'read_file', arguments: { path: '/tmp/foo.txt' } });`}
      />

      <Section
        title="OpenTelemetry (raw)"
        subtitle="Already using OTel? Point your exporter here — no Lookspan SDK."
        code={`export OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=${ORIGIN}/v1/traces
# protobuf (the OTel default) and JSON are both accepted`}
      />

      <div className="mt-6 rounded-lg border border-neutral-800 bg-neutral-900/40 p-4 text-xs text-neutral-400">
        <p className="mb-1 font-medium text-neutral-300">Sending from another machine?</p>
        <p>
          By default Lookspan only listens on loopback. Start it with{' '}
          <code className="rounded bg-neutral-800 px-1 py-0.5 font-mono">
            --host 0.0.0.0 --token &lt;secret&gt;
          </code>{' '}
          and add{' '}
          <code className="rounded bg-neutral-800 px-1 py-0.5 font-mono">
            Authorization: Bearer &lt;secret&gt;
          </code>{' '}
          to your requests.
        </p>
      </div>
    </div>
  );
}

function Section({
  title,
  subtitle,
  code,
  recommended,
}: {
  title: string;
  subtitle: string;
  code: string;
  recommended?: boolean;
}) {
  return (
    <div className="mb-4 rounded-lg border border-neutral-800 bg-neutral-900/50">
      <div className="flex items-center justify-between gap-2 border-b border-neutral-800 px-4 py-2.5">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-medium text-neutral-200">
            {title}
            {recommended && (
              <span className="rounded bg-brand-600/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-brand-500">
                easiest
              </span>
            )}
          </h2>
          <p className="text-xs text-neutral-500">{subtitle}</p>
        </div>
        <CopyButton text={code} />
      </div>
      <pre className="overflow-auto p-4 font-mono text-[11px] leading-relaxed text-neutral-300">
        {code}
      </pre>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="shrink-0 rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:border-brand-500 hover:text-neutral-100"
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}
