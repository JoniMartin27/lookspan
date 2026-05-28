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

export interface FrameworkAdapter {
  readonly name: FrameworkName;
  start(): Promise<void>;
  stop(): Promise<void>;
}
