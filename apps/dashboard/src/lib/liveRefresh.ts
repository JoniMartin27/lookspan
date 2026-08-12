/**
 * Coalescing for the live stream.
 *
 * The server emits one `span.ingested` per stored span and one `trace.updated`
 * per affected trace. A single busy agent can produce thousands per second —
 * the load test measured 3,687 spans/s — so refetching once per event would
 * turn the dashboard into a denial of service against its own API.
 *
 * The planner below collapses a burst into at most one refresh per window,
 * while still refreshing *immediately* when events are sparse (the common case:
 * one agent, one trace, and a person watching for it to show up).
 *
 * It is deliberately pure — no timers, no React — because the dashboard has no
 * DOM test environment, and this is the part where the reasoning lives.
 */

/** Stream events that mean stored data changed. */
export const DATA_EVENTS: ReadonlySet<string> = new Set([
  'span.ingested',
  'trace.started',
  'trace.completed',
  'trace.updated',
  'alert.triggered',
]);

/** How long a burst is collapsed into one refresh. */
export const REFRESH_WINDOW_MS = 700;

export interface RefreshState {
  /** When the last refresh ran, or null if none has. */
  lastRunAt: number | null;
  /** True while a trailing refresh is already scheduled. */
  pending: boolean;
}

export const initialRefreshState: RefreshState = { lastRunAt: null, pending: false };

export interface RefreshPlan {
  /** Refresh right now. */
  run: boolean;
  /** Milliseconds until the trailing refresh, or null if none is needed. */
  scheduleIn: number | null;
  state: RefreshState;
}

/**
 * Decide what an incoming event should cause.
 *
 * - First event, or one arriving after a quiet window: refresh immediately.
 * - Event during the window: schedule a single trailing refresh at its end.
 * - Further events while that one is pending: nothing — it is already covered.
 */
export function planRefresh(
  state: RefreshState,
  now: number,
  windowMs: number = REFRESH_WINDOW_MS,
): RefreshPlan {
  if (state.pending) {
    return { run: false, scheduleIn: null, state };
  }
  if (state.lastRunAt === null || now - state.lastRunAt >= windowMs) {
    return { run: true, scheduleIn: null, state: { lastRunAt: now, pending: false } };
  }
  // Always positive: reaching here means `now - lastRunAt < windowMs`, so the
  // end of the window is still ahead. A clock that jumps backwards only pushes
  // the trailing refresh further out, never into the past.
  const scheduleIn = state.lastRunAt + windowMs - now;
  return { run: false, scheduleIn, state: { ...state, pending: true } };
}

/**
 * The state after a refresh has run: the window restarts and nothing is
 * pending, whatever came before.
 */
export function refreshRan(now: number): RefreshState {
  return { lastRunAt: now, pending: false };
}
