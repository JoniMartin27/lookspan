import { parseArgs } from 'node:util';
import type { InferenceKeys } from '@lookspan/api';
import { defaultDatabasePath, parseDuration } from '@lookspan/storage';
import { AlertCondition, type AlertRule } from '@lookspan/types';

export interface CliFlags {
  port: number;
  host: string;
  db: string;
  open: boolean;
  retentionMs: number | null;
  token: string | undefined;
  alertRules: AlertRule[];
  pricingFile: string | undefined;
  inferenceKeys: InferenceKeys;
  /** `--help` / `--version` short-circuit the server; main() prints and exits. */
  showHelp: boolean;
  showVersion: boolean;
}

/** A bad flag: the caller's fault, and the CLI should say so and stop. */
export class FlagError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FlagError';
  }
}

/** The environment `parseFlags` reads. Injected so it can be tested. */
export type Env = Record<string, string | undefined>;

function buildAlertRules(values: Record<string, unknown>, env: Env): AlertRule[] {
  const rules: AlertRule[] = [];
  const numFromEnv = (flag: unknown, envValue: string | undefined): number | undefined => {
    const raw = (flag as string) ?? envValue;
    if (raw === undefined) return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  };

  if (values['alert-error'] || env.LOOKSPAN_ALERT_ERROR) {
    rules.push({ id: 'error', condition: AlertCondition.Error });
  }
  const cost = numFromEnv(values['alert-cost'], env.LOOKSPAN_ALERT_COST);
  if (cost !== undefined)
    rules.push({ id: 'cost', condition: AlertCondition.CostOver, threshold: cost });
  const tokens = numFromEnv(values['alert-tokens'], env.LOOKSPAN_ALERT_TOKENS);
  if (tokens !== undefined)
    rules.push({ id: 'tokens', condition: AlertCondition.TokensOver, threshold: tokens });
  const duration = numFromEnv(values['alert-duration'], env.LOOKSPAN_ALERT_DURATION);
  if (duration !== undefined)
    rules.push({ id: 'duration', condition: AlertCondition.DurationOver, threshold: duration });

  return rules;
}

/**
 * Turn argv into the settings the server runs with.
 *
 * Kept out of `index.ts` and free of `process.exit` so it can be exercised
 * without starting a server: the entrypoint calls `main()` at module scope, so
 * anything living there is untestable by construction. Bad input throws a
 * `FlagError` and the caller decides how loudly to die.
 *
 * Precedence throughout: explicit flag > environment variable > built-in default.
 */
export function parseFlags(argv: string[], env: Env = process.env): CliFlags {
  let values: Record<string, unknown>;
  try {
    ({ values } = parseArgs({
      args: argv,
      allowPositionals: false,
      options: {
        port: { type: 'string', short: 'p' },
        host: { type: 'string' },
        db: { type: 'string' },
        retention: { type: 'string' },
        token: { type: 'string' },
        pricing: { type: 'string' },
        'openai-key': { type: 'string' },
        'anthropic-key': { type: 'string' },
        'alert-error': { type: 'boolean', default: false },
        'alert-cost': { type: 'string' },
        'alert-tokens': { type: 'string' },
        'alert-duration': { type: 'string' },
        open: { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
        version: { type: 'boolean', short: 'v', default: false },
      },
    }) as { values: Record<string, unknown> });
  } catch (err) {
    throw new FlagError((err as Error).message);
  }

  const retentionRaw = (values.retention as string) ?? env.LOOKSPAN_RETENTION;
  let retentionMs: number | null = null;
  if (retentionRaw) {
    retentionMs = parseDuration(retentionRaw);
    if (retentionMs === null) {
      throw new FlagError(`invalid --retention "${retentionRaw}" (use e.g. 7d, 24h, 30m)`);
    }
  }

  const portRaw = (values.port as string) ?? env.LOOKSPAN_PORT ?? '3100';
  const port = Number(portRaw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new FlagError(`invalid --port "${portRaw}" (use a number between 1 and 65535)`);
  }

  return {
    port,
    host: (values.host as string) ?? env.LOOKSPAN_HOST ?? '127.0.0.1',
    db: (values.db as string) ?? env.LOOKSPAN_DB ?? defaultDatabasePath(),
    open: Boolean(values.open),
    retentionMs,
    token: (values.token as string) ?? env.LOOKSPAN_TOKEN ?? undefined,
    alertRules: buildAlertRules(values, env),
    pricingFile: (values.pricing as string) ?? env.LOOKSPAN_PRICING ?? undefined,
    inferenceKeys: {
      openai: (values['openai-key'] as string) ?? env.LOOKSPAN_OPENAI_API_KEY ?? undefined,
      anthropic: (values['anthropic-key'] as string) ?? env.LOOKSPAN_ANTHROPIC_API_KEY ?? undefined,
    },
    showHelp: Boolean(values.help),
    showVersion: Boolean(values.version),
  };
}
