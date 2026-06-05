import type { ReactNode } from 'react';

interface EmptyStateProps {
  /** Optional bold heading (e.g. "No traces yet"). */
  title?: ReactNode;
  /** Supporting copy / call to action. */
  children?: ReactNode;
  /** Extra classes appended to the dashed container. */
  className?: string;
}

/**
 * The dashed "nothing here yet" placeholder used across the dashboard's list
 * views. Centralizes the markup that was copy-pasted in six views so the look
 * stays consistent and is changed in one place.
 */
export function EmptyState({ title, children, className }: EmptyStateProps) {
  return (
    <div
      className={`rounded-lg border border-dashed border-neutral-800 p-10 text-center text-sm text-neutral-400${
        className ? ` ${className}` : ''
      }`}
    >
      {title ? <p className="mb-2 text-base font-medium text-neutral-200">{title}</p> : null}
      {children ? <p className="text-sm">{children}</p> : null}
    </div>
  );
}
