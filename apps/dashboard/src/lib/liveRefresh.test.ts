/**
 * The stream fires once per stored span. What matters is that a lone trace
 * refreshes the screen at once, and that a flood does not refresh it thousands
 * of times — so both halves are tested against a clock we control.
 */
import { describe, expect, it } from 'vitest';
import {
  DATA_EVENTS,
  initialRefreshState,
  planRefresh,
  REFRESH_WINDOW_MS,
  type RefreshState,
  refreshRan,
} from './liveRefresh.ts';

const W = REFRESH_WINDOW_MS;

describe('which events count', () => {
  it('covers every event type the server emits for stored data', () => {
    for (const type of [
      'span.ingested',
      'trace.started',
      'trace.completed',
      'trace.updated',
      'alert.triggered',
    ]) {
      expect(DATA_EVENTS.has(type), `${type} should refresh the views`).toBe(true);
    }
  });

  it('ignores anything else', () => {
    expect(DATA_EVENTS.has('ping')).toBe(false);
    expect(DATA_EVENTS.has('')).toBe(false);
  });
});

describe('planRefresh', () => {
  it('refreshes immediately on the first event', () => {
    const plan = planRefresh(initialRefreshState, 1_000);
    expect(plan.run).toBe(true);
    expect(plan.scheduleIn).toBeNull();
    expect(plan.state).toEqual({ lastRunAt: 1_000, pending: false });
  });

  it('refreshes immediately again once the window has passed', () => {
    const after: RefreshState = { lastRunAt: 1_000, pending: false };
    expect(planRefresh(after, 1_000 + W).run).toBe(true);
    expect(planRefresh(after, 1_000 + W + 5_000).run).toBe(true);
  });

  it('schedules a trailing refresh for an event inside the window', () => {
    const after: RefreshState = { lastRunAt: 1_000, pending: false };
    const plan = planRefresh(after, 1_200);
    expect(plan.run).toBe(false);
    expect(plan.scheduleIn).toBe(W - 200);
    expect(plan.state.pending).toBe(true);
    // The trailing refresh must land exactly one window after the last one.
    expect(1_200 + (plan.scheduleIn as number)).toBe(1_000 + W);
  });

  it('drops every further event while a trailing refresh is pending', () => {
    let state: RefreshState = { lastRunAt: 1_000, pending: true };
    for (const t of [1_100, 1_150, 1_300, 1_600]) {
      const plan = planRefresh(state, t);
      expect(plan.run).toBe(false);
      expect(plan.scheduleIn).toBeNull();
      state = plan.state;
    }
    expect(state).toEqual({ lastRunAt: 1_000, pending: true });
  });

  it('collapses a flood into one refresh per window', () => {
    // 3,687 spans/s is what the load test measured; two seconds of that.
    let state = initialRefreshState;
    let now = 0;
    let refreshes = 0;
    const scheduled: number[] = [];
    for (let i = 0; i < 7_374; i++) {
      now += 2_000 / 7_374;
      // Any trailing refresh whose time has come runs before the next event.
      while (scheduled.length > 0 && (scheduled[0] as number) <= now) {
        state = refreshRan(scheduled.shift() as number);
        refreshes++;
      }
      const plan = planRefresh(state, now);
      state = plan.state;
      if (plan.run) refreshes++;
      else if (plan.scheduleIn !== null) scheduled.push(now + plan.scheduleIn);
    }
    // Two seconds at a 700 ms window: the leading refresh plus one per window.
    expect(refreshes).toBeLessThanOrEqual(Math.ceil(2_000 / W) + 1);
    expect(refreshes).toBeGreaterThan(1);
  });

  it('never lets a burst go unanswered', () => {
    // Whatever happens, an event either refreshes now or is covered by one
    // already scheduled — it is never simply dropped with nothing pending.
    const cases: RefreshState[] = [
      initialRefreshState,
      { lastRunAt: 500, pending: false },
      { lastRunAt: 500, pending: true },
    ];
    for (const state of cases) {
      const plan = planRefresh(state, 600);
      const covered = plan.run || plan.scheduleIn !== null || plan.state.pending;
      expect(covered, `state ${JSON.stringify(state)} left the event unanswered`).toBe(true);
    }
  });

  it('never schedules into the past, at any clock offset', () => {
    // A trailing refresh scheduled with a negative delay would fire instantly
    // while `pending` stayed set, and the burst after it would be dropped.
    // Reaching the scheduling branch means the window has not elapsed, so the
    // delay is structurally positive — including when the clock jumps back.
    // Swept rather than spot-checked: a single case passed even with the guard
    // removed, which is how the guard turned out to be unreachable.
    for (let offset = -5_000; offset <= 5_000; offset += 97) {
      const plan = planRefresh({ lastRunAt: 10_000, pending: false }, 10_000 + offset);
      if (plan.scheduleIn === null) continue; // ran immediately instead
      expect(plan.scheduleIn, `offset ${offset}`).toBeGreaterThan(0);
      if (offset >= 0) expect(plan.scheduleIn, `offset ${offset}`).toBeLessThanOrEqual(W);
    }
  });

  it('clears pending once the scheduled refresh runs', () => {
    const state = refreshRan(1_700);
    expect(state).toEqual({ lastRunAt: 1_700, pending: false });
    // …and the next event is served immediately again a window later.
    expect(planRefresh(state, 1_700 + W).run).toBe(true);
  });
});
