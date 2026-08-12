# Changelog

## Unreleased

The first screen a new user sees had never been audited, and "live" was not.

### Fixed
- **A failing agent buried the dashboard in its own alerts.** Every alert
  raised a toast on an unbounded stack, and an agent failing in a loop raises
  one per failure. Measured with thirty: the stack grew to 2,212px inside a
  900px window, eighteen toasts sat off the top of the screen, and the rest
  covered the right-hand column — `elementFromPoint` on the Export button and
  on the status filter both came back as a toast. The two controls you reach
  for when things are failing were the ones you could no longer click. Four
  toasts now, newest first, with a `+26 more in Alerts` line above them; every
  alert is still listed and persisted under `/alerts`.
- **The cost breakdowns did not add up to the total beside them.** Each one
  dropped rows where its dimension was NULL, and a CrewAI span carries no
  `provider` at all — its adapter never sets one. Measured against a running
  server: `total` said $0.021 while "By provider" summed to $0.0135, so 36% of
  the bill was missing from the chart with nothing on screen to say so. The
  same held for model and agent. Unattributable spend now gets an
  `(unattributed)` bucket — the label the session view already used — instead
  of the floor, and the bucket only appears when there is money in it.
- **A night's spend was charted on the previous day.** Traces carry UTC
  timestamps and the per-day rollups bucketed them by slicing the first ten
  characters off that string — the UTC date. On a machine at UTC+2, every trace
  between midnight and 02:00 local was counted under yesterday, in a chart
  called "Cost per day". Measured: a trace at 01:30 on the 13th appeared on the
  12th. Lookspan runs on your own machine, so the buckets are now your days.
  The conversion is registered as a SQL function in both drivers rather than
  written as dialect SQL, so the repositories keep one query — and doing it in
  JavaScript gets DST and half-hour offsets right for free. The HTML audit
  report was slicing the same string and is fixed with it.

### Security
- **A rebound domain walked straight past the CORS fix.** Closing CORS stops a
  page on another origin from reading the API; it does nothing about DNS
  rebinding, where the attacker's domain is made to resolve to 127.0.0.1 after
  the page has loaded. From that moment the browser calls the request
  same-origin and no CORS check runs at all — what arrives is an ordinary
  request whose `Host` header says `evil.example`, and it was answered like any
  other, read and write. A loopback-bound server now only answers requests
  addressed to loopback (`localhost`, `127.0.0.0/8`, `::1`, `*.localhost`), and
  returns 421 otherwise. Not enforced when the server has been exposed on
  purpose with `--host`: it is reachable directly there anyway, and the check
  would only break reaching it by name.
- **Any website you visited could read your local database.** CORS reflected
  whatever origin asked, so a page on an unrelated site could `fetch` the API
  from your browser — which reaches loopback even when the network does not —
  and a default install has no token. Reproduced in a real browser: a page
  served from another origin read the traces back, and `POST /api/ingest`
  accepted spans it wrote. Nothing legitimate depended on the reflection: the
  dashboard is served from the same origin, the Vite dev server proxies
  `/api`, and agents post from Node or Python, which do not enforce CORS at
  all. The default is now no cross-origin access, with a new `--cors-origin`
  (`LOOKSPAN_CORS_ORIGIN`) to grant specific origins — there was previously no
  way to configure it from the CLI at all.
- **One capital letter bypassed `--token` entirely.** Express routes
  case-insensitively, so `/API/traces` reached the traces router — but the auth
  guard asked `req.path.startsWith('/api')`, which does not. The guard and the
  router disagreed about what a path was, and the request fell through the gap:
  `GET /API/traces` returned the whole database without a token, and `POST
  /API/ingest` accepted writes. The same held for `/API/stats`,
  `/API/export/traces`, `/V1/traces` and any other capitalisation. The token is
  the only protection when the server is exposed with `--host 0.0.0.0`, which
  is the documented reason to set it. The guard now matches on the same terms
  as the router. Token comparison is also hashed and timing-safe.
- **Redaction failed open past its depth limit, and an ordinary OpenAI tool
  call reached it.** The scan stopped at six levels and returned whatever was
  below *untouched* — key names unchecked and secret-looking values unscrubbed,
  because the walk never got there. `input.messages[0].tool_calls[0].function.arguments`
  is exactly six levels down, so a credential passed as a tool argument was
  stored in the clear, against a README that promised telemetry "never drags
  secrets into the database". Verified against a running server: three of eight
  realistic secret shapes were persisted verbatim, now none are. The scan goes
  twelve levels deep and replaces anything beyond it rather than waving it
  through. A unit test had pinned the old behaviour as correct, which is how it
  survived.

### Fixed
- **The judge graded a truncated answer without being told.** Long content is
  cut before it reaches the LLM judge — 12,000 characters of the request and
  the response, 6,000 of the reference. The cut was unmarked, so a 15,200-
  character answer arrived ending mid-word and the judge, instructed to grade
  the response in front of it, had every reason to mark it down for stopping
  abruptly. The resulting low score describes our truncation rather than the
  agent, and nothing distinguishes it from a genuinely bad answer — a score
  nobody earned is worse than a score that is missing. Each cut now carries a
  marker saying it is ours and how much was withheld. It matters most on the
  request, where cutting serialised JSON leaves a fragment the judge cannot
  tell apart from a malformed one.
- **A dataset run skipped items without saying so.** A run covers the first 100
  items; the panel said "Runs up to 100 items synchronously" — the same
  sentence whether the dataset held five items or five hundred — and the button
  offered to run *all* of them. A 150-item dataset came back `100/100 ok`,
  which reads as a clean sweep, with fifty items never evaluated and no sign
  they existed. In the one feature whose job is telling you whether your agent
  still works, that is the worst possible place to round down quietly. The
  button now reads `Run 100 of 150`, a warning names how many will be left out,
  and a finished run is tagged with how many of the dataset's items it missed.
  The cap moved to `@lookspan/types` so the server and the dashboard cannot
  disagree about it — the same move `DEFAULT_EXPORT_LIMIT` made, for the same
  reason.
- **The live stream was connected and ignored.** The header promised the
  dashboard "updates in real time", and the server did its part — one
  `span.ingested` per stored span, one `trace.updated` per affected trace — but
  the client only ever read those events to raise alert toasts. Everything else
  waited on its own `refetchInterval`, so a trace took **7.4 seconds** to
  appear on an open page, and would have taken just as long with the stream
  switched off. Data events now refresh the views, collapsed into at most one
  refresh per 700 ms window so a busy agent cannot turn the dashboard into a
  denial of service against its own API. Measured in a browser: **7,449 ms →
  384 ms**, and a 2,000-span burst at 1,028 spans/s costs the page 8 requests.
- **The empty dashboard failed WCAG AA.** Every accessibility pass so far ran
  against a seeded database, so the states a new install actually shows were
  never measured. With an empty one, `/` offered "Head to Connect to wire up
  your agent" with *Connect* distinguished from the surrounding sentence by
  colour alone (1.04:1 — hue only), and `/costs` rendered its `--pricing` hint
  in a chip that declared no colour of its own and inherited `neutral-600` onto
  the lighter chip background, landing at 4.05:1. Four of the five inline chips
  in the dashboard were inheriting like that, one edit to a parent paragraph
  away from the same defect; each now states its own colour.
- **The cost charts kept the pre-Fervon grey.** Raising the neutral ramp to
  clear AA moved `index.css` but not the colours hardcoded into recharts, so
  all 39 axis tick labels stayed at 4.31:1. axe does not measure contrast
  inside an `<svg>`, which is why eight clean view audits never caught it.
  Chart chrome now lives in `lib/chartTheme.ts`, and a test asserts each value
  still equals the token it mirrors.

## 0.5.2 — 2026-08-12

The trace view answered what the model did and never what it was asked.

### Added
- **The prompt that set the trace off, in the header.** A trace now shows the
  request that triggered it — the last user turn of the earliest span that
  recorded one, with the root span taking precedence — as a row under the
  title. Clicking it opens the span that carried it. When a trace makes an LLM
  call and no prompt was recorded, it says so instead of leaving a blank.

### Fixed
- **The stored request was silently dropped.** The chat transcript only
  understood the OpenAI shape (`input.messages` as a real array) and, because a
  reply on its own was enough to render a conversation, everything else was
  discarded — you saw the answer with no sign of the question. Three shapes
  measured against a real deployment were being lost: a message list that
  arrived JSON-stringified (producers that can only store scalars, such as the
  Python tracer), a single prompt field (`{"mensaje": "…"}` from an agent step),
  and an input with no readable text at all (`{"prompt_id": "chat"}`), which is
  now shown raw rather than thrown away. Identifiers (`prompt_id`, `runId`) are
  never mistaken for a prompt.
- **Starting on a busy port claimed success and exited silently.** On Windows
  the listen callback runs before the error event, so a second instance printed
  Lookspan running at … and then exited with code 0. Double-clicking the
  desktop icon a second time did exactly that: a console window flashed saying
  it had started, and vanished. It now reports the port is taken, points at
  where Lookspan already is, and exits non-zero.

## 0.5.1 — 2026-08-12

Three bugs that showed up in real use, one of them noisy enough to make the
console unreadable.

### Fixed
- **Deep links 404'd on reload.** Opening a trace by its URL, refreshing, or
  following a bookmark returned `{"error":"not_found"}` — only `/` worked, and
  only because `express.static` served it rather than the SPA fallback. The
  fallback asked for an absolute path without a `root`, so `send` applied its
  default `dotfiles: 'ignore'` to *every* segment: any directory with a dot in
  it turned `index.html` into a 404. That is the normal case, not the exotic
  one — `npm i -g` lands under `~/.local`, `~/.nvm` or `~/.volta` on much of
  Linux. Measured on a Raspberry Pi with lookspan in
  `~/.local/lib/node_modules`: `/` 200, `/traces/:id` and `/connect` 404.
- **The trace list named a trace after one of its children.** A span tree
  closes its root *last*, so every trace spends a while in the database with
  children and no root. The placeholder row was seeded from whichever span
  arrived first, and the upsert never revisited `root_name`, `started_at`,
  `framework`, `agent_id` or `session_id` — while the comment above it claimed
  the opposite. A 26-second turn showed up in the list under a child's name,
  starting a second late, permanently. Only visible when the spans don't fit in
  one batch, which is why short traces looked fine. It also uncovered a latent
  Postgres bug: those columns were selected bare under a `GROUP BY`, which
  SQLite tolerates and Postgres does not.
- **Spans from an unrecognised framework were rewritten, and logged on every
  read.** Ingest accepts any non-empty string for a span's `framework` — the
  whole point is to receive from whatever produces spans — but the read path
  checked it against a closed enum. A trace from a producer Lookspan did not
  know by name came back as `custom`, and every row logged a warning. A live
  instance receiving from `inferbench` filled its console with thousands of
  identical lines while quietly mislabelling every one of those traces, which
  were then impossible to filter because the dashboard's filter list was
  hardcoded. The label now round-trips untouched and the filter offers whatever
  appears in the data. `type` and `status` stay validated: those are closed
  enums the code branches on.
- **A truncated export said so only where nobody looks.** With more traces than
  the export cap, the file quietly contained the newest 1000 — the headers, the
  JSON body and the HTML report all said so, but the CSV did not and neither
  did the dashboard. The export menu now warns before the download, and a
  truncated file names itself `lookspan-traces-<stamp>-1000-of-20001.csv`,
  because the filename is the one thing that travels with it to a spreadsheet.
- **The driver-level `pragma()` took any statement.** Its argument is
  interpolated into a PRAGMA that SQLite runs verbatim. Every caller passes a
  literal, so nothing external reached it, but both drivers now accept only the
  schema-version pragma and `setSchemaVersion` refuses anything that is not a
  plain non-negative integer.

### Added
- **An out-of-range port is refused instead of crashing.** `--port 99999` used
  to reach `listen()` and fail with an obscure error; the CLI now says what is
  wrong. `LOOKSPAN_PORT` gets the same check, which it previously skipped.

### Changed
- **Startup is about a third faster.** The Postgres engine was imported at
  module scope, and the driver picker imports that file — so every SQLite user,
  which is everyone by default, loaded and executed 2 MB of pg-mem for a driver
  they never selected. Measured cold start of the published package: 293 ms
  down to 203 ms. It now loads only when a `postgres://` target is opened.
- **The CLI flag layer moved out of the entrypoint** so it can be tested.
  `index.ts` calls `main()` at module scope, so importing it started a server
  and the parsing had never been exercised; it also called `process.exit` from
  inside the parser. Parsing now lives in `flags.ts`, takes its environment as
  an argument and throws instead of exiting. 21 tests.

## 0.5.0 — 2026-08-12

The release that makes the published package match the repo: it also carries
fixes for a bundle that could not start and a Postgres driver that rejected
every write.

### Added
- **CI now tests the Python SDKs.** All three (`lookspan`, `lookspan-langgraph`,
  `lookspan-crewai`) are published to PyPI, and none of them had ever run in
  CI — only the core package even had tests. A `python SDKs` job runs ruff and
  pytest for each, and the two adapters gained suites of their own (35 tests
  covering span shape, causality, truncation, error paths and version parity).
- **The desktop launcher ships an icon** on Windows and Linux, generated from
  the dashboard's own favicon SVG by `npm run icons` so the two can't drift.
  The `.ico` stores 16/24/32/48 as uncompressed DIB (PNG-compressed entries are
  legal but the older GDI+ path can't decode them) and 128/256 as PNG. macOS
  still uses the system default — an `.icns` bundle isn't built yet.
- **One-click desktop launcher** — `lookspan install-desktop` registers Lookspan
  as a real desktop app: a shortcut on the Desktop and in the Start Menu on
  Windows, `~/Applications/Lookspan.app` on macOS, a `.desktop` entry on Linux.
  Clicking it boots the server and opens the dashboard, no terminal. Server
  options given to the command are baked into the launcher (and validated
  first); `lookspan uninstall-desktop` removes it. Refuses to run from the `npx`
  cache, which npm may delete.
- **Fervon brand identity across the whole product** — the forge palette
  (carbon surfaces, ember/amber accents) now covers the dashboard and the
  documentation site, not just the landing. Includes a contrast fix on solid
  buttons and the dashboard favicon, which was 404ing.
- **Trace export & audit** — download the trace set as CSV (UTF-8 BOM,
  formula-injection safe), JSON (metadata-only by default, `?raw=1` to include
  attributes) or a self-contained printable HTML audit report (`format=html`)
  with provenance, summary cards and SVG charts. `GET /api/export/traces`;
  honours the active framework/status/session filters and ships
  provenance/integrity headers (`X-Lookspan-Export-Sha256`, `-Count`,
  `-Truncated`).
- **Optional Postgres driver** behind a selectable DB layer — pass a
  `postgres://…` URL to `--db` / `LOOKSPAN_DB` to use Postgres instead of SQLite
  (same schema, same features).
- **Per-model reasoning-token cost** — reasoning tokens are billed at their own
  rate when the pricing table prices them, itemised per span and by model.
- **Astro Starlight documentation site** under `docs-site/` (isolated from the
  monorepo CI).
- **Organic traction tracker** (`scripts/traction.mjs`) for npm/PyPI/GitHub
  metrics.
- **Dashboard**: relative timestamps in the trace list (full timestamp on
  hover); accessible live-stream status + alert toasts.

### Fixed
- **The side drawers were unusable from the keyboard.** Opening *Replay &
  judge* or a span's detail left focus behind on the button that opened it, so
  reaching the panel meant tabbing through the whole page, Escape did nothing,
  and neither drawer announced itself as a dialog. They now take focus on open,
  close on Escape, hand focus back where it came from, and carry
  `role="dialog"` with a name.
- **Views made only of charts could not be scrolled without a mouse.** The
  Costs page has no focusable content at all, which left its scroll container
  unreachable by keyboard (`scrollable-region-focusable`).
- **The dashboard failed WCAG AA on every view.** An axe-core audit found three
  problems: the forge palette's `neutral-500` and `neutral-600` sat at 4.42:1
  and 2.54:1 against the page while carrying real text (89 flagged nodes), the
  framework and status filters had no accessible name at all, and three links
  were distinguishable from surrounding text by colour alone. All eight views
  are now clean, and a palette test reads the tokens straight out of
  `index.css` so a future theme change cannot quietly drop below AA again.
- **Four more documents still oversold the Postgres driver.** Correcting the
  "same features" claim once per file was not working — it had already been
  fixed in three places across two releases and kept resurfacing. A test now
  asserts that any document telling you to point `--db` at Postgres also says
  what that is *not*; it found two files on its first run that a manual sweep
  had missed. The roadmap's published-version list was stale too (it still said
  v0.1.0) and it never mentioned the desktop launcher.
- **The docs site's "send your first span" curl did not parse.** An extra brace
  in `guides/getting-started` and `reference/http-api` — the very first command
  a new reader runs — while the READMEs carried the correct version, so the two
  copies had silently drifted. A test now parses every ```json block and every
  `curl -d` body across the READMEs, `docs/` and the docs site, so CI catches
  the next drift. The CLI reference also gained the `install-desktop` /
  `uninstall-desktop` commands it was missing, and its Postgres note now
  matches the honest one in `docs/CONFIGURATION.md`.
- **Every shared link rendered an empty preview card.** The landing pointed
  `og:image` at an SVG with a relative path — no platform renders SVG in a link
  preview, and scrapers do not resolve relative urls — and the live docs site
  declared `twitter:card=summary_large_image` while shipping no image at all.
  Both now point at a 1200×630 PNG at an absolute url, rasterized from the
  existing SVG master by `npm run og`.
- **Every write to a Postgres-backed Lookspan failed.** Ingesting a span wraps
  `SpansRepository.insertMany` — itself transactional — inside the collector's
  transaction, and the Postgres driver emitted a `SAVEPOINT` for the inner
  block. pg-mem cannot parse `SAVEPOINT`, so the insert threw; the HTTP layer
  then reported the storage failure as `400 invalid_payload`, blaming the
  caller's data. Nested blocks now join the outermost one.
- **The Postgres driver had no transactional atomicity at all.** `BEGIN` /
  `COMMIT` / `ROLLBACK` sent through pg-mem's query interface are parsed and
  ignored — a rollback left its rows in place. Outermost blocks are now
  bracketed with `mem.backup()` and restored on failure, which is both correct
  and effectively free (0.03 ms to snapshot a 20 000-row table).
- **A failed ingest no longer returns 400.** Only a malformed payload is the
  caller's fault; a storage error now returns `500 ingest_failed`. Exporters
  treat 4xx as "do not retry", so the old behaviour silently dropped batches
  that a retry would have saved.
- **The docs oversold Postgres.** The README said "same schema, same features";
  in fact the driver runs an embedded engine, never contacts the host in the
  connection string, and loses its data on restart. The README, its Spanish
  twin and the startup line now say so.
- **The rest of the views got the same phone treatment** as the trace list: a
  consistent `p-4` on small screens, and the Overview's five stat tiles packed
  three-across instead of stacking into three rows — 509px down to 333px before
  the first chart. Desktop is unchanged everywhere.
- **The trace list wasted half a phone screen on chrome.** At 390px, 427 of the
  844 available pixels went to the header, the health strip and the filter row
  before a single trace was visible. The health tiles now sit in one row on
  small screens and the section header packs tighter: 302px, and 11 traces
  visible instead of 9. Desktop is unchanged.
- **`npm run ci` could not pass on a Windows checkout.** The repo had no
  `.gitattributes`, so Git's `core.autocrlf` rewrote the working tree to CRLF —
  which does not change what is committed, but does break the tools that read
  the files: Biome reported all 163 files as misformatted and Vitest could not
  parse `scripts/traction.mjs` at all, hiding 23 tests. Linux CI passed
  throughout, so both looked like real regressions and neither was. A
  `.gitattributes` pins the working tree to LF: locally, lint goes from 54
  errors to 0 and the suite from 280 to 303 passing tests.
- **Every view scrolled sideways on a narrow window.** At 390px the page body
  was 157px wider than the viewport on all seven views — the seven-item header
  nav could not fit, and the data tables pushed past it too. The nav and each
  table now scroll on their own axis, so the page itself never does. Measured
  before and after in a real browser at 390×844; the desktop layout is
  unchanged.
- **The LangGraph adapter reported the model name as the provider.**
  `on_llm_end` read LangChain's `model_name` and wrote it to *both* `model` and
  `provider`, so every LangGraph user's spans were grouped under a provider
  called `gpt-4o`. The provider is now inferred from the model id, and left
  unset when it can't be told rather than guessed wrong.
- **`lookspan-langgraph` and `lookspan-crewai` reported `__version__ ==
  "0.0.1"`** while shipping as 0.1.1 on PyPI — the fix applied to the core SDK
  never reached the two adapters. Both now match their `pyproject.toml`, and a
  test in each package asserts the two agree so they cannot drift again.
- **The published CLI could not start.** Adding the Postgres driver made
  `pg-mem` a runtime dependency of `@lookspan/storage`, and the release bundler
  inlined it — but `pg-mem` ships a webpack CJS bundle that calls
  `require('crypto')` at load time, which cannot work inside the bundler's ESM
  output. Any release cut from `main` would have thrown `Dynamic require of
  "crypto" is not supported` before printing a line. `pg-mem` is now external
  (and a real dependency of the `lookspan` package), which also drops the
  bundle from 1.8 MB to 363 kB. A new `npm run smoke:cli` step builds the
  publishable artifact and runs it, so `npm run ci` fails if this ever
  regresses.
- **Cancelled trace status** — the collector now derives a `cancelled` status
  instead of always reporting `ok`, and the dashboard shows it with a neutral
  colour (not success green).
- Python exporter flushes buffered spans on exit (atexit + context manager).
- OTLP timestamp conversion guarded against out-of-range values; negative
  span/trace durations clamped to zero.
- SSE subscription cleaned up on abnormal disconnect; invalid dataset items no
  longer silently dropped; trace-placeholder + span insert made atomic.
- Website i18n: translated the missing accessibility skip-link.

## 0.4.1 — 2026-06-03

Representation upgrades — the dashboard now shows understanding, not just records.

### Added
- **Trace timeline (waterfall)** — a new Timeline/Tree toggle in the trace view.
  The timeline lays each span out as a bar positioned by start time, width
  proportional to duration, indented by depth, colored by agent (red on error) —
  so you see *where the time went* at a glance.
- **Conversation transcript** — an LLM span's captured prompt/response now render
  as a chat (system/user/assistant/tool bubbles, tool-calls included) with a
  `raw` toggle, instead of raw JSON.
- **Trace list with signal** — a health strip (traces · error rate · p95 latency ·
  total cost) plus per-row mini-bars for latency (amber when above p95) and cost,
  and a status accent per row.
- **Replay diff** — the Replay panel can show a line-level diff of the replay
  output against the original answer (green added / red removed), alongside the
  cost/latency deltas.
- **Compare dataset runs** — pick run A vs B and see Δ score / cost / ok summary
  tiles and a per-item table with the score delta, to judge "is the cheaper model
  good enough?".

## 0.4.0 — 2026-06-03

Datasets & experiments — the eval loop, end to end.

### Added
- **Datasets** — collect prompts into a named test set (SQLite migration **v6**).
  Seed items straight from a trace's captured prompt (`POST /api/datasets/:id/items/from-trace`)
  or add them by hand, all from the new **Datasets** views in the dashboard.
- **Experiment runs** — `POST /api/datasets/:id/run` runs every item against a
  model (batch replay), optionally scoring each output with the LLM judge, and
  stores a run with aggregate cost / latency / average score. `GET /api/runs/:id`
  returns the per-item breakdown. Runs need a provider key (in-memory only).
- **Add-to-dataset** from a trace's **Replay & judge** panel.

### Changed
- All packages unified at 0.4.0.

## 0.3.0 — 2026-06-03

The evaluation release: close the loop from *observe* to *improve*.

### Added
- **Replay / diff** — `POST /api/traces/:id/replay` re-runs a trace's captured
  prompt against the same or a different model and stores the result next to a
  snapshot of the original. The trace's **Replay & judge** panel shows the
  cost / latency / output diff. Past replays persist (SQLite migration **v5**).
- **LLM-as-judge** — `POST /api/traces/:id/judge` asks a judge model to score a
  trace's prompt/response 0–1 against a rubric and stores it as an `llm-judge`
  score (reusing the existing scores UI).
- **Prompt & output capture** — `@lookspan/openai` and `@lookspan/anthropic` now
  record the request and reply text on the span (toggle with `captureContent`,
  on by default). This is what makes replay & judge possible. Secrets are
  scrubbed server-side before storage.
- **Provider keys** — `LOOKSPAN_OPENAI_API_KEY` / `LOOKSPAN_ANTHROPIC_API_KEY`
  (or `--openai-key` / `--anthropic-key`) enable replay & judge. Keys are held
  in memory only — never written to the database or logged.

### Changed
- All packages unified at 0.3.0.

## 0.2.0 — 2026-06-03

The multi-agent release. Lookspan now shows **how your agents collaborate**, not
just individual calls.

### Added
- **`@lookspan/anthropic`** — drop-in tracing for Claude:
  `observeAnthropic(new Anthropic())` traces every call (including streaming) in
  one line, no OTel or proxy setup.
- **Agent causality** — spans can carry a `parentTraceId` (OTLP attribute
  `lookspan.parent_trace_id`). The session view renders an **agent delegation
  graph** showing which agent handed off to which.
- **Tools view** (`/tools`) — a cross-trace inspector of `tool_call` spans (MCP &
  framework tools): tool, framework, agent, duration, status, link to the trace.
  Backed by `GET /api/tools`.
- **Eval score aggregates** — average per metric on the Overview
  (`GET /api/scores/summary`).
- **Framework recipes** — copy-paste OpenTelemetry setup for Vercel AI SDK,
  Mastra, and LangChain on the Connect page (no custom adapter needed).

### Changed
- SQLite schema migration **v4** adds `parent_trace_id` to `traces` and `spans`.
- All packages unified at 0.2.0.

## 0.1.2 — 2026-06-03 (CLI only)

- Fix: `lookspan --version` now reports the real version (was hardcoded).

## 0.1.1 — 2026-06-03

### Added
- **`@lookspan/openai`** — drop-in tracing: `observeOpenAI(new OpenAI())` traces
  every model call in one line (no OTel, no proxy).
- **Sessions** — `/sessions` list + per-session multi-agent timeline (ordinal
  axis, hover preview); `GET /api/sessions` and `/api/sessions/:id`.
- **Connect page** (`/connect`) — copy-paste onboarding with the live endpoint.
- **Evaluation scores** — `POST /api/traces/:id/scores`, shown in the trace view.
- **Agent visualization** — `agentId` column + per-agent color in the span graph;
  span detail drawer on click; left-to-right graph layout.
- **OTLP protobuf** — `/v1/traces` now accepts `application/x-protobuf` (the OTel
  default) as well as JSON.

### Changed
- Trace list is paginated (cursor + "Load more").
- All packages unified at 0.1.1.

## 0.1.0 — 2026-06-02

First public release. Published to **npm** (`lookspan`, `@lookspan/mcp`,
`@lookspan/types`) and **PyPI** (`lookspan`, `lookspan-langgraph`,
`lookspan-crewai`).

### Added
- **`npx lookspan`** — self-contained CLI that bundles the dashboard and serves
  API + UI from a single process on `:3100`.
- **Publishable SDKs** — `@lookspan/mcp` (npm) and `lookspan` (PyPI, with
  LangGraph and CrewAI adapters).
- **OpenTelemetry** — OTLP/HTTP receiver at `POST /v1/traces`; any OTel exporter
  works with no Lookspan SDK.
- **Cost tracking** — server-side `cost_usd` from a model pricing table,
  overridable via `--pricing <file>`.
- **Stats** — error rate, latency p50/p95/p99, cost-per-day (`/api/stats`).
- **Alerts** — rules on error / cost / tokens / duration, persisted and pushed
  to the dashboard (toast + desktop notification) and the CLI.
- **Retention** — `--retention <dur>` prunes old traces and VACUUMs.
- **Security** — optional `--token` auth; server-side redaction of credential
  attributes before persistence.
- **Dashboard** — trace list with filters/search, trace span graph, costs &
  overview, alerts history; real-time via SSE.
- **Tests** — Vitest suite (100+ tests) and green CI (typecheck + lint + build).

### Notes
- Internal `@lookspan/*` packages (api, collector, storage, events) are bundled
  into the CLI and not published separately.
