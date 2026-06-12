import { describe, expect, it } from 'vitest';
import { statusBadgeClass, statusTone } from './status.ts';

describe('statusTone', () => {
  it('maps ok to the ok tone', () => {
    expect(statusTone('ok')).toBe('ok');
  });

  it('maps error to the error tone', () => {
    expect(statusTone('error')).toBe('error');
  });

  it('maps cancelled to a neutral tone, not ok', () => {
    // Regression: cancelled traces/spans used to fall through the binary
    // `=== 'error' ? red : green` check and render as a success-green badge.
    expect(statusTone('cancelled')).toBe('neutral');
    expect(statusTone('cancelled')).not.toBe('ok');
  });

  it('treats unknown/empty status as ok rather than throwing', () => {
    expect(statusTone(null)).toBe('ok');
    expect(statusTone(undefined)).toBe('ok');
  });
});

describe('statusBadgeClass', () => {
  it('uses red classes for error', () => {
    expect(statusBadgeClass('error')).toContain('text-red-400');
  });

  it('uses emerald (success) classes for ok', () => {
    expect(statusBadgeClass('ok')).toContain('text-emerald-400');
  });

  it('does NOT paint cancelled with success-emerald', () => {
    const cls = statusBadgeClass('cancelled');
    expect(cls).not.toContain('emerald');
    expect(cls).toContain('text-neutral-400');
  });
});
