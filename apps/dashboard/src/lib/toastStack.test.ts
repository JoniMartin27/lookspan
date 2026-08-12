/**
 * An agent failing in a loop fires one alert per failure, and every alert was
 * a toast on an unbounded stack.
 *
 * Measured in a browser with thirty of them: the stack grew to 2,212px inside
 * a 900px window, eighteen toasts sat off the top of the screen, and the ones
 * still visible covered the right-hand column. `elementFromPoint` on the
 * Export button and on the status filter both came back as a toast — the two
 * controls you reach for when things are failing were the ones you could no
 * longer click.
 */
import { describe, expect, it } from 'vitest';
import { MAX_VISIBLE_TOASTS, visibleToasts } from './toastStack.ts';

const list = (n: number) => Array.from({ length: n }, (_, i) => i);

describe('visibleToasts', () => {
  it('shows everything while the stack is small', () => {
    expect(visibleToasts([])).toEqual({ shown: [], hidden: 0 });
    expect(visibleToasts(list(1))).toEqual({ shown: [0], hidden: 0 });
    expect(visibleToasts(list(MAX_VISIBLE_TOASTS))).toEqual({
      shown: list(MAX_VISIBLE_TOASTS),
      hidden: 0,
    });
  });

  it('holds the rest back once it would overflow', () => {
    const { shown, hidden } = visibleToasts(list(30));
    expect(shown).toHaveLength(MAX_VISIBLE_TOASTS);
    expect(hidden).toBe(30 - MAX_VISIBLE_TOASTS);
  });

  it('keeps the newest, because that is the failure worth reading', () => {
    const { shown } = visibleToasts(list(10), 3);
    expect(shown).toEqual([7, 8, 9]);
  });

  it('accounts for every toast, at any size', () => {
    // Nothing may be quietly dropped: shown + hidden is the whole stack.
    for (const n of [0, 1, 3, 4, 5, 30, 500]) {
      const { shown, hidden } = visibleToasts(list(n));
      expect(shown.length + hidden, `${n} toasts`).toBe(n);
      expect(shown.length, `${n} toasts`).toBeLessThanOrEqual(MAX_VISIBLE_TOASTS);
    }
  });

  it('does not overflow a small window', () => {
    // A toast is roughly 74px with its gap. Four of them plus the "+N more"
    // line stay inside the shortest viewport the dashboard is designed for.
    const alturaAproximada = MAX_VISIBLE_TOASTS * 74 + 40;
    expect(alturaAproximada).toBeLessThan(600);
  });

  it('survives a nonsensical cap instead of showing a negative count', () => {
    expect(visibleToasts(list(5), 0)).toEqual({ shown: [], hidden: 5 });
    expect(visibleToasts(list(5), -3)).toEqual({ shown: [], hidden: 5 });
  });
});
