# Lookspan

**Dashboard de observabilidad local-first para agentes de IA. Nativo para MCP. Mira cada span que emiten tus agentes.**

```
POST /api/ingest  →  SQLite  →  Dashboard en tiempo real
```

---

## Qué problema resuelve

Cuando un agente de IA falla —o simplemente tarda demasiado o gasta más tokens de lo esperado— no hay forma nativa de ver qué ocurrió paso a paso. Las herramientas de observabilidad existentes requieren cuentas en la nube, claves de API y enviar datos de producción a servidores externos.

Lookspan resuelve esto de forma distinta: **todo corre en tu máquina, los datos nunca salen de ella, y el coste de infraestructura es cero**. Basta con instrumentar tu agente con un adaptador y abrir el dashboard en el navegador.

---

## Características

- **Ingesta de spans via HTTP** — endpoint `POST /api/ingest` que acepta batches de spans en formato JSON. Compatible con cualquier agente que pueda hacer una petición HTTP.
- **Nativo para MCP** — SDK TypeScript (`@lookspan/mcp`) que envuelve cualquier `McpClient` y emite automáticamente un span por cada llamada a herramienta MCP, sin modificar el código del agente.
- **Adaptadores Python** — SDKs para LangGraph/LangChain (`lookspan-langgraph`) y CrewAI (`lookspan-crewai`). También un cliente genérico (`lookspan`) para cualquier framework Python.
- **Adaptador AGENT-OS** — integración opt-in con AGENT-OS que se suscribe al bus SSE de eventos de control y convierte los eventos en spans de Lookspan.
- **Streaming en tiempo real** — endpoint SSE `GET /api/stream` que emite eventos `span.ingested` y `trace.updated` al dashboard sin polling.
- **Dashboard React** — lista de trazas reciente con nombre, framework, duración, número de spans, coste y estado; vista de detalle de traza con grafo de spans interactivo (React Flow); vista de costes con gráficos por modelo y proveedor.
- **Seguimiento de costes** — agrega tokens de entrada, salida, caché y razonamiento; calcula `cost_usd` por span y por traza; desglose por modelo y proveedor.
- **SQLite local** — esquema con migraciones versionadas. Base de datos en `~/.lookspan/lookspan.db` por defecto, configurable vía flag o variable de entorno.
- **CLI en una línea** — `npx lookspan` arranca el servidor y el dashboard sin instalación global.
- **Tipos de span** — `agent_step`, `llm_call`, `tool_call`, `retrieval`, `embedding`, `error`, `custom`.
- **Frameworks soportados** — `mcp`, `langgraph`, `crewai`, `agent-os`, `openai-agents`, `otlp`, `custom`.

---

## Stack tecnológico

### Servidor y lógica de negocio (TypeScript / Node.js)

| Paquete | Versión | Rol |
|---|---|---|
| Node.js | >=20.0.0 | Runtime |
| TypeScript | ^5.9.0 | Lenguaje |
| Express | ^5.1.0 | Servidor HTTP y SSE |
| better-sqlite3 | ^12.9.0 | Base de datos SQLite |
| `@modelcontextprotocol/sdk` | >=1.0.0 | Peer dep. del SDK MCP |

### Dashboard (React)

| Paquete | Versión | Rol |
|---|---|---|
| React | ^19.0.0 | UI |
| Vite | ^6.0.0 | Bundler / dev server |
| Tailwind CSS | ^4.0.0 | Estilos |
| @tanstack/react-query | ^5.62.0 | Cache y fetching de datos |
| @xyflow/react | ^12.4.0 | Grafo de spans interactivo |
| Recharts | ^2.15.0 | Gráficos de costes |
| Wouter | ^3.5.0 | Enrutado SPA |

### SDKs Python

| Paquete | Versión mínima | Rol |
|---|---|---|
| Python | >=3.10 | Runtime |
| httpx | >=0.27.0 | Cliente HTTP asíncrono |
| langchain-core | >=0.3.0 | Dep. del adaptador LangGraph |
| crewai | >=0.80.0 | Dep. del adaptador CrewAI |

### Herramientas de desarrollo

| Herramienta | Versión | Rol |
|---|---|---|
| Biome | ^2.2.0 | Linter y formatter |
| Vitest | ^3.0.0 | Tests |
| concurrently | ^9.1.0 | Arranque en paralelo |
| tsx | ^4.20.0 | Ejecución TypeScript en dev |

---

## Arquitectura y estructura del proyecto

El monorepo usa npm workspaces. La capa `packages/` expone librerías internas; `apps/` contiene las aplicaciones finales; `python/` contiene los SDKs Python independientes.

```
lookspan/
├── apps/
│   └── dashboard/          # SPA React + Vite (UI del dashboard)
│       └── src/
│           ├── views/
│           │   ├── TraceList.tsx     # Tabla de trazas recientes
│           │   ├── TraceDetail.tsx   # Grafo de spans de una traza
│           │   └── CostsView.tsx     # Gráficos de costes
│           ├── api/client.ts         # Cliente HTTP tipado
│           └── hooks/useStream.ts    # Hook SSE para actualizaciones en tiempo real
│
├── packages/
│   ├── api/                # Servidor Express (HTTP + SSE)
│   │   └── src/routes/
│   │       ├── ingest.ts   # POST /api/ingest
│   │       ├── traces.ts   # GET /api/traces, GET /api/traces/:id
│   │       ├── costs.ts    # GET /api/costs/summary
│   │       ├── stream.ts   # GET /api/stream (SSE)
│   │       └── health.ts   # GET /api/health
│   │
│   ├── collector/          # Pipeline de ingesta: validación, normalización, persistencia
│   │   └── src/
│   │       ├── collector.ts          # Orquestador principal
│   │       ├── normalize.ts          # Validación de payloads
│   │       ├── aggregator.ts         # Recomputa metadatos de traza
│   │       └── adapters/
│   │           └── agent-os.ts       # Adaptador SSE para AGENT-OS
│   │
│   ├── storage/            # Capa SQLite: esquema, migraciones, repositorios
│   │   └── src/
│   │       ├── database.ts
│   │       ├── migrations.ts         # Migraciones versionadas
│   │       ├── schema.ts             # Tipos de filas SQLite
│   │       └── repositories/
│   │           ├── spans.ts
│   │           ├── traces.ts
│   │           └── costs.ts
│   │
│   ├── sdk-mcp/            # SDK TypeScript para instrumentar clientes MCP
│   │   └── src/
│   │       ├── instrument.ts         # wrapMcpClient()
│   │       └── exporter.ts           # HttpSpanExporter (batching + retry)
│   │
│   ├── events/             # Bus de eventos in-process (emit / subscribe)
│   ├── types/              # Tipos TypeScript compartidos (Span, Trace, IngestPayload…)
│   └── cli/                # Binario `lookspan` para arrancar todo con npx
│
└── python/
    ├── lookspan-core/      # SDK Python genérico (LookspanClient)
    ├── lookspan-langgraph/ # Adaptador LangChain / LangGraph
    └── lookspan-crewai/    # Adaptador CrewAI
```

### Flujo de datos

```
Agente (MCP / LangGraph / CrewAI / HTTP directo)
        │
        │  POST /api/ingest  { spans: [...] }
        ▼
  @lookspan/api  (Express)
        │
        ▼
  @lookspan/collector  (valida → normaliza → inserta en SQLite)
        │
        ├──▶  @lookspan/storage  (better-sqlite3, ~/.lookspan/lookspan.db)
        │
        └──▶  @lookspan/events  (bus in-process)
                    │
                    ▼
             GET /api/stream  (SSE)
                    │
                    ▼
             Dashboard React  (React Query + useStream)
```

---

## Requisitos

- **Node.js** >= 20.0.0
- **npm** >= 10 (incluido con Node 20)
- Para los SDKs Python: **Python** >= 3.10

---

## Instalación

### Inicio rápido sin instalación

```bash
npx lookspan
# → http://127.0.0.1:3100
```

### Instalación local (desarrollo / contribución)

```bash
git clone https://github.com/JoniMartin27/lookspan.git
cd lookspan
npm install
```

Para servir el dashboard junto a la API desde un solo proceso, compílalo primero:

```bash
npm run build
node packages/cli/dist/index.js   # API + dashboard en http://127.0.0.1:3100
```

En desarrollo, `npm run dev` levanta la API en `:3100` y el dashboard con hot-reload
en `:5173` (Vite hace proxy de `/api` a la API). El CLI sirve el dashboard solo si
existe `apps/dashboard/dist`; si no, arranca solo la API y avisa por consola.

---

## Comandos

Todos los comandos se ejecutan desde la raíz del monorepo.

| Comando | Descripción |
|---|---|
| `npm run dev` | Arranca API y dashboard en paralelo (modo desarrollo) |
| `npm run dev:api` | Solo el servidor API (`tsx watch`, hot-reload) |
| `npm run dev:dashboard` | Solo el dashboard (`vite dev`) |
| `npm run build` | Compila todos los paquetes |
| `npm run typecheck` | Verificación de tipos TypeScript (proyecto completo) |
| `npm run lint` | Linting con Biome |
| `npm run format` | Formatea el código con Biome |
| `npm run fix` | Aplica correcciones automáticas de Biome |
| `npm run migrate` | Aplica migraciones SQLite pendientes |
| `npm run ci` | Pipeline completo: typecheck + lint + test + build |
| `npm run clean` | Elimina artefactos compilados |

### CLI (opciones completas)

```
npx lookspan [opciones]

Opciones:
  -p, --port <puerto>    Puerto de escucha         (por defecto: 3100)
      --host <host>      Host de escucha            (por defecto: 127.0.0.1)
      --db <ruta>        Ruta de la base de datos   (por defecto: ~/.lookspan/lookspan.db)
      --open             Abre el dashboard en el navegador al arrancar
  -h, --help             Muestra esta ayuda
  -v, --version          Muestra la versión

Variables de entorno equivalentes:
  LOOKSPAN_PORT
  LOOKSPAN_HOST
  LOOKSPAN_DB
```

---

## Integración con agentes

### TypeScript / MCP

Instrumenta cualquier cliente MCP con `wrapMcpClient`. Cada llamada a `callTool` genera automáticamente un span de tipo `tool_call`.

```typescript
import { wrapMcpClient, HttpSpanExporter } from '@lookspan/mcp';

const exporter = new HttpSpanExporter({
  endpoint: 'http://127.0.0.1:3100/api/ingest',
});

const { client, traceId } = wrapMcpClient(mcpClient, {
  exporter,
  agentId: 'mi-agente',
  sessionId: 'sesion-001',
});

// Úsalo exactamente igual que antes
await client.callTool({ name: 'read_file', arguments: { path: '/tmp/foo.txt' } });

// Al terminar la sesión
await exporter.flush();
```

### Python — cliente genérico

```python
from lookspan import LookspanClient, Span, SpanType, SpanStatus

client = LookspanClient(endpoint="http://127.0.0.1:3100/api/ingest")

trace_id = client.new_trace_id()
client.send([
    Span(
        trace_id=trace_id,
        span_id=client.new_span_id(),
        parent_span_id=None,
        type=SpanType.LLM_CALL,
        name="mi-agente.completion",
        started_at="2026-05-29T10:00:00Z",
        ended_at="2026-05-29T10:00:01Z",
        status=SpanStatus.OK,
        framework="custom",
        model="claude-sonnet-4-6",
        provider="anthropic",
    )
])
client.flush()
```

### Python — LangGraph / LangChain

```python
from lookspan import LookspanClient
from lookspan_langgraph import LookspanCallbackHandler

client = LookspanClient(endpoint="http://127.0.0.1:3100/api/ingest")
handler = LookspanCallbackHandler(client=client, agent_id="mi-agente")

# LangChain
result = chain.invoke({"input": "hola"}, config={"callbacks": [handler]})

# LangGraph
result = graph.invoke({"messages": []}, config={"callbacks": [handler]})

client.flush()
```

### Python — CrewAI

```python
from crewai import Crew
from lookspan import LookspanClient
from lookspan_crewai import attach_lookspan

client = LookspanClient(endpoint="http://127.0.0.1:3100/api/ingest")
attach_lookspan(client, agent_id="research-crew")

crew = Crew(agents=[...], tasks=[...])
result = crew.kickoff()
client.flush()
```

### HTTP directo (cualquier lenguaje)

```bash
curl -X POST http://127.0.0.1:3100/api/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "source": "mi-agente",
    "sentAt": "2026-05-29T10:00:00Z",
    "spans": [
      {
        "traceId": "tr_abc123",
        "spanId": "sp_def456",
        "parentSpanId": null,
        "type": "llm_call",
        "name": "mi-agente.completion",
        "startedAt": "2026-05-29T10:00:00Z",
        "endedAt": "2026-05-29T10:00:01Z",
        "status": "ok",
        "framework": "custom",
        "model": "gpt-4o",
        "provider": "openai"
      }
    ]
  }'
```

### Integración con AGENT-OS

El adaptador `AgentOsAdapter` (en `@lookspan/collector`) se suscribe al bus SSE de eventos de control de AGENT-OS en `GET /api/events` y convierte los eventos recibidos en spans de Lookspan. Es una integración opt-in: basta con instanciar el adaptador apuntando a la URL de AGENT-OS.

---

## API HTTP

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/health` | Estado del servicio |
| `POST` | `/api/ingest` | Ingesta de spans (body: `IngestPayload`) |
| `GET` | `/api/traces` | Lista de trazas (paginada, filtrable por `framework`, `status`, `sessionId`) |
| `GET` | `/api/traces/:id` | Detalle de una traza con todos sus spans |
| `GET` | `/api/costs/summary` | Resumen de costes (total, por modelo, por proveedor, por agente) |
| `GET` | `/api/stream` | Stream SSE de eventos en tiempo real |
| `POST` | `/v1/traces` | Receptor OTLP/HTTP de OpenTelemetry (JSON `ExportTraceServiceRequest`) |

### OpenTelemetry (OTLP)

Cualquier app instrumentada con OpenTelemetry puede exportar a Lookspan sin SDK
propio apuntando el exporter OTLP/HTTP al endpoint estándar:

```bash
export OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://127.0.0.1:3100/v1/traces
export OTEL_EXPORTER_OTLP_PROTOCOL=http/json  # el receptor acepta JSON
```

Los atributos semánticos `gen_ai.*` (system, request.model, usage.*) se mapean
a `provider`/`model`/tokens, y el coste se calcula con la tabla de precios.

---

## Licencia

MIT — Copyright (c) 2026 Jonathan Martin. Consulta el archivo [LICENSE](LICENSE) para más detalles.
