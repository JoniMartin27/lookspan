// "What made the model say this?" — the question a trace should answer at a
// glance. The chat transcript used to require the OpenAI shape
// (`input.messages` as a real array); anything else fell through and, because
// the reply alone was enough to render a transcript, the input was *silently
// dropped* — you saw the answer with no sign of the question.
//
// Real inputs seen in production are messier than the OpenAI shape:
//   {messages: [...]}                  OpenAI / Anthropic SDK wrappers
//   {messages: "[{\"role\":…}]"}       Python producers that JSON-stringify
//   {mensaje: "que hora es"}           an agent step: the trigger of the trace
//   {prompt_id: "chat"}                an id, not a prompt (never a bubble)
// So: parse what we can, and never throw the input away.

export interface ChatMessage {
  role: string;
  text: string;
}

/** Keys whose value is the prompt itself when there is no message list. */
const PROMPT_KEYS = [
  'prompt',
  'input',
  'text',
  'query',
  'question',
  'message',
  'user',
  'content',
  'instruction',
  'mensaje',
  'texto',
  'pregunta',
  'consulta',
  'orden',
  'valor',
];

/** Flatten OpenAI/Anthropic content parts (string | array of parts) to text. */
export function partsToText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((p) => {
        if (typeof p === 'string') return p;
        if (p && typeof p === 'object') {
          const o = p as { text?: unknown; type?: unknown };
          if (typeof o.text === 'string') return o.text;
          if (typeof o.type === 'string') return `「${o.type}」`;
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

/** JSON-decode a string that holds an object/array; leave anything else alone.
 *  Producers that can only store scalars (the Python tracer does) send the
 *  message list as a string — and a truncated one stays a string, on purpose:
 *  showing the raw text beats showing nothing. */
function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed.startsWith('[') && !trimmed.startsWith('{')) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function messageFrom(raw: unknown): ChatMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as { role?: unknown; content?: unknown; tool_calls?: unknown };
  const role = typeof m.role === 'string' ? m.role : 'user';
  let text = partsToText(m.content);
  if (Array.isArray(m.tool_calls)) {
    const calls = m.tool_calls
      .map((c) => {
        const fn = (c as { function?: { name?: unknown; arguments?: unknown } }).function;
        return fn?.name ? `🔧 ${String(fn.name)}(${String(fn.arguments ?? '')})` : '';
      })
      .filter(Boolean)
      .join('\n');
    text = [text, calls].filter(Boolean).join('\n');
  }
  return { role, text };
}

/** The single prompt-ish string of an input that carries no message list.
 *  Identifier-looking keys (`prompt_id`, `runId`…) are NOT prompts. */
function loneText(input: Record<string, unknown>): string | null {
  for (const key of PROMPT_KEYS) {
    const v = input[key];
    if (typeof v === 'string' && v.trim()) return v;
    const parts = partsToText(v);
    if (parts.trim()) return parts;
  }
  const entries = Object.entries(input).filter(([, v]) => v !== null && v !== undefined);
  if (entries.length === 1) {
    const [key, value] = entries[0] as [string, unknown];
    const isId = /(^|_)id$|Id$/.test(key);
    if (!isId && typeof value === 'string' && value.trim()) return value;
  }
  return null;
}

/** Read a span's stored request as a chat transcript, or null if there is
 *  nothing textual in it (a tool call's arguments, an id, an empty object). */
export function toMessages(
  input: Record<string, unknown> | null | undefined,
): ChatMessage[] | null {
  if (!input || typeof input !== 'object') return null;
  const out: ChatMessage[] = [];

  const system = parseMaybeJson(input.system);
  const systemText = typeof system === 'string' ? system : partsToText(system);
  if (systemText) out.push({ role: 'system', text: systemText });

  const msgs = parseMaybeJson(input.messages);
  if (Array.isArray(msgs)) {
    for (const raw of msgs) {
      const m = messageFrom(raw);
      if (m) out.push(m);
    }
    return out.length > 0 ? out : null;
  }
  if (typeof msgs === 'string' && msgs.trim()) {
    // A JSON list too long to have survived the producer's truncation.
    out.push({ role: 'user', text: msgs });
    return out;
  }

  const lone = loneText(input);
  if (lone) out.push({ role: 'user', text: lone });
  return out.length > 0 ? out : null;
}

export interface TracePrompt {
  /** Span that carried the prompt — click target, so the user can see it in context. */
  spanId: string;
  text: string;
  /** True when it came from the trace's own root span (the actual trigger)
   *  rather than from a nested LLM call. */
  fromRoot: boolean;
}

interface PromptSpan {
  spanId: string;
  parentSpanId: string | null;
  startedAt: string;
  input?: Record<string, unknown> | null;
}

/** The prompt that set a trace in motion: the last thing a *user* said in the
 *  earliest span that recorded one. Falls back through the tree, so a trace
 *  whose root has no input still shows the prompt of its first LLM call. */
export function tracePrompt(spans: PromptSpan[]): TracePrompt | null {
  if (spans.length === 0) return null;
  const ids = new Set(spans.map((s) => s.spanId));
  const ordered = [...spans].sort((a, b) => {
    const rootA = a.parentSpanId === null || !ids.has(a.parentSpanId);
    const rootB = b.parentSpanId === null || !ids.has(b.parentSpanId);
    if (rootA !== rootB) return rootA ? -1 : 1; // the root's prompt wins ties
    return new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime();
  });

  for (const span of ordered) {
    const messages = toMessages(span.input);
    if (!messages) continue;
    const user = [...messages].reverse().find((m) => m.role === 'user' && m.text.trim());
    if (!user) continue;
    const isRoot = span.parentSpanId === null || !ids.has(span.parentSpanId);
    return { spanId: span.spanId, text: user.text, fromRoot: isRoot };
  }
  return null;
}

/** Collapse a prompt to one readable line for headers and list rows. */
export function promptPreview(text: string, max = 180): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1)}…`;
}
