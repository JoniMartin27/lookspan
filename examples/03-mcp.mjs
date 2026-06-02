// Instrument an MCP client with @lookspan/mcp so every tool call emits a span.
//
//   npm install @lookspan/mcp
//   node examples/03-mcp.mjs
//
// This standalone version uses the exporter directly to show the span shape.
// In a real app you'd use `wrapMcpClient(client, { exporter })` and just call
// the client normally — each `callTool` produces a span automatically.
import { HttpSpanExporter, newSpanId, newTraceId } from '@lookspan/mcp';

const exporter = new HttpSpanExporter({
  endpoint: process.env.LOOKSPAN_ENDPOINT ?? 'http://127.0.0.1:3100/api/ingest',
  source: 'mcp-example',
});

const traceId = newTraceId();
const startedAt = new Date().toISOString();

await exporter.send([
  {
    traceId,
    spanId: newSpanId(),
    parentSpanId: null,
    type: 'tool_call',
    name: 'mcp.read_file',
    startedAt,
    endedAt: new Date().toISOString(),
    status: 'ok',
    framework: 'mcp',
    attributes: { 'tool.name': 'read_file', 'tool.args': { path: '/tmp/foo.txt' } },
  },
]);
await exporter.flush();

console.log(`sent MCP tool_call span (trace ${traceId})`);
console.log('→ open http://127.0.0.1:3100 to see it');

// Real usage:
//   import { wrapMcpClient } from '@lookspan/mcp';
//   const { client } = wrapMcpClient(mcpClient, { exporter, agentId: 'my-agent' });
//   await client.callTool({ name: 'read_file', arguments: { path: '/tmp/foo.txt' } });
