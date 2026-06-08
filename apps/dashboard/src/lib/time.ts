/**
 * Compact relative time for list views ("2m ago", "3h ago", "5d ago"), falling
 * back to a locale date for anything older than a week. A list can span many
 * days, so a bare `toLocaleTimeString()` (time only) hides which day a row is
 * from — pair this with the full timestamp in a `title` tooltip.
 */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return iso;
  const sec = Math.round((now - t) / 1000);
  if (sec < 5) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.round(hr / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(t).toLocaleDateString();
}
