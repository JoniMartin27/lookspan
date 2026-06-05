import type { TokenUsage } from '@lookspan/types';

/**
 * Provider API keys, supplied at startup from env/flags and held only in
 * memory. They are NEVER written to the database or logged. Replay and
 * LLM-as-judge are the only features that use them, and only on demand.
 */
export interface InferenceKeys {
  openai?: string;
  anthropic?: string;
}

export type Provider = 'openai' | 'anthropic';

export class MissingKeyError extends Error {
  constructor(public readonly provider: Provider) {
    super(`no API key configured for ${provider}`);
    this.name = 'MissingKeyError';
  }
}

/**
 * Resolve which provider to call. Infer from the model id first (so an explicit
 * model override like `claude-…` wins), then fall back to the recorded provider
 * for models whose name doesn't reveal the vendor (proxies, custom ids).
 */
export function resolveProvider(
  model: string | null | undefined,
  recorded?: string | null,
): Provider | null {
  const m = (model ?? '').toLowerCase();
  if (m.includes('claude')) return 'anthropic';
  if (m.includes('gpt') || /\bo[1-9]/.test(m) || m.startsWith('o1') || m.startsWith('o3')) {
    return 'openai';
  }
  const r = (recorded ?? '').toLowerCase();
  if (r === 'openai' || r === 'anthropic') return r;
  return null;
}

export function keyFor(provider: Provider, keys: InferenceKeys): string {
  const key = provider === 'openai' ? keys.openai : keys.anthropic;
  if (!key) throw new MissingKeyError(provider);
  return key;
}

export function hasAnyKey(keys: InferenceKeys): boolean {
  return Boolean(keys.openai || keys.anthropic);
}

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_RETRIES = 1;

function envInt(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/**
 * Per-request options handed to the provider SDKs. Without a timeout, a slow or
 * hung upstream API would keep the replay/judge HTTP request open indefinitely
 * and tie up server resources. Both the OpenAI and Anthropic SDKs accept these
 * as the second argument to `create()` and abort the underlying request on
 * timeout. Tunable via env:
 *   LOOKSPAN_INFERENCE_TIMEOUT_MS  (default 60000)
 *   LOOKSPAN_INFERENCE_MAX_RETRIES (default 1)
 */
export function inferenceRequestOptions(): { timeout: number; maxRetries: number } {
  return {
    timeout: envInt('LOOKSPAN_INFERENCE_TIMEOUT_MS', DEFAULT_TIMEOUT_MS),
    maxRetries: envInt('LOOKSPAN_INFERENCE_MAX_RETRIES', DEFAULT_MAX_RETRIES),
  };
}

export interface ChatResult {
  text: string;
  model: string;
  usage: TokenUsage;
}

// Provider SDKs are loaded lazily so the server boots fast and installs that
// never use replay/judge don't pay the import cost. They are declared as real
// deps so they're always present when needed.
// biome-ignore lint/suspicious/noExplicitAny: provider SDK shapes are external
type AnyClient = any;

async function openaiClient(apiKey: string): Promise<AnyClient> {
  const mod = (await import('openai')) as { default?: unknown };
  const OpenAI = (mod.default ?? mod) as new (o: { apiKey: string }) => AnyClient;
  return new OpenAI({ apiKey });
}

async function anthropicClient(apiKey: string): Promise<AnyClient> {
  const mod = (await import('@anthropic-ai/sdk')) as { default?: unknown };
  const Anthropic = (mod.default ?? mod) as new (o: { apiKey: string }) => AnyClient;
  return new Anthropic({ apiKey });
}

function asText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter(
        (b): b is { type: string; text: string } =>
          !!b && typeof b === 'object' && (b as { type?: unknown }).type === 'text',
      )
      .map((b) => b.text)
      .join('');
  }
  return '';
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/**
 * Re-run a stored request (`params` = the captured `messages`/`system`/etc.)
 * against `model`, forcing a non-streaming call. Returns reply text + usage.
 */
export async function runChat(opts: {
  provider: Provider;
  model: string;
  apiKey: string;
  params: Record<string, unknown>;
}): Promise<ChatResult> {
  const { provider, model, apiKey, params } = opts;
  const { stream: _stream, ...rest } = params;

  if (provider === 'openai') {
    const client = await openaiClient(apiKey);
    const res = await client.chat.completions.create(
      { ...rest, model, stream: false },
      inferenceRequestOptions(),
    );
    const u = res?.usage ?? {};
    return {
      text: asText(res?.choices?.[0]?.message?.content),
      model: typeof res?.model === 'string' ? res.model : model,
      usage: {
        inputTokens: num(u.prompt_tokens),
        outputTokens: num(u.completion_tokens),
        costUsd: 0,
      },
    };
  }

  const client = await anthropicClient(apiKey);
  const maxTokens = typeof rest.max_tokens === 'number' ? rest.max_tokens : 1024;
  const res = await client.messages.create(
    {
      ...rest,
      model,
      max_tokens: maxTokens,
      stream: false,
    },
    inferenceRequestOptions(),
  );
  const u = res?.usage ?? {};
  return {
    text: asText(res?.content),
    model: typeof res?.model === 'string' ? res.model : model,
    usage: { inputTokens: num(u.input_tokens), outputTokens: num(u.output_tokens), costUsd: 0 },
  };
}

/**
 * Single-turn judge call: a system instruction + one user message, asking the
 * model to return a JSON verdict. Returns the raw text (caller parses JSON).
 */
export async function runJudge(opts: {
  provider: Provider;
  model: string;
  apiKey: string;
  system: string;
  user: string;
}): Promise<{ raw: string; model: string; usage: TokenUsage }> {
  const { provider, model, apiKey, system, user } = opts;

  if (provider === 'openai') {
    const client = await openaiClient(apiKey);
    const res = await client.chat.completions.create(
      {
        model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      },
      inferenceRequestOptions(),
    );
    const u = res?.usage ?? {};
    return {
      raw: asText(res?.choices?.[0]?.message?.content),
      model: typeof res?.model === 'string' ? res.model : model,
      usage: {
        inputTokens: num(u.prompt_tokens),
        outputTokens: num(u.completion_tokens),
        costUsd: 0,
      },
    };
  }

  const client = await anthropicClient(apiKey);
  const res = await client.messages.create(
    {
      model,
      max_tokens: 1024,
      system,
      messages: [{ role: 'user', content: user }],
    },
    inferenceRequestOptions(),
  );
  const u = res?.usage ?? {};
  return {
    raw: asText(res?.content),
    model: typeof res?.model === 'string' ? res.model : model,
    usage: { inputTokens: num(u.input_tokens), outputTokens: num(u.output_tokens), costUsd: 0 },
  };
}
