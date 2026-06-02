import type { SpanInput } from '@lookspan/types';

export const REDACTED = '[REDACTED]';

/**
 * Default set of sensitive key patterns. A key is redacted when its lowercased
 * name contains any of these substrings — so `api_key`, `X-Api-Key`,
 * `authorization`, `openai_token` and `client_secret` all match.
 */
const DEFAULT_PATTERNS = [
  'authorization',
  'api_key',
  'apikey',
  'token',
  'secret',
  'password',
  'passwd',
  'credential',
  'private_key',
  'access_key',
  'session_key',
  'cookie',
  'bearer',
];

/**
 * Secret-looking *values* to scrub even when the key name is innocent (e.g. a
 * provider key pasted inside a prompt). Conservative, prefix-anchored patterns
 * to avoid false positives on ordinary text.
 */
const SECRET_VALUE_PATTERNS: RegExp[] = [
  /sk-(?:proj-|ant-)?[A-Za-z0-9_-]{16,}/g, // OpenAI / Anthropic keys
  /gh[pousr]_[A-Za-z0-9]{20,}/g, // GitHub tokens
  /AKIA[0-9A-Z]{16}/g, // AWS access key id
  /AIza[0-9A-Za-z_-]{30,}/g, // Google API key
  /xox[baprs]-[A-Za-z0-9-]{10,}/g, // Slack tokens
  /\bBearer\s+[A-Za-z0-9._-]{12,}/gi, // Authorization: Bearer <token>
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{6,}/g, // JWT
];

function scrubSecrets(value: string): string {
  let out = value;
  for (const re of SECRET_VALUE_PATTERNS) out = out.replace(re, REDACTED);
  return out;
}

export interface RedactOptions {
  /** Extra key substrings to redact, in addition to the defaults. */
  extraPatterns?: string[];
  /** Replace the default patterns entirely instead of extending them. */
  patterns?: string[];
  /** Max depth to recurse into nested objects/arrays (default 6). */
  maxDepth?: number;
  /** Also scrub secret-looking substrings inside string values (default true). */
  scrubValues?: boolean;
}

/** Lowercase and drop separators so `X-Api-Key` and `api_key` compare equal. */
function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[-_\s]/g, '');
}

function compilePatterns(options: RedactOptions): string[] {
  const raw = options.patterns ?? [...DEFAULT_PATTERNS, ...(options.extraPatterns ?? [])];
  return raw.map(normalizeKey);
}

function isSensitiveKey(key: string, patterns: string[]): boolean {
  const k = normalizeKey(key);
  return patterns.some((p) => k.includes(p));
}

function redactValue(
  value: unknown,
  patterns: string[],
  depth: number,
  maxDepth: number,
  scrub: boolean,
): unknown {
  if (typeof value === 'string') return scrub ? scrubSecrets(value) : value;
  if (depth >= maxDepth || value === null || typeof value !== 'object') return value;

  if (Array.isArray(value)) {
    return value.map((v) => redactValue(v, patterns, depth + 1, maxDepth, scrub));
  }

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    out[key] = isSensitiveKey(key, patterns)
      ? REDACTED
      : redactValue(val, patterns, depth + 1, maxDepth, scrub);
  }
  return out;
}

/** Recursively redact sensitive keys (and secret-looking values) in an object. */
export function redactObject<T>(obj: T, options: RedactOptions = {}): T {
  const patterns = compilePatterns(options);
  return redactValue(obj, patterns, 0, options.maxDepth ?? 6, options.scrubValues !== false) as T;
}

/**
 * Strip credentials from a span before it is persisted. Telemetry from agents
 * routinely carries prompts, headers and tool arguments that may include API
 * keys or tokens; this masks values whose key name looks sensitive in the
 * span's `input`, `output`-less metadata and `attributes`. Mutates and returns
 * the span.
 */
export function redactSpan(span: SpanInput, options: RedactOptions = {}): SpanInput {
  if (span.input) span.input = redactObject(span.input, options);
  if (span.attributes) span.attributes = redactObject(span.attributes, options);
  if (typeof span.output === 'string' && options.scrubValues !== false) {
    span.output = scrubSecrets(span.output);
  }
  return span;
}
