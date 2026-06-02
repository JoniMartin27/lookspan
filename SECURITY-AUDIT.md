# SECURITY-AUDIT — lookspan

**Fecha:** 2026-05-29 · **Auditor:** Claude Opus 4.8 (MAX)
Dashboard de observabilidad TS para agentes IA, MCP-native, ingiere spans de telemetría.

## Resumen
**Postura buena, pensada para loopback.** SQL parametrizado, **sin XSS**, **0 vulnerabilidades npm**, bind a `127.0.0.1` por defecto. Los hallazgos solo son relevantes si se expone fuera de loopback.

## Hallazgos

| Sev | Fichero:línea | Descripción | Remediación |
|-----|---------------|-------------|-------------|
| ~~MEDIUM~~ RESUELTO | `packages/api/src/app.ts` | CORS por defecto `origin: true` y **ningún endpoint tenía auth**. **Remediado:** opción `authToken` en `createApp` + `--token`/`LOOKSPAN_TOKEN` en el CLI; exige `Authorization: Bearer` (o `?token=`) en `/api/*` y `/v1/*` (`/api/health` exento). El CLI avisa si se expone fuera de loopback sin token. Sigue abierto por defecto en `127.0.0.1` (uso local). |
| ~~MEDIUM~~ RESUELTO | `packages/collector/src/redact.ts` | El exporter enviaba atributos **sin redacción**. **Remediado:** el collector redacta en el servidor (cubre todos los SDKs) los valores de claves sensibles (`authorization`, `api_key`, `*token*`, `*secret*`, `password`, `cookie`…) en `input`/`attributes` antes de persistir. On por defecto; `redact: false` para desactivar. |

## Verificaciones OK (sin hallazgos)
- **SQL** (`packages/storage/src/repositories/{traces,costs}.ts`): los `${where}` solo concatenan **fragmentos SQL estáticos** (`'framework = @framework'`); los valores van por binding nombrado (`@param`) a better-sqlite3. `limit` clamped a 500. **Sin inyección SQL.**
- **XSS**: no hay `dangerouslySetInnerHTML` / `innerHTML` en `apps/dashboard` ni en `packages` — React escapa por defecto. Render de spans seguro.
- **Bind**: `127.0.0.1` por defecto (`LOOKSPAN_HOST`).
- **npm audit: 0 vulnerabilidades.**
- Sin secretos en el repo ni en el historial.

Ver auditoría completa del workspace: `../SECURITY-AUDIT-2026-05-29.md`
