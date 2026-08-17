/**
 * The CLI's flag wiring had no tests: `index.ts` calls `main()` at module
 * scope, so importing it started a server and nothing could be exercised. The
 * parsing now lives here, free of `process.exit`, and the environment is
 * injected rather than read from the ambient process.
 */
import { describe, expect, it } from 'vitest';
import { type Env, FlagError, parseFlags } from './flags.js';

/** No ambient environment: every test states exactly what it relies on. */
const parse = (argv: string[], env: Env = {}) => parseFlags(argv, env);

describe('defaults', () => {
  it('serves on 3100 and binds loopback', () => {
    const f = parse([]);
    expect(f.port).toBe(3100);
    expect(f.host).toBe('127.0.0.1');
  });

  it('starts with no retention, no token, no alerts and no provider keys', () => {
    const f = parse([]);
    expect(f.retentionMs).toBeNull();
    expect(f.token).toBeUndefined();
    expect(f.alertRules).toEqual([]);
    expect(f.inferenceKeys).toEqual({ openai: undefined, anthropic: undefined });
    expect(f.open).toBe(false);
  });
});

describe('binding security', () => {
  it('refuses a non-loopback bind without a token', () => {
    expect(() => parse(['--host', '0.0.0.0'])).toThrow(
      'refusing to expose Lookspan on 0.0.0.0 without --token or LOOKSPAN_TOKEN',
    );
  });

  it('allows a non-loopback bind when a token is configured', () => {
    expect(parse(['--host', '0.0.0.0', '--token', 'secret']).host).toBe('0.0.0.0');
  });
});

describe('precedence: flag beats environment beats default', () => {
  it('takes the flag when both are given', () => {
    expect(parse(['--port', '4000'], { LOOKSPAN_PORT: '5000' }).port).toBe(4000);
    expect(
      parse(['--host', '0.0.0.0', '--token', 'secret'], { LOOKSPAN_HOST: '10.0.0.1' }).host,
    ).toBe('0.0.0.0');
    expect(parse(['--token', 'del-flag'], { LOOKSPAN_TOKEN: 'del-env' }).token).toBe('del-flag');
  });

  it('falls back to the environment', () => {
    expect(parse([], { LOOKSPAN_PORT: '5000' }).port).toBe(5000);
    expect(parse([], { LOOKSPAN_TOKEN: 'secreto' }).token).toBe('secreto');
    expect(parse([], { LOOKSPAN_DB: 'postgres://u:p@h/d' }).db).toBe('postgres://u:p@h/d');
  });

  it('reads provider keys from either side', () => {
    expect(parse(['--openai-key', 'sk-flag']).inferenceKeys.openai).toBe('sk-flag');
    expect(parse([], { LOOKSPAN_ANTHROPIC_API_KEY: 'sk-env' }).inferenceKeys.anthropic).toBe(
      'sk-env',
    );
  });
});

describe('retention', () => {
  it('accepts the documented durations', () => {
    expect(parse(['--retention', '7d']).retentionMs).toBe(7 * 86_400_000);
    expect(parse(['--retention', '24h']).retentionMs).toBe(24 * 3_600_000);
    expect(parse(['--retention', '30m']).retentionMs).toBe(30 * 60_000);
  });

  it('rejects nonsense instead of silently keeping everything', () => {
    // Falling back to "no retention" would quietly ignore an operator's intent
    // to delete data.
    expect(() => parse(['--retention', 'pepino'])).toThrow(FlagError);
    expect(() => parse(['--retention', 'pepino'])).toThrow(/invalid --retention/);
  });
});

describe('port validation', () => {
  it.each([['0'], ['65536'], ['abc'], ['3100.5']])('rejects %s', (value) => {
    expect(() => parse(['--port', value])).toThrow(/invalid --port/);
  });

  it('rejects a negative port, though parseArgs catches it first', () => {
    // `-1` reads as another option, so the error comes from the argument
    // parser rather than the range check. Still refused, still a FlagError.
    expect(() => parse(['--port', '-1'])).toThrow(FlagError);
  });

  it('accepts the edges', () => {
    expect(parse(['--port', '1']).port).toBe(1);
    expect(parse(['--port', '65535']).port).toBe(65535);
  });

  it('rejects a bad port from the environment too', () => {
    // The env path used to skip every check the flag path had.
    expect(() => parse([], { LOOKSPAN_PORT: 'abc' })).toThrow(/invalid --port/);
  });
});

describe('alert rules', () => {
  it('builds nothing by default', () => {
    expect(parse([]).alertRules).toEqual([]);
  });

  it('builds one rule per requested condition', () => {
    const f = parse([
      '--alert-error',
      '--alert-cost',
      '1.5',
      '--alert-tokens',
      '1000',
      '--alert-duration',
      '30000',
    ]);
    expect(f.alertRules.map((r) => r.id).sort()).toEqual(['cost', 'duration', 'error', 'tokens']);
    expect(f.alertRules.find((r) => r.id === 'cost')?.threshold).toBe(1.5);
  });

  it('reads them from the environment as well', () => {
    const f = parse([], { LOOKSPAN_ALERT_ERROR: '1', LOOKSPAN_ALERT_COST: '2' });
    expect(f.alertRules.map((r) => r.id).sort()).toEqual(['cost', 'error']);
  });

  it('ignores a threshold that is not a number rather than alerting on NaN', () => {
    expect(parse(['--alert-cost', 'mucho']).alertRules).toEqual([]);
  });
});

describe('help and version short-circuit', () => {
  it('flags them instead of exiting the process', () => {
    // They used to call process.exit() from inside the parser, which is what
    // made this whole layer untestable.
    expect(parse(['--help']).showHelp).toBe(true);
    expect(parse(['-h']).showHelp).toBe(true);
    expect(parse(['--version']).showVersion).toBe(true);
    expect(parse(['-v']).showVersion).toBe(true);
    expect(parse([]).showHelp).toBe(false);
  });
});

describe('unknown input', () => {
  it('is a FlagError, not a crash', () => {
    expect(() => parse(['--no-existe'])).toThrow(FlagError);
    expect(() => parse(['posicional'])).toThrow(FlagError);
  });
});

describe('--cors-origin', () => {
  // Reflecting whatever origin asked meant any page the user visited could read
  // the whole local database from their browser. Empty is the safe default;
  // the flag exists so a genuine cross-origin caller can still opt in.
  it('allows no origin by default', () => {
    expect(parseFlags([], {}).corsOrigins).toEqual([]);
  });

  it('takes a single origin', () => {
    expect(parseFlags(['--cors-origin', 'https://app.example'], {}).corsOrigins).toEqual([
      'https://app.example',
    ]);
  });

  it('takes a comma-separated list and trims it', () => {
    expect(
      parseFlags(['--cors-origin', 'https://a.example, https://b.example'], {}).corsOrigins,
    ).toEqual(['https://a.example', 'https://b.example']);
  });

  it('reads the environment variable', () => {
    expect(parseFlags([], { LOOKSPAN_CORS_ORIGIN: 'https://c.example' }).corsOrigins).toEqual([
      'https://c.example',
    ]);
  });

  it('the flag wins over the environment', () => {
    const flags = parseFlags(['--cors-origin', 'https://flag.example'], {
      LOOKSPAN_CORS_ORIGIN: 'https://env.example',
    });
    expect(flags.corsOrigins).toEqual(['https://flag.example']);
  });

  it('an empty or comma-only value grants nothing', () => {
    // A blank value must not become an origin named "" — cors would treat a
    // falsy entry inconsistently and the intent is plainly "none".
    expect(parseFlags(['--cors-origin', ''], {}).corsOrigins).toEqual([]);
    expect(parseFlags(['--cors-origin', ' , , '], {}).corsOrigins).toEqual([]);
  });
});
