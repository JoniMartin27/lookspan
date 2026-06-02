import type { Alert } from '@lookspan/types';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useStream } from '../hooks/useStream.ts';

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

  const { connected } = useStream((event) => {
    if (event.type !== 'alert.triggered') return;
    const alert = event.alert as Alert;
    const id = nextId.current++;
    setToasts((t) => [...t, { id, alert }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 8000);

    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Lookspan alert', { body: alert.message });
    }
  });

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-neutral-800 px-6 py-3">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            <span className="text-brand-500">●</span> Lookspan
          </Link>
          <nav className="flex gap-4 text-sm text-neutral-400">
            <NavLink href="/" active={location === '/'}>
              Traces
            </NavLink>
            <NavLink href="/sessions" active={location.startsWith('/sessions')}>
              Sessions
            </NavLink>
            <NavLink href="/costs" active={location === '/costs'}>
              Costs
            </NavLink>
            <NavLink href="/alerts" active={location === '/alerts'}>
              Alerts
            </NavLink>
          </nav>
        </div>
        <div className="flex items-center gap-2 text-xs text-neutral-500">
          <span
            className={`inline-block size-2 rounded-full ${
              connected ? 'bg-emerald-500' : 'bg-neutral-600'
            }`}
          />
          {connected ? 'live' : 'offline'}
        </div>
      </header>
      <main className="flex-1 overflow-auto">{children}</main>

      <div className="pointer-events-none fixed bottom-4 right-4 flex w-80 flex-col gap-2">
        {toasts.map(({ id, alert }) => (
          <div
            key={id}
            className="pointer-events-auto rounded-lg border border-red-500/40 bg-neutral-900 p-3 shadow-lg"
          >
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-red-400">
              🔔 Alert · {alert.condition}
            </div>
            <p className="mt-1 text-sm text-neutral-200">{alert.message}</p>
          </div>
        ))}
      </div>
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
