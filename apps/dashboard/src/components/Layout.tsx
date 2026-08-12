import type { Alert } from '@lookspan/types';
import { useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useStream } from '../hooks/useStream.ts';
import { DATA_EVENTS, initialRefreshState, planRefresh, refreshRan } from '../lib/liveRefresh.ts';
import { visibleToasts } from '../lib/toastStack.ts';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [location] = useLocation();
  const [toasts, setToasts] = useState<{ id: number; alert: Alert }[]>([]);
  const nextId = useRef(0);

  // Ask for desktop-notification permission once, lazily.
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      void Notification.requestPermission();
    }
  }, []);

  // The stream told us data changed, but nothing acted on it: every view
  // waited for its own `refetchInterval`, so a trace took up to 10 seconds to
  // appear while the header promised real-time updates. Refresh on the event
  // instead, collapsing bursts so a busy agent can't spam the API.
  const queryClient = useQueryClient();
  const refreshState = useRef(initialRefreshState);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    },
    [],
  );

  const onDataChanged = useCallback(() => {
    const plan = planRefresh(refreshState.current, Date.now());
    refreshState.current = plan.state;
    if (plan.run) {
      void queryClient.invalidateQueries();
      return;
    }
    if (plan.scheduleIn === null) return; // a trailing refresh already covers it
    refreshTimer.current = setTimeout(() => {
      refreshTimer.current = null;
      refreshState.current = refreshRan(Date.now());
      void queryClient.invalidateQueries();
    }, plan.scheduleIn);
  }, [queryClient]);

  const { connected } = useStream((event) => {
    if (DATA_EVENTS.has(event.type)) onDataChanged();

    if (event.type !== 'alert.triggered') return;
    const alert = event.alert as Alert;
    const id = nextId.current++;
    setToasts((t) => [...t, { id, alert }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 8000);

    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Lookspan alert', { body: alert.message });
    }
  });

  // An agent failing in a loop fires one alert per failure, and the stack was
  // unbounded: thirty of them covered the Export button and the filters.
  const { shown, hidden } = visibleToasts(toasts);

  return (
    <div className="flex h-full flex-col">
      {/* The seven nav items are wider than a phone. Let the nav scroll on its
          own axis so the page body never scrolls sideways. */}
      <header className="flex items-center justify-between gap-3 border-b border-neutral-800 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-4 sm:gap-6">
          <Link href="/" className="shrink-0 text-lg font-semibold tracking-tight">
            <span className="text-brand-500">●</span> Lookspan
          </Link>
          <nav className="flex gap-4 overflow-x-auto whitespace-nowrap text-sm text-neutral-400">
            <NavLink href="/" active={location === '/'}>
              Traces
            </NavLink>
            <NavLink href="/sessions" active={location.startsWith('/sessions')}>
              Sessions
            </NavLink>
            <NavLink href="/tools" active={location === '/tools'}>
              Tools
            </NavLink>
            <NavLink
              href="/datasets"
              active={location.startsWith('/datasets') || location.startsWith('/runs')}
            >
              Datasets
            </NavLink>
            <NavLink href="/costs" active={location === '/costs'}>
              Costs
            </NavLink>
            <NavLink href="/alerts" active={location === '/alerts'}>
              Alerts
            </NavLink>
            <NavLink href="/connect" active={location === '/connect'}>
              Connect
            </NavLink>
          </nav>
        </div>
        <div
          className="flex shrink-0 items-center gap-2 text-xs text-neutral-500"
          role="status"
          title={
            connected
              ? 'Connected to the live span stream — the dashboard updates in real time.'
              : 'Not connected to the live stream — views refresh on reload or navigation.'
          }
          aria-label={connected ? 'Live stream connected' : 'Live stream offline'}
        >
          <span
            className={`inline-block size-2 rounded-full ${
              connected ? 'bg-emerald-500' : 'bg-neutral-600'
            }`}
          />
          {connected ? 'live' : 'offline'}
        </div>
      </header>
      {/* Focusable so the keyboard can scroll it. Views like Costs are nothing
          but charts — no focusable content at all — which left their scroll
          area unreachable without a mouse. */}
      {/* biome-ignore lint/a11y/noNoninteractiveTabindex: this is the page's
          scroll container, and WCAG 2.1.1 needs it operable by keyboard. Views
          like Costs are nothing but charts — no focusable content at all — so
          without a tab stop here their content cannot be scrolled without a
          mouse. axe flags exactly this as `scrollable-region-focusable`. */}
      <main tabIndex={0} className="flex-1 overflow-auto">
        {children}
      </main>

      <footer className="border-t border-neutral-800 px-6 py-2 text-right text-[11px] text-neutral-500">
        Part of{' '}
        <a
          href="https://fervon.dev"
          target="_blank"
          rel="noreferrer"
          className="text-neutral-400 underline underline-offset-2 hover:text-brand-500"
        >
          Fervon
        </a>
      </footer>

      <section
        className="pointer-events-none fixed bottom-4 right-4 flex w-80 flex-col gap-2"
        aria-live="assertive"
        aria-label="Alert notifications"
      >
        {hidden > 0 && (
          <div className="pointer-events-auto rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-400">
            {`+${hidden} more `}
            <Link href="/alerts" className="text-brand-500 underline">
              in Alerts
            </Link>
          </div>
        )}
        {shown.map(({ id, alert }) => (
          <div
            key={id}
            role="alert"
            className="pointer-events-auto rounded-lg border border-red-500/40 bg-neutral-900 p-3 shadow-lg"
          >
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-red-400">
              🔔 Alert · {alert.condition}
            </div>
            <p className="mt-1 text-sm text-neutral-200">{alert.message}</p>
          </div>
        ))}
      </section>
    </div>
  );
}

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={active ? 'text-neutral-100' : 'text-neutral-400 hover:text-neutral-200'}
    >
      {children}
    </Link>
  );
}
