/**
 * Frameworks Lookspan knows about by name.
 *
 * This is a *hint*, not a gate: ingest accepts any non-empty string, because
 * the point of Lookspan is to receive spans from whatever is producing them.
 * These are the ones the dashboard can label and order nicely out of the box.
 */
export const FrameworkName = {
  Mcp: 'mcp',
  LangGraph: 'langgraph',
  CrewAi: 'crewai',
  AgentOs: 'agent-os',
  OpenAiAgents: 'openai-agents',
  Otlp: 'otlp',
  Custom: 'custom',
} as const;

export type FrameworkName = (typeof FrameworkName)[keyof typeof FrameworkName];

/**
 * What a span or trace actually carries.
 *
 * Any string is valid. The union with `FrameworkName` is there purely so
 * editors still autocomplete the known ones; `& {}` stops TypeScript from
 * collapsing the whole thing to `string` and losing that.
 *
 * Reading used to coerce anything unknown to `"custom"` and warn once per row,
 * which both misreported the data — a span from `inferbench` came back as
 * `custom` — and flooded the console on every listing.
 */
export type FrameworkLabel = FrameworkName | (string & {});

export interface FrameworkAdapter {
  readonly name: FrameworkName;
  start(): Promise<void>;
  stop(): Promise<void>;
}
