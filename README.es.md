# Lookspan

**Dashboard de observabilidad local-first para agentes de IA. Nativo para MCP. Mira cada span que emiten tus agentes.**

[![CI](https://github.com/JoniMartin27/lookspan/actions/workflows/ci.yml/badge.svg)](https://github.com/JoniMartin27/lookspan/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/lookspan)](https://www.npmjs.com/package/lookspan)
[![license](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)

```bash
npx lookspan          # → http://127.0.0.1:3100
```

![Lookspan demo](docs/demo.gif)

> ▶ [Ver la presentación completa (75 segundos)](https://github.com/JoniMartin27/lookspan/releases/download/v0.4.1/lookspan-PRESENTATION.mp4)

```
Agente (MCP · LangGraph · CrewAI · OpenTelemetry · HTTP)  →  POST /api/ingest  →  SQLite  →  Dashboard en tiempo real
```

> 🇬🇧 Prefer English? Read the [English README](README.md).

---

## El problema

Cuando un agente de IA falla —o tarda demasiado, o gasta más tokens de lo esperado—
no hay forma nativa de ver qué ocurrió paso a paso. Las herramientas existentes son
cloud-first: piden cuentas, claves de API y enviar tus datos de producción a
servidores ajenos.

Lookspan hace lo contrario: **todo corre en tu máquina, los datos nunca salen de
ella, y el coste de infraestructura es cero.** Instrumenta tu agente con un
adaptador (o solo haz `POST` de JSON) y abre el dashboard en el navegador.

---

## Inicio rápido

```bash
npx lookspan              # → http://127.0.0.1:3100, sin instalar, sin nube
```

Envía tu primer span desde cualquier lenguaje:

```bash
curl -X POST http://127.0.0.1:3100/api/ingest \
  -H "Content-Type: application/json" \
  -d '{"spans":[{"traceId":"t1","spanId":"s1","parentSpanId":null,"type":"llm_call","name":"agent.run","startedAt":"2026-06-02T10:00:00Z","endedAt":"2026-06-02T10:00:01Z","status":"ok","framework":"custom","model":"gpt-4o","provider":"openai","usage":{"inputTokens":1000,"outputTokens":500,"costUsd":0}}]}'
```

Abre `http://127.0.0.1:3100` y verás la traza aparecer — con su coste calculado en el servidor.

---

## Características

- **Ingesta de spans por HTTP** — `POST /api/ingest` acepta batches JSON. Compatible con cualquier agente que pueda hacer una petición HTTP.
- **Nativo para MCP** — el SDK TypeScript `@lookspan/mcp` envuelve cualquier `McpClient` y emite un span por llamada a herramienta MCP, sin tocar el código del agente.
- **SDKs Python** — `lookspan` (cliente genérico) + adaptadores para LangGraph/LangChain (`lookspan-langgraph`) y CrewAI (`lookspan-crewai`).
- **SDKs drop-in OpenAI / Anthropic** — `@lookspan/openai` y `@lookspan/anthropic` envuelven tu cliente en una línea y trazan cada llamada a modelo (sin OTel, sin proxy).
- **OpenTelemetry** — receptor OTLP/HTTP en `POST /v1/traces`; apunta cualquier exporter OTel sin SDK propio. Los atributos `gen_ai.*` se mapean a provider/model/tokens.
- **Tiempo real** — SSE en `GET /api/stream` empuja `span.ingested`, `trace.updated` y `alert.triggered` al dashboard, sin polling.
- **Dashboard React** — lista de trazas con franja de salud + mini-barras de latencia/coste; detalle con **timeline (waterfall)** o árbol y **transcript de conversación** del prompt/respuesta; diffs de replay y comparación de runs A/B; costes y overview (tasa de error, latencia p50/p95/p99, coste por día); historial de alertas.
- **Seguimiento de costes** — agrega tokens (entrada/salida/caché/razonamiento) y calcula `cost_usd` por span y traza desde una tabla de precios, sobrescribible con `--pricing`.
- **Alertas** — avisos cuando una traza falla o supera un umbral de coste/tokens/duración (toast + notificación de escritorio + CLI + historial persistido).
- **Scores de evaluación** — adjunta métricas a una traza (`POST /api/traces/:id/scores`) desde un juez LLM, un assert o a mano.
- **Replay y juez LLM** — reejecuta el prompt capturado de una traza contra el mismo modelo u otro y compara coste/latencia/salida, o deja que un modelo juez puntúe la respuesta de 0 a 1. Requiere una clave de proveedor (por entorno, solo en memoria).
- **Datasets y experimentos** — junta prompts en un conjunto de pruebas (desde una traza o a mano), ejecuta todo el set contra un modelo en batch y puntúa cada salida con el juez — coste/latencia/score agregados por run.
- **Exportación y auditoría** — descarga el conjunto de trazas como CSV (apto para hojas de cálculo, UTF-8 BOM, a prueba de inyección de fórmulas), JSON (solo metadatos por defecto; `?raw=1` incluye atributos) o un informe de auditoría HTML imprimible y autocontenido (`format=html`) con procedencia, tarjetas de resumen y gráficos SVG. `GET /api/export/traces?format=csv|json|html`; respeta los filtros activos de framework/estado/sesión. Cada respuesta lleva procedencia/integridad (`X-Lookspan-Export-Sha256`, `-Count`, `-Truncated`).
- **SQLite local (por defecto), Postgres opcional** — migraciones versionadas. BD en `~/.lookspan/lookspan.db` por defecto; pasa una URL `postgres://…` a `--db` / `LOOKSPAN_DB` para usar el driver Postgres (mismo esquema, mismas features). Retención opcional con `--retention`.
- **Seguridad** — bind a `127.0.0.1` por defecto; auth opcional `--token`; redacción de credenciales antes de persistir.
- **CLI en una línea** — `npx lookspan` arranca servidor + dashboard sin instalación global.

---

## Integración con agentes

### SDK de OpenAI (drop-in)

Envuelve tu cliente en una línea — cada llamada a modelo queda trazada (sin OTel, sin proxy):

```bash
npm install @lookspan/openai
```

```typescript
import OpenAI from 'openai';
import { observeOpenAI } from '@lookspan/openai';

const openai = observeOpenAI(new OpenAI());
await openai.chat.completions.create({ model: 'gpt-4o', messages });
```

### SDK de Anthropic (drop-in)

```bash
npm install @lookspan/anthropic
```

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { observeAnthropic } from '@lookspan/anthropic';

const anthropic = observeAnthropic(new Anthropic());
await anthropic.messages.create({ model: 'claude-sonnet-4-6', max_tokens: 1024, messages });
```

### TypeScript / MCP

```bash
npm install @lookspan/mcp
```

```typescript
import { wrapMcpClient, HttpSpanExporter } from '@lookspan/mcp';

const exporter = new HttpSpanExporter({ endpoint: 'http://127.0.0.1:3100/api/ingest' });
const { client } = wrapMcpClient(mcpClient, { exporter, agentId: 'mi-agente' });

// Úsalo igual que antes — cada callTool emite un span tool_call.
await client.callTool({ name: 'read_file', arguments: { path: '/tmp/foo.txt' } });
await exporter.flush();
```

### Python (genérico, LangGraph, CrewAI)

```bash
pip install lookspan            # + lookspan-langgraph / lookspan-crewai
```

```python
from lookspan import LookspanClient
from lookspan_langgraph import LookspanCallbackHandler

client = LookspanClient(endpoint="http://127.0.0.1:3100/api/ingest")
handler = LookspanCallbackHandler(client=client, agent_id="mi-agente")

result = graph.invoke({"messages": []}, config={"callbacks": [handler]})
client.flush()
```

### OpenTelemetry (sin SDK)

Apunta cualquier exporter OTel al endpoint estándar:

```bash
export OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://127.0.0.1:3100/v1/traces
# se aceptan protobuf (el default de OTel) y JSON
```

Más ejemplos ejecutables en [`examples/`](examples/).

---

## Evaluar y replay

Los SDK drop-in capturan el prompt y la respuesta de cada llamada (`captureContent`,
activo por defecto; los secretos se redactan en el servidor). Con eso, Lookspan cierra
el ciclo de *observar* a *mejorar* — abre una traza y usa el panel **Replay & judge**,
o llama a la API directamente:

```bash
# Las claves de proveedor viven solo en memoria — nunca se guardan ni se loguean.
LOOKSPAN_OPENAI_API_KEY=sk-... npx lookspan
#   ...o LOOKSPAN_ANTHROPIC_API_KEY / --openai-key / --anthropic-key

# Reejecuta el prompt capturado contra otro modelo y compara coste/latencia/salida
curl -X POST localhost:3100/api/traces/<id>/replay -H 'content-type: application/json' \
  -d '{"model":"gpt-4o-mini"}'   # omite "model" para reejecutar el original

# Puntúa la respuesta de 0 a 1 con un juez LLM (se guarda como score "llm-judge")
curl -X POST localhost:3100/api/traces/<id>/judge -H 'content-type: application/json' \
  -d '{"metric":"correctness"}'
```

Para mantener prompts/salidas fuera de Lookspan, pasa `{ captureContent: false }`
a `observeOpenAI` / `observeAnthropic` — replay y juez quedan entonces deshabilitados.

### Datasets y experimentos

Escala la evaluación de una traza a un conjunto de pruebas. Crea un **dataset**
(con items sembrados desde trazas reales o a mano) y **ejecútalo** contra un modelo
— cada item se reejecuta y, opcionalmente, lo puntúa el juez, con coste/latencia/score
agregados por run. Gestiónalo desde **Datasets** en el dashboard, o:

```bash
# Crea un dataset y añade como item el prompt capturado de una traza
DS=$(curl -s -X POST localhost:3100/api/datasets -d '{"name":"regresiones"}' -H 'content-type: application/json' | jq -r .dataset.id)
curl -X POST localhost:3100/api/datasets/$DS/items/from-trace -H 'content-type: application/json' -d '{"traceId":"<id>"}'

# Ejecuta todo el set contra un modelo, puntuando cada salida
curl -X POST localhost:3100/api/datasets/$DS/run -H 'content-type: application/json' \
  -d '{"model":"gpt-4o-mini","judge":true,"metric":"correctness"}'
```

---

## API HTTP

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/health` | Estado del servicio |
| `POST` | `/api/ingest` | Ingesta de spans (body: `IngestPayload`) |
| `GET` | `/api/traces` | Lista de trazas (paginada; filtrable por `framework`, `status`, `sessionId`) |
| `GET` | `/api/traces/:id` | Detalle de una traza con sus spans y scores |
| `GET` | `/api/export/traces` | Descarga las trazas como fichero (`format=csv\|json\|html`; `raw=1` quita la redacción en JSON; mismos filtros `framework`/`status`/`sessionId`/`limit`) |
| `POST` | `/api/traces/:id/scores` | Adjunta un score de evaluación (`{name, value, comment?, source?}`) |
| `POST` | `/api/traces/:id/replay` | Reejecuta el prompt capturado (`{model?, provider?, spanId?}`); requiere clave de proveedor |
| `GET` | `/api/traces/:id/replays` | Lista los replays previos de la traza |
| `POST` | `/api/traces/:id/judge` | Juez LLM: puntúa prompt/respuesta (`{metric?, model?, provider?, rubric?}`) |
| `GET` `POST` | `/api/datasets` | Lista / crea datasets |
| `GET` | `/api/datasets/:id` | Detalle del dataset (items + runs) |
| `POST` | `/api/datasets/:id/items` | Añade item(s) (`{input, expected?}` o `{items:[…]}`) |
| `POST` | `/api/datasets/:id/items/from-trace` | Siembra un item desde el prompt capturado de una traza |
| `POST` | `/api/datasets/:id/run` | Ejecuta el set contra un modelo (`{model, judge?, metric?}`); requiere clave de proveedor |
| `GET` | `/api/runs/:id` | Resumen del run + resultados por item |
| `GET` | `/api/sessions` | Lista de sesiones (agentes, trazas, coste, errores, rango temporal) |
| `GET` | `/api/sessions/:id` | Resumen de la sesión + sus trazas (timeline multi-agente) |
| `GET` | `/api/costs/summary` | Desglose de costes (total, por modelo, proveedor, agente) |
| `GET` | `/api/stats` | Stats (totales, tasa de error, latencia p50/p95/p99, coste por día) |
| `GET` | `/api/alerts` | Historial de alertas disparadas |
| `GET` | `/api/stream` | Stream SSE de eventos en tiempo real |
| `POST` | `/v1/traces` | Receptor OTLP/HTTP de OpenTelemetry (JSON `ExportTraceServiceRequest`) |

---

## Opciones del CLI

```
npx lookspan [opciones]
  -p, --port <puerto>      Puerto de escucha            (por defecto: 3100)
      --host <host>        Host de escucha              (por defecto: 127.0.0.1)
      --db <ruta|url>      Ruta SQLite o URL postgres:// (por defecto: ~/.lookspan/lookspan.db)
      --retention <dur>    Poda trazas anteriores a p.ej. 7d, 24h, 30m
      --token <token>      Exige Authorization: Bearer <token> en la API
      --pricing <fichero>  Tabla de precios por modelo personalizada (JSON)
      --alert-error                Alerta si una traza falla
      --alert-cost <usd>           Alerta si una traza cuesta más de <usd>
      --alert-tokens <n>           Alerta si una traza supera <n> tokens
      --alert-duration <ms>        Alerta si una traza tarda más de <ms>
      --open               Abre el dashboard en el navegador
  -h, --help               Muestra la ayuda
  -v, --version            Muestra la versión
```

Cada flag tiene equivalente por entorno `LOOKSPAN_*` (`LOOKSPAN_PORT`, `LOOKSPAN_TOKEN`, `LOOKSPAN_PRICING`, `LOOKSPAN_ALERT_*`, …). Replay y juez LLM leen `LOOKSPAN_OPENAI_API_KEY` / `LOOKSPAN_ANTHROPIC_API_KEY` (o `--openai-key` / `--anthropic-key`); permanecen en memoria y nunca se persisten.

Consulta **[docs/CONFIGURATION.md](docs/CONFIGURATION.md)** para la referencia completa de flags + variables de entorno, valores por defecto y ejemplos (incluida la sección de Postgres).

---

## Comparación

| | **Lookspan** | Langfuse | Phoenix (Arize) |
|---|---|---|---|
| Arranque | `npx lookspan` (cero infra) | Docker + Postgres + ClickHouse | `pip install` (Python) |
| Almacenamiento | SQLite local | Postgres + ClickHouse | local / en memoria |
| Foco | stack **TS/JS + MCP** | plataforma completa (evals, prompts) | evals / RAG (Python) |
| Tus datos | nunca salen de tu máquina | self-host o nube | local o nube |
| OpenTelemetry | receptor OTLP nativo | sí | sí (OTel-native) |

Lookspan no intenta ser una plataforma completa: apuesta por ser **la capa de
observabilidad sin setup para agentes TypeScript/MCP**, con la mejor experiencia
en los primeros 5 minutos. Roadmap en [docs/ROADMAP.md](docs/ROADMAP.md).

---

## Seguridad

Lookspan escucha en `127.0.0.1` (loopback) y no requiere auth por defecto — ideal
para uso local. Si lo expones (`--host 0.0.0.0`), protégelo con un token:

```bash
LOOKSPAN_TOKEN=mi-token npx lookspan --host 0.0.0.0
# /api/* y /v1/* exigen Authorization: Bearer mi-token (/api/health queda exento).
```

El collector además **redacta** valores de claves sensibles (`authorization`,
`api_key`, `token`, `secret`, `password`, `cookie`…) en `input`/`attributes`
antes de persistir, para que la telemetría no arrastre credenciales a la BD.

---

## Desarrollo

Monorepo npm-workspaces. `packages/` son librerías internas, `apps/` el dashboard,
`python/` los SDKs Python independientes.

```bash
git clone https://github.com/JoniMartin27/lookspan.git
cd lookspan
npm install
npm run dev        # API en :3100, dashboard con hot-reload en :5173
npm run ci         # typecheck + lint + test + build
```

Contribuciones bienvenidas — ver [.github/CONTRIBUTING.md](.github/CONTRIBUTING.md).
Proceso de release en [docs/PUBLISHING.md](docs/PUBLISHING.md). Política de seguridad: [SECURITY.md](SECURITY.md).

---

## Licencia

MIT — Copyright (c) 2026 Jonathan Martin. Consulta [LICENSE](LICENSE).

---

Lookspan forma parte de [**Fervon**](https://fervon.dev), el estudio que agrupa un portfolio de herramientas open source para desarrolladores (Trace, InferBench, ClaudeScope, Launchpad y más). La identidad de marca Fervon se está aplicando a la landing — ver la rama `feat/fervon-theme`.
