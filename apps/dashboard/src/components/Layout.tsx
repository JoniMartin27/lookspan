import type { ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { useStream } from '../hooks/useStream.ts';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [location] = useLocation();
  const { connected } = useStream();

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
            <NavLink href="/costs" active={location === '/costs'}>
              Costs
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
    </div>
  );
}

function NavLink({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      className={active ? 'text-neutral-100' : 'text-neutral-400 hover:text-neutral-200'}
    >
      {children}
    </Link>
  );
}
