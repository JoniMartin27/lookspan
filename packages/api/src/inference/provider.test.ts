import { describe, expect, it } from 'vitest';
import { hasAnyKey, keyFor, MissingKeyError, resolveProvider } from './provider.js';

describe('resolveProvider', () => {
  it('prefers an explicit recorded provider', () => {
    expect(resolveProvider('whatever', 'openai')).toBe('openai');
    expect(resolveProvider('whatever', 'anthropic')).toBe('anthropic');
  });

  it('infers anthropic from claude models', () => {
    expect(resolveProvider('claude-sonnet-4-6')).toBe('anthropic');
    expect(resolveProvider('claude-3-5-haiku-latest')).toBe('anthropic');
  });

  it('infers openai from gpt and o-series models', () => {
    expect(resolveProvider('gpt-4o')).toBe('openai');
    expect(resolveProvider('gpt-4o-mini')).toBe('openai');
    expect(resolveProvider('o3-mini')).toBe('openai');
  });

  it('returns null when it cannot tell', () => {
    expect(resolveProvider(null)).toBeNull();
    expect(resolveProvider('mystery-model-1')).toBeNull();
  });
});

describe('keyFor / hasAnyKey', () => {
  it('returns the matching key', () => {
    expect(keyFor('openai', { openai: 'sk-a' })).toBe('sk-a');
    expect(keyFor('anthropic', { anthropic: 'sk-b' })).toBe('sk-b');
  });

  it('throws MissingKeyError when absent', () => {
    expect(() => keyFor('openai', {})).toThrow(MissingKeyError);
    expect(() => keyFor('anthropic', { openai: 'sk-a' })).toThrow(MissingKeyError);
  });

  it('hasAnyKey reflects whether any provider is configured', () => {
    expect(hasAnyKey({})).toBe(false);
    expect(hasAnyKey({ openai: 'sk-a' })).toBe(true);
    expect(hasAnyKey({ anthropic: 'sk-b' })).toBe(true);
  });
});
