import type { SpanInput } from '@lookspan/types';
import { describe, expect, it } from 'vitest';
import { wrapMcpClient } from './instrument.js';

function captureExporter() {
  const spans: SpanInput[] = [];
  return {
    spans,
    exporter: {
      send: async (batch: SpanInput[]) => spans.push(...batch),
      flush: async () => {},
    },
  };
}

describe('wrapMcpClient content policy', () => {
  it('omits tool arguments and results by default', async () => {
    const { spans, exporter } = captureExporter();
    const { client } = wrapMcpClient(
      { callTool: async () => ({ content: [{ text: 'private result' }] }) },
      { exporter },
    );

    await client.callTool({ name: 'search', arguments: { query: 'private input' } });

    expect(spans[0]).toMatchObject({ input: null, output: null });
  });

  it('captures tool arguments and results only when opted in', async () => {
    const { spans, exporter } = captureExporter();
    const { client } = wrapMcpClient(
      { callTool: async () => ({ content: [{ text: 'visible result' }] }) },
      { exporter, captureContent: true },
    );

    await client.callTool({ name: 'search', arguments: { query: 'visible input' } });

    expect(spans[0].input).toMatchObject({ arguments: { query: 'visible input' } });
    expect(spans[0].output).toContain('visible result');
  });
});
