import { useEffect, useRef } from 'react';

/**
 * Keyboard behaviour for the side drawers.
 *
 * They used to open with the focus left behind on the button that opened them:
 * a keyboard user had to tab through the whole page to reach the panel, and
 * Escape did nothing. This moves focus into the drawer, closes it on Escape,
 * and puts focus back where it was when it goes away.
 *
 * Focus is *not* trapped on purpose — the page underneath stays usable, so the
 * drawer is a labelled dialog rather than a modal one.
 */
export function useDrawer<T extends HTMLElement>(onClose: () => void) {
  const ref = useRef<T>(null);
  // Parents pass an inline arrow, so the callback identity changes on every
  // render. Keeping it in a ref stops the effect from re-running (and stealing
  // focus back) while the drawer is open.
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close.current();
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previous?.focus?.();
    };
  }, []);

  return ref;
}
