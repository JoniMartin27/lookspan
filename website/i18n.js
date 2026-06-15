/* ============================================================
   Lookspan landing — translations (es / en)
   Values may contain inline HTML (<strong>, <code>, <span>…);
   they are injected with innerHTML, so keep them author-trusted.
   Backtick literals let us use ' and " freely inside.
   ============================================================ */
window.LOOKSPAN_I18N = {
  es: {
    /* meta */
    'meta.title': `Lookspan — Observabilidad local-first para agentes de IA`,
    'meta.description': `Lookspan captura cada span —llamadas LLM, herramientas MCP y costes— de tus agentes LangGraph, CrewAI y MCP. Todo corre en tu máquina: sin nube, sin API keys, sin que tus datos salgan de tu equipo.`,

    /* nav / header */
    'nav.features': `Características`,
    'nav.how': `Cómo funciona`,
    'nav.integrations': `Integraciones`,
    'nav.costs': `Costes`,
    'nav.githubMobile': `GitHub ↗`,
    'cta.start': `Empezar`,

    /* hero */
    'hero.eyebrow': `Observabilidad local-first · Nativo para MCP`,
    'hero.title': `Mira cada <span class="gradient-text">span</span> que emiten tus agentes de IA.`,
    'hero.lead': `Lookspan captura cada llamada LLM, cada herramienta MCP y cada token de coste de tus agentes <strong>LangGraph</strong>, <strong>CrewAI</strong> y <strong>MCP</strong>. Todo corre en tu máquina: sin nube, sin API keys, sin que tus datos salgan de tu equipo.`,
    'hero.cmdHint': `Arranca el servidor y el dashboard en <code>http://127.0.0.1:3100</code> — sin instalación global.`,
    'hero.ctaInstrument': `Instrumentar mi agente`,
    'hero.ctaGithub': `Ver en GitHub`,
    'hero.trust1': `Datos 100% en local`,
    'hero.trust2': `Coste de infra cero`,
    'hero.trust3': `Open source · MIT`,

    /* mockup */
    'mock.duration': `duración`,
    'mock.cost': `coste`,
    'float.sessionCost': `coste de la sesión`,
    'float.newTraces': `3 trazas nuevas`,

    /* frameworks strip */
    'strip.label': `Funciona con tu stack de agentes`,

    /* problem */
    'problem.kicker': `El problema`,
    'problem.title': `Cuando un agente falla, te quedas a ciegas.`,
    'problem.sub': `Cuando un agente tarda demasiado, gasta más tokens de lo esperado o simplemente se rompe, no hay forma nativa de ver qué ocurrió paso a paso. Las herramientas de observabilidad clásicas te piden una cuenta en la nube, claves de API y enviar datos de producción a servidores ajenos.`,
    'compare.bad.title': `Observabilidad en la nube`,
    'compare.bad.1': `Cuenta, facturación y claves de API`,
    'compare.bad.2': `Tus prompts y datos salen a servidores externos`,
    'compare.bad.3': `Coste por evento o por GB ingerido`,
    'compare.bad.4': `Latencia de red y límites de retención`,
    'compare.good.title': `Observabilidad local-first`,
    'compare.good.1': `<strong>Todo corre en tu máquina</strong>, los datos nunca salen de ella`,
    'compare.good.2': `SQLite en <code>~/.lookspan/lookspan.db</code> — tú eres el dueño`,
    'compare.good.3': `Coste de infraestructura <strong>cero</strong>`,
    'compare.good.4': `Un comando: <code>npx lookspan</code> y a observar`,

    /* features */
    'features.kicker': `Características`,
    'features.title': `Todo lo que necesitas para depurar agentes, en local.`,
    'features.sub': `Ingesta, trazas, grafo de spans, costes y alertas. Sin montar infraestructura y sin renunciar a la privacidad de tus datos.`,
    'feat.mcp.title': `Nativo para MCP`,
    'feat.mcp.body': `El SDK <code>@lookspan/mcp</code> envuelve cualquier <code>McpClient</code> y emite un span por cada llamada a herramienta, sin tocar el código de tu agente.`,
    'feat.realtime.title': `Streaming en tiempo real`,
    'feat.realtime.body': `El endpoint SSE <code>/api/stream</code> empuja cada <code>span.ingested</code> al dashboard al instante. Ves las trazas mientras tu agente las ejecuta, sin polling.`,
    'feat.graph.title': `Grafo de spans interactivo`,
    'feat.graph.body': `Vista de detalle de cada traza con un grafo navegable (React Flow): jerarquía, duraciones, estados y atributos de cada paso del agente.`,
    'feat.cost.title': `Seguimiento de costes`,
    'feat.cost.body': `Agrega tokens de entrada, salida, caché y razonamiento; calcula el <code>cost_usd</code> por span y por traza, con desglose por modelo y por proveedor.`,
    'feat.sqlite.title': `SQLite local`,
    'feat.sqlite.body': `Esquema con migraciones versionadas y base de datos en <code>~/.lookspan/lookspan.db</code>. Configurable por flag o variable de entorno. Tus datos, tu disco.`,
    'feat.cli.title': `CLI en una línea`,
    'feat.cli.body': `<code>npx lookspan</code> arranca servidor y dashboard sin instalación global. Puertos, host y ruta de la BD configurables por flag o entorno.`,
    'feat.alerts.title': `Alertas configurables`,
    'feat.alerts.body': `Avísate cuando una traza falla, supera un coste, gasta demasiados tokens o tarda de más. Toast en el dashboard, notificación de escritorio y consola.`,
    'feat.privacy.title': `Privado por defecto`,
    'feat.privacy.body': `Escucha en <code>127.0.0.1</code> y redacta credenciales (<code>api_key</code>, <code>token</code>, <code>password</code>…) antes de persistir. Token opcional si lo expones.`,
    'feat.otel.title': `OpenTelemetry (OTLP)`,
    'feat.otel.body': `Receptor OTLP/HTTP en <code>/v1/traces</code>. Apunta cualquier app instrumentada con OTel a Lookspan: los atributos <code>gen_ai.*</code> se mapean a modelo, proveedor y tokens.`,

    /* how it works */
    'how.kicker': `Cómo funciona`,
    'how.title': `De tu agente al dashboard en tres pasos.`,
    'how.sub': `Instrumenta una vez con un adaptador, arranca el CLI y observa. Los spans viajan por HTTP, se validan y normalizan, y aparecen en tiempo real.`,
    'flow.agent': `Agente`,
    'flow.agent.sub': `MCP · LangGraph · CrewAI · HTTP`,
    'flow.collector.sub': `valida · normaliza · redacta`,
    'flow.dashboard.sub': `trazas · grafo · costes`,
    'step1.title': `Instrumenta`,
    'step1.body': `Envuelve tu cliente MCP o añade el callback de LangGraph/CrewAI. Una línea, sin reescribir tu agente.`,
    'step2.title': `Arranca`,
    'step2.body': `Ejecuta <code>npx lookspan</code>. El servidor escucha en <code>:3100</code> y sirve el dashboard.`,
    'step3.title': `Observa`,
    'step3.body': `Cada span aparece en vivo: jerarquía, duraciones, estados, tokens y coste en USD.`,

    /* integrations */
    'int.kicker': `Integraciones`,
    'int.title': `Instrumentar tu agente es una línea de código.`,
    'int.sub': `Elige tu framework. Compatible con cualquier agente capaz de hacer una petición HTTP.`,
    'code.mcp.c1': `// Instrumenta cualquier cliente MCP — cada callTool emite un span`,
    'code.mcp.c2': `// Úsalo exactamente igual que antes`,
    'code.lg.c1': `# Pasa el handler como callback — LangGraph hace el resto`,
    'code.crew.c1': `# Una llamada y toda la crew queda instrumentada`,
    'code.http.c1': `# Cualquier lenguaje que pueda hacer un POST`,
    'code.otel.c1': `# Reutiliza tu instrumentación OpenTelemetry existente`,
    'code.otel.c2': `# Los atributos gen_ai.* se mapean a modelo, proveedor y tokens,`,
    'code.otel.c3': `# y el coste se calcula con la tabla de precios.`,

    /* costs */
    'costs.kicker': `Costes`,
    'costs.title': `Sabe exactamente cuánto cuesta cada agente.`,
    'costs.sub': `Lookspan agrega tokens de entrada, salida, caché y razonamiento, y calcula el coste en USD por span y por traza. Desglosa el gasto por modelo y por proveedor para que ninguna factura te pille por sorpresa.`,
    'costs.check1': `<code>cost_usd</code> por span y por traza`,
    'costs.check2': `Desglose por modelo y por proveedor`,
    'costs.check3': `Latencia p50 / p95 / p99 y tasa de error`,
    'costs.check4': `Alerta automática al superar tu umbral`,
    'cost.byModel': `Coste por modelo`,
    'cost.stat.traces': `trazas`,
    'cost.stat.errors': `errores`,

    /* cta */
    'cta.title': `Empieza a ver tus agentes en 30 segundos.`,
    'cta.sub': `Sin cuenta, sin claves, sin que tus datos salgan de tu máquina.`,
    'cta.github': `Ver en GitHub`,
    'cta.docs': `Leer la documentación`,

    /* footer */
    'footer.tagline': `Dashboard de observabilidad local-first para agentes de IA. Nativo para MCP.`,
    'footer.product': `Producto`,
    'footer.resources': `Recursos`,
    'footer.project': `Proyecto`,
    'footer.docs': `Documentación`,
    'footer.repo': `Repositorio`,
    'footer.issues': `Issues`,
    'footer.license': `Licencia MIT`,
    'footer.changelog': `Changelog`,
    'footer.copy': `© 2026 Jonathan Martin · Licencia MIT`,
    'footer.fervon': `Parte de Fervon · forjado al rojo vivo`,
    'footer.made': `Hecho con SQLite y cariño · 100% local`,

    /* dynamic (JS) */
    'copy.label': `Copiar`,
    'copy.done': `¡Copiado!`,
    'menu.open': `Abrir menú`,
    'menu.close': `Cerrar menú`,
    'aria.copyCmd': `Copiar comando`,
    'aria.copyCode': `Copiar código`,
    'aria.langGroup': `Idioma`,
    'a11y.skip': `Saltar al contenido`,
  },

  en: {
    /* meta */
    'meta.title': `Lookspan — Local-first observability for AI agents`,
    'meta.description': `Lookspan captures every span —LLM calls, MCP tools, and costs— from your LangGraph, CrewAI, and MCP agents. Everything runs on your machine: no cloud, no API keys, no data leaving your box.`,

    /* nav / header */
    'nav.features': `Features`,
    'nav.how': `How it works`,
    'nav.integrations': `Integrations`,
    'nav.costs': `Costs`,
    'nav.githubMobile': `GitHub ↗`,
    'cta.start': `Get started`,

    /* hero */
    'hero.eyebrow': `Local-first observability · MCP-native`,
    'hero.title': `See every <span class="gradient-text">span</span> your AI agents emit.`,
    'hero.lead': `Lookspan captures every LLM call, every MCP tool, and every cost token from your <strong>LangGraph</strong>, <strong>CrewAI</strong>, and <strong>MCP</strong> agents. Everything runs on your machine: no cloud, no API keys, no data leaving your box.`,
    'hero.cmdHint': `Spins up the server and dashboard at <code>http://127.0.0.1:3100</code> — no global install.`,
    'hero.ctaInstrument': `Instrument my agent`,
    'hero.ctaGithub': `View on GitHub`,
    'hero.trust1': `100% local data`,
    'hero.trust2': `Zero infra cost`,
    'hero.trust3': `Open source · MIT`,

    /* mockup */
    'mock.duration': `duration`,
    'mock.cost': `cost`,
    'float.sessionCost': `session cost`,
    'float.newTraces': `3 new traces`,

    /* frameworks strip */
    'strip.label': `Works with your agent stack`,

    /* problem */
    'problem.kicker': `The problem`,
    'problem.title': `When an agent fails, you're flying blind.`,
    'problem.sub': `When an agent takes too long, burns more tokens than expected, or simply breaks, there's no native way to see what happened step by step. Classic observability tools ask for a cloud account, API keys, and shipping production data to someone else's servers.`,
    'compare.bad.title': `Cloud observability`,
    'compare.bad.1': `Account, billing, and API keys`,
    'compare.bad.2': `Your prompts and data leave for external servers`,
    'compare.bad.3': `Cost per event or per GB ingested`,
    'compare.bad.4': `Network latency and retention limits`,
    'compare.good.title': `Local-first observability`,
    'compare.good.1': `<strong>Everything runs on your machine</strong>, data never leaves it`,
    'compare.good.2': `SQLite at <code>~/.lookspan/lookspan.db</code> — you own it`,
    'compare.good.3': `<strong>Zero</strong> infrastructure cost`,
    'compare.good.4': `One command: <code>npx lookspan</code> and you're observing`,

    /* features */
    'features.kicker': `Features`,
    'features.title': `Everything you need to debug agents, locally.`,
    'features.sub': `Ingestion, traces, span graph, costs, and alerts. No infrastructure to set up, no privacy to give up.`,
    'feat.mcp.title': `MCP-native`,
    'feat.mcp.body': `The <code>@lookspan/mcp</code> SDK wraps any <code>McpClient</code> and emits a span for every tool call, without touching your agent's code.`,
    'feat.realtime.title': `Real-time streaming`,
    'feat.realtime.body': `The SSE endpoint <code>/api/stream</code> pushes every <code>span.ingested</code> to the dashboard instantly. Watch traces as your agent runs them — no polling.`,
    'feat.graph.title': `Interactive span graph`,
    'feat.graph.body': `A detail view per trace with a navigable graph (React Flow): hierarchy, durations, statuses, and attributes for every agent step.`,
    'feat.cost.title': `Cost tracking`,
    'feat.cost.body': `Aggregates input, output, cache, and reasoning tokens; computes <code>cost_usd</code> per span and per trace, broken down by model and provider.`,
    'feat.sqlite.title': `Local SQLite`,
    'feat.sqlite.body': `Versioned migrations and a database at <code>~/.lookspan/lookspan.db</code>. Configurable via flag or environment variable. Your data, your disk.`,
    'feat.cli.title': `One-line CLI`,
    'feat.cli.body': `<code>npx lookspan</code> starts the server and dashboard with no global install. Port, host, and DB path configurable via flag or environment.`,
    'feat.alerts.title': `Configurable alerts`,
    'feat.alerts.body': `Get notified when a trace fails, exceeds a cost, burns too many tokens, or runs too long. Dashboard toast, desktop notification, and console.`,
    'feat.privacy.title': `Private by default`,
    'feat.privacy.body': `Listens on <code>127.0.0.1</code> and redacts credentials (<code>api_key</code>, <code>token</code>, <code>password</code>…) before persisting. Optional token if you expose it.`,
    'feat.otel.title': `OpenTelemetry (OTLP)`,
    'feat.otel.body': `OTLP/HTTP receiver at <code>/v1/traces</code>. Point any OTel-instrumented app at Lookspan: <code>gen_ai.*</code> attributes map to model, provider, and tokens.`,

    /* how it works */
    'how.kicker': `How it works`,
    'how.title': `From your agent to the dashboard in three steps.`,
    'how.sub': `Instrument once with an adapter, start the CLI, and observe. Spans travel over HTTP, get validated and normalized, and show up in real time.`,
    'flow.agent': `Agent`,
    'flow.agent.sub': `MCP · LangGraph · CrewAI · HTTP`,
    'flow.collector.sub': `validate · normalize · redact`,
    'flow.dashboard.sub': `traces · graph · costs`,
    'step1.title': `Instrument`,
    'step1.body': `Wrap your MCP client or add the LangGraph/CrewAI callback. One line, no rewriting your agent.`,
    'step2.title': `Run`,
    'step2.body': `Run <code>npx lookspan</code>. The server listens on <code>:3100</code> and serves the dashboard.`,
    'step3.title': `Observe`,
    'step3.body': `Every span shows up live: hierarchy, durations, statuses, tokens, and cost in USD.`,

    /* integrations */
    'int.kicker': `Integrations`,
    'int.title': `Instrumenting your agent is one line of code.`,
    'int.sub': `Pick your framework. Works with any agent that can make an HTTP request.`,
    'code.mcp.c1': `// Instrument any MCP client — each callTool emits a span`,
    'code.mcp.c2': `// Use it exactly as before`,
    'code.lg.c1': `# Pass the handler as a callback — LangGraph does the rest`,
    'code.crew.c1': `# One call and the whole crew is instrumented`,
    'code.http.c1': `# Any language that can make a POST`,
    'code.otel.c1': `# Reuse your existing OpenTelemetry instrumentation`,
    'code.otel.c2': `# gen_ai.* attributes map to model, provider, and tokens,`,
    'code.otel.c3': `# and cost is computed from the pricing table.`,

    /* costs */
    'costs.kicker': `Costs`,
    'costs.title': `Know exactly what each agent costs.`,
    'costs.sub': `Lookspan aggregates input, output, cache, and reasoning tokens, and computes the cost in USD per span and per trace. It breaks spending down by model and provider so no bill catches you off guard.`,
    'costs.check1': `<code>cost_usd</code> per span and per trace`,
    'costs.check2': `Breakdown by model and provider`,
    'costs.check3': `p50 / p95 / p99 latency and error rate`,
    'costs.check4': `Automatic alert when you cross your threshold`,
    'cost.byModel': `Cost by model`,
    'cost.stat.traces': `traces`,
    'cost.stat.errors': `errors`,

    /* cta */
    'cta.title': `Start seeing your agents in 30 seconds.`,
    'cta.sub': `No account, no keys, no data leaving your machine.`,
    'cta.github': `View on GitHub`,
    'cta.docs': `Read the docs`,

    /* footer */
    'footer.tagline': `Local-first observability dashboard for AI agents. MCP-native.`,
    'footer.product': `Product`,
    'footer.resources': `Resources`,
    'footer.project': `Project`,
    'footer.docs': `Documentation`,
    'footer.repo': `Repository`,
    'footer.issues': `Issues`,
    'footer.license': `MIT license`,
    'footer.changelog': `Changelog`,
    'footer.copy': `© 2026 Jonathan Martin · MIT License`,
    'footer.fervon': `Part of Fervon · forged red-hot`,
    'footer.made': `Built with SQLite and care · 100% local`,

    /* dynamic (JS) */
    'copy.label': `Copy`,
    'copy.done': `Copied!`,
    'menu.open': `Open menu`,
    'menu.close': `Close menu`,
    'aria.copyCmd': `Copy command`,
    'aria.copyCode': `Copy code`,
    'aria.langGroup': `Language`,
    'a11y.skip': `Skip to content`,
  },
};
