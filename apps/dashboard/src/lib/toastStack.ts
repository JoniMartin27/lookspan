/**
 * How many alert toasts to show at once.
 *
 * The stack was unbounded, and an agent failing in a loop fires one alert per
 * failure. Measured with thirty: the stack grew to 2,212px inside a 900px
 * window, so eighteen toasts sat off the top of the screen — and because each
 * toast takes pointer events, the ones still on screen covered the whole right
 * column. `elementFromPoint` on the Export button and the status filter both
 * came back as a toast: exactly the controls you reach for when things are
 * failing were the ones you could no longer click.
 *
 * Nothing is lost by capping it — every alert is persisted and listed under
 * /alerts. The toast is a notification, not the record.
 */
export const MAX_VISIBLE_TOASTS = 4;

export interface ToastStack<T> {
  /** The most recent toasts, oldest first, capped at `max`. */
  shown: T[];
  /** How many are being held back. */
  hidden: number;
}

/**
 * Split a toast list into what fits on screen and what does not.
 *
 * The newest are kept: when an agent is failing repeatedly, the latest failure
 * is the one worth reading, and the older ones are a scroll away in /alerts.
 */
export function visibleToasts<T>(toasts: T[], max: number = MAX_VISIBLE_TOASTS): ToastStack<T> {
  if (max <= 0) return { shown: [], hidden: toasts.length };
  if (toasts.length <= max) return { shown: toasts, hidden: 0 };
  return { shown: toasts.slice(-max), hidden: toasts.length - max };
}
