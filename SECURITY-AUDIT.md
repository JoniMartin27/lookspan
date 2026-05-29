# SECURITY-AUDIT — lookspan

**Fecha:** 2026-05-29 · **Auditor:** Claude Opus 4.8 (MAX)
Dashboard de observabilidad TS para agentes IA, MCP-native, ingiere spans de telemetría.

## Resumen
**Postura buena, pensada para loopback.** SQL parametrizado, **sin XSS**, **0 vulnerabilidades npm**, bind a `127.0.0.1` por defecto. Los hallazgos solo son relevantes si se expone fuera de loopback.

## Hallazgos

| Sev | Fichero:línea | Descripción | Remediación |
|-----|---------------|-------------|-------------|
| MEDIUM | `packages/api/src/app.ts:18-23` | CORS por defecto `origin: true` (refleja cualquier origen, `credentials:false`) y **ningún endpoint tiene auth** (`/api/ingest`, `/api/traces`, `/api/costs`, `/api/stream`). Cualquiera que alcance la API puede leer trazas o inyectar spans. Mitigado por bind a `127.0.0.1` (`server.ts`). | Si se expone (`LOOKSPAN_HOST=0.0.0.0`): token de ingest + auth en lectura; acotar `corsOrigin`. |
| MEDIUM | `packages/sdk-mcp/src/exporter.ts` | El exporter envía atributos de spans **sin redacción**. Telemetría de agentes puede arrastrar prompts/headers/API keys a la BD y al dashboard. | Allowlist/denylist de atributos; redactar claves conocidas (`authorization`, `api_key`, `*token*`, `*secret*`) antes de exportar. |

## Verificaciones OK (sin hallazgos)
- **SQL** (`packages/storage/src/repositories/{traces,costs}.ts`): los `${where}` solo concatenan **fragmentos SQL estáticos** (`'framework = @framework'`); los valores van por binding nombrado (`@param`) a better-sqlite3. `limit` clamped a 500. **Sin inyección SQL.**
- **XSS**: no hay `dangerouslySetInnerHTML` / `innerHTML` en `apps/dashboard` ni en `packages` — React escapa por defecto. Render de spans seguro.
- **Bind**: `127.0.0.1` por defecto (`LOOKSPAN_HOST`).
- **npm audit: 0 vulnerabilidades.**
- Sin secretos en el repo ni en el historial.

Ver auditoría completa del workspace: `../SECURITY-AUDIT-2026-05-29.md`
