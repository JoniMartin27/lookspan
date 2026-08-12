/**
 * Which `Host` headers a loopback-bound server will answer.
 *
 * CORS stops a page on another origin from *reading* the API. It does nothing
 * about DNS rebinding: an attacker points `evil.example` at 127.0.0.1 after the
 * page has loaded, and from then on the browser considers requests to
 * `evil.example` same-origin, so no CORS check applies at all. What arrives at
 * the server is an ordinary request whose `Host` says `evil.example` — and
 * until now that was answered like any other.
 *
 * Checking the header closes it, and costs nothing: a server bound to loopback
 * is only reachable, legitimately, as localhost or 127.0.0.1. A server the user
 * has deliberately exposed (`--host 0.0.0.0`) is a different matter — the
 * attacker can reach it directly there anyway — so the check is not applied.
 */

/** Strip the port and IPv6 brackets from a `Host` header value. */
export function hostnameFrom(header: string): string {
  const trimmed = header.trim().toLowerCase();
  // `[::1]:3100` → `::1`
  const bracketed = trimmed.match(/^\[([^\]]+)\]/);
  if (bracketed) return bracketed[1] as string;
  // `localhost:3100` → `localhost`. A bare IPv6 without brackets has several
  // colons; leave it alone rather than truncating it at the first one.
  const colons = (trimmed.match(/:/g) ?? []).length;
  if (colons === 1) return trimmed.slice(0, trimmed.indexOf(':'));
  return trimmed;
}

/**
 * True when the hostname names this machine's loopback interface.
 *
 * `*.localhost` is included because the whole TLD is reserved for loopback and
 * browsers resolve it locally — an attacker cannot register one.
 */
export function isLoopbackHostname(hostname: string): boolean {
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) return true;
  if (hostname === '::1' || hostname === '0:0:0:0:0:0:0:1') return true;
  // The whole 127.0.0.0/8 block, not just 127.0.0.1.
  return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname);
}

/** True when the bind address means "loopback only". */
export function bindsToLoopback(host: string): boolean {
  return isLoopbackHostname(host.trim().toLowerCase());
}

/**
 * Decide whether a request may be answered.
 *
 * A missing `Host` is rejected: HTTP/1.1 requires it, and the ones that arrive
 * without it are not browsers doing anything ordinary.
 */
export function hostAllowed(header: string | undefined): boolean {
  if (!header) return false;
  return isLoopbackHostname(hostnameFrom(header));
}
