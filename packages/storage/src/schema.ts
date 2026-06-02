export interface TraceRow {
  trace_id: string;
  root_name: string;
  framework: string;
  agent_id: string | null;
  session_id: string | null;
  started_at: string;
  ended_at: string | null;
  duration_ms: number | null;
  status: string;
  parent_trace_id: string | null;
  span_count: number;
  error_count: number;
  input_tokens: number;
  output_tokens: number;
  cached_input_tokens: number;
  reasoning_tokens: number;
  cost_usd: number;
  attributes: string | null;
  created_at: string;
}

export interface SpanRow {
  span_id: string;
  trace_id: string;
  parent_span_id: string | null;
  type: string;
  name: string;
  started_at: string;
  ended_at: string | null;
  duration_ms: number | null;
  status: string;
  framework: string;
  agent_id: string | null;
  session_id: string | null;
  model: string | null;
  provider: string | null;
  parent_trace_id: string | null;
  input: string | null;
  output: string | null;
  error: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cached_input_tokens: number | null;
  reasoning_tokens: number | null;
  cost_usd: number | null;
  attributes: string | null;
  received_at: string;
  created_at: string;
}

export interface AlertRow {
  id: number;
  rule_id: string;
  trace_id: string;
  condition: string;
  message: string;
  value: number | null;
  threshold: number | null;
  created_at: string;
}

export interface ScoreRow {
  id: number;
  trace_id: string;
  name: string;
  value: number;
  comment: string | null;
  source: string | null;
  created_at: string;
}
