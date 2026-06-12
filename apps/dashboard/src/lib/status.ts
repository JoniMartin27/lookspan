// A trace/span status is one of three states: ok, error, or cancelled. The UI
// historically treated it as binary (error → red, everything else → green),
// which painted a *cancelled* run in the same success-green as an ok one —
// misleading at a glance. Centralize the mapping here so every status pill in
// the dashboard agrees and cancelled reads as the neutral, "not a success"
// state it actually is.

export type StatusTone = 'ok' | 'error' | 'neutral';

/** Map any status (known or unknown) to one of three semantic tones. */
export function statusTone(status: string | null | undefined): StatusTone {
  if (status === 'error') return 'error';
  if (status === 'cancelled') return 'neutral';
  return 'ok';
}

/** Tailwind classes for a small status pill (`bg` + `text`). */
export function statusBadgeClass(status: string | null | undefined): string {
  switch (statusTone(status)) {
    case 'error':
      return 'bg-red-500/10 text-red-400';
    case 'neutral':
      return 'bg-neutral-500/10 text-neutral-400';
    default:
      return 'bg-emerald-500/10 text-emerald-400';
  }
}
