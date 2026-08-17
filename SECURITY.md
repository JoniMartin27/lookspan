# Security Policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

Report privately via GitHub Security Advisories:
**https://github.com/JoniMartin27/lookspan/security/advisories/new**

(or email the maintainer). Include steps to reproduce and the affected version.
You'll get an acknowledgement, and a fix or mitigation will be coordinated before
any public disclosure.

## Scope & posture

Lookspan is **local-first**: by default the server binds to `127.0.0.1` and
stores data in local SQLite — nothing leaves your machine.

- **Exposing beyond loopback** (`--host 0.0.0.0`) requires a token
  (`--token` / `LOOKSPAN_TOKEN`); `/api/*` and `/v1/*` then require
  `Authorization: Bearer <token>`. The CLI refuses the exposure without one.
  Tokens are never accepted in query strings. Put non-loopback deployments
  behind HTTPS; the dashboard cookie is marked `Secure` when served over HTTPS.
- **Credential redaction**: the collector masks values of credential-looking
  keys (`authorization`, `api_key`, `token`, `secret`, `password`, `cookie`…)
  in span `input`/`attributes` before persisting.
- SQL is parameterized; the dashboard escapes output (no `dangerouslySetInnerHTML`).

The codebase has been security-reviewed; known findings (open CORS + no-auth when
exposed, and unredacted telemetry) are remediated as described above.

## Supported versions

Latest `0.x` release on npm/PyPI.
