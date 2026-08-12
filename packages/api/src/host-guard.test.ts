/**
 * CORS stops another origin from *reading* the API. DNS rebinding walks around
 * it: the attacker points their domain at 127.0.0.1 after the page has loaded,
 * and from then on the browser calls it same-origin, so no CORS check runs. All
 * that reaches the server is a request whose `Host` says `evil.example` — and
 * it used to be answered like any other, read and write.
 */
import { describe, expect, it } from 'vitest';
import { bindsToLoopback, hostAllowed, hostnameFrom, isLoopbackHostname } from './host-guard.js';

describe('hostnameFrom', () => {
  it('drops the port', () => {
    expect(hostnameFrom('localhost:3100')).toBe('localhost');
    expect(hostnameFrom('127.0.0.1:3100')).toBe('127.0.0.1');
  });

  it('keeps a hostname that has no port', () => {
    expect(hostnameFrom('localhost')).toBe('localhost');
  });

  it('unwraps a bracketed IPv6 address', () => {
    expect(hostnameFrom('[::1]:3100')).toBe('::1');
    expect(hostnameFrom('[::1]')).toBe('::1');
  });

  it('does not truncate a bare IPv6 at its first colon', () => {
    // `::1` has two colons and no port. Splitting on the first one would leave
    // an empty string, which then fails the loopback check for the wrong reason.
    expect(hostnameFrom('::1')).toBe('::1');
  });

  it('lowercases and trims', () => {
    expect(hostnameFrom('  LocalHost:3100 ')).toBe('localhost');
  });
});

describe('isLoopbackHostname', () => {
  it('accepts the names a local server is legitimately reached by', () => {
    for (const h of ['localhost', '127.0.0.1', '::1', '0:0:0:0:0:0:0:1']) {
      expect(isLoopbackHostname(h), h).toBe(true);
    }
  });

  it('accepts the whole 127.0.0.0/8 block', () => {
    // Not just 127.0.0.1 — 127.0.0.2 and friends are equally loopback.
    for (const h of ['127.0.0.2', '127.1.1.1', '127.255.255.254']) {
      expect(isLoopbackHostname(h), h).toBe(true);
    }
  });

  it('accepts *.localhost, which is reserved and cannot be registered', () => {
    expect(isLoopbackHostname('app.localhost')).toBe(true);
    expect(isLoopbackHostname('a.b.localhost')).toBe(true);
  });

  it('rejects a name that merely ends in the same letters', () => {
    // The check must be on the label boundary: `notlocalhost` is a name an
    // attacker could actually register.
    expect(isLoopbackHostname('notlocalhost')).toBe(false);
    expect(isLoopbackHostname('localhost.evil.example')).toBe(false);
    expect(isLoopbackHostname('evil.example')).toBe(false);
  });

  it('rejects addresses outside the loopback block', () => {
    for (const h of ['128.0.0.1', '10.0.0.1', '192.168.1.5', '0.0.0.0', '1270.0.0.1']) {
      expect(isLoopbackHostname(h), h).toBe(false);
    }
  });
});

describe('hostAllowed', () => {
  it('allows the requests a local dashboard actually makes', () => {
    for (const h of ['localhost:3100', '127.0.0.1:3100', '[::1]:3100']) {
      expect(hostAllowed(h), h).toBe(true);
    }
  });

  it('rejects a rebound request', () => {
    expect(hostAllowed('evil.example')).toBe(false);
    expect(hostAllowed('evil.example:3100')).toBe(false);
  });

  it('rejects a missing Host', () => {
    // HTTP/1.1 requires it; anything arriving without one is not a browser
    // doing something ordinary.
    expect(hostAllowed(undefined)).toBe(false);
    expect(hostAllowed('')).toBe(false);
  });
});

describe('bindsToLoopback', () => {
  it('is true for the default bind', () => {
    expect(bindsToLoopback('127.0.0.1')).toBe(true);
    expect(bindsToLoopback('localhost')).toBe(true);
    expect(bindsToLoopback('::1')).toBe(true);
  });

  it('is false once the user has exposed the server on purpose', () => {
    // `--host 0.0.0.0` is reachable directly, so rebinding buys an attacker
    // nothing and enforcing the header would break reaching it by name.
    expect(bindsToLoopback('0.0.0.0')).toBe(false);
    expect(bindsToLoopback('192.168.1.20')).toBe(false);
  });
});
