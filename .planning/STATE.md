---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: unknown
stopped_at: Completed 11-mrr-optimization-04-PLAN.md — v1.0 milestone COMPLETE
last_updated: "2026-04-07T14:28:35.582Z"
progress:
  total_phases: 11
  completed_phases: 11
  total_plans: 34
  completed_plans: 34
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-31)

**Core value:** AI that actually understands the codebase — better context means better code output.
**Current focus:** Phase 11 — mrr-optimization

## Current Position

Phase: 11
Plan: Not started

## Performance Metrics

**Velocity:**

- Total plans completed: 30
- Average duration: ~14 min/plan
- Total execution time: ~7 hours

**By Phase:**

| Phase                       | Plans | Total  | Avg/Plan |
| --------------------------- | ----- | ------ | -------- |
| Phase 01-foundation         | 3     | ~25min | ~8min    |
| Phase 02-project-detection  | 2     | ~31min | ~15min   |
| Phase 03-indexing-pipeline  | 4     | ~75min | ~19min   |
| Phase 04-mcp-server         | 3     | ~37min | ~12min   |
| Phase 05-installer          | 3     | ~25min | ~8min    |
| Phase 06-observability      | 2     | ~45min | ~22min   |
| Phase 07-benchmarking       | 3     | ~30min | ~10min   |
| Phase 08-dashboard          | 4     | ~95min | ~24min   |
| Phase 09-database-context   | 2     | ~31min | ~16min   |
| Phase 10-advanced-retrieval | 4     | ~45min | ~11min   |

**Recent Trend:**

- Last 6 plans: 10-01 (DependencyGraph wiring), 10-02 (searchWithExpansion), 10-03 (GSD-RAG + agents CLI), 10-04 (verification)
- Trend: ~11min per Phase 10 plan (lightweight — research done upfront, partial pre-implementation)

_Updated after each plan completion_
| Phase 01-foundation P02 | 11min | 3 tasks | 11 files |
| Phase 01-foundation P03 | 5min | 1 tasks | 4 files |
| Phase 02-project-detection P01 | 19min | 3 tasks | 11 files |
| Phase 02-project-detection P02 | 12min | 3 tasks | 5 files |
| Phase 03-indexing-pipeline P01 | 25min | 2 tasks | 5 files |
| Phase 03-indexing-pipeline P02 | 20min | 2 tasks | 5 files |
| Phase 03-indexing-pipeline P03 | 25min | 3 tasks | 4 files |
| Phase 03-indexing-pipeline P04 | 35min | 3 tasks | 8 files |
| Phase 04-mcp-server P01 | 12min | 3 tasks | 7 files |
| Phase 04-mcp-server P02 | 15min | 3 tasks | 10 files |
| Phase 04-mcp-server P03 | 10min | 2 tasks | 0 files |
| Phase 05-installer P01 | 3min | 3 tasks | 8 files |
| Phase 05-installer P02 | 8min | 3 tasks | 9 files |
| Phase 05-installer P03 | 14min | 3 tasks | 6 files |
| Phase 06-observability P01 | 15min | 3 tasks | 8 files |
| Phase 06-observability P02 | 30min | 3 tasks | 8 files |
| Phase 07-benchmarking P01 | 10min | 2 tasks | 7 files |
| Phase 07-benchmarking P02 | 12min | 2 tasks | 5 files |
| Phase 07-benchmarking P03 | 8min | 3 tasks | 1 files |
| Phase 08-dashboard P01 | 20min | 4 tasks | 8 files |
| Phase 08-dashboard P02 | 25min | 4 tasks | 6 files |
| Phase 08-dashboard P03 | 25min | 4 tasks | 7 files |
| Phase 08-dashboard P04 | 35min | 4 tasks | 5 files |
| Phase 09 P01 | 6min | 4 tasks | 12 files |
| Phase 09 P02 | 25 | 4 tasks | 12 files |
| Phase 10 P01 | 8min | 2 tasks | 3 files |
| Phase 10 P02 | 15min | 5 tasks | 8 files |
| Phase 10 P03 | 12min | 6 tasks | 5 files |
| Phase 10 P04 | 10min | 5 tasks | 3 files |
| Phase 11-mrr-optimization P01 | 18min | 3 tasks | 5 files |
| Phase 11-mrr-optimization P02 | 3min | 2 tasks | 4 files |
| Phase 11-mrr-optimization P03 | 8 | 7 tasks | 11 files |
| Phase 11-mrr-optimization P04 | 35min | 5 tasks | 4 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: Vitest over Jest for testing (research validated)
- [Roadmap]: Hono over Fastify for dashboard backend (already MCP SDK dependency)
- [Roadmap]: web-tree-sitter (WASM) over native tree-sitter (cross-platform)
- [Roadmap]: MCP-only retrieval first, auto-context deferred to Phase 10
- [Phase 01-foundation]: Logger uses stderr (fd 2) exclusively — MCP server stdout is JSON-RPC 2.0 channel
- [Phase 01-foundation]: Health check uses /readyz (Qdrant shard-readiness) not /health
- [Phase 01-foundation]: ProjectProfileSchema defined as proper Zod schema (not z.any()) enabling type-safe profile validation in Phase 2
- [Phase 02-project-detection]: All 5 sub-detectors run in parallel via Promise.all for performance on large codebases
- [Phase 02-project-detection]: persistProfile merges into existing config (not replace) — config built incrementally in Phase 5 installer
- [Phase 02-project-detection]: ProfileOverrides extraLanguages/removeLanguages for additive corrections without losing auto-detected languages
- [Phase 03-indexing-pipeline]: Single shared Parser instance causes state corruption in Vitest — use per-language lazy-initialized Parser instances
- [Phase 03-indexing-pipeline]: Same embedding provider for both text and code vectors in Phase 3 — dual-model evaluation deferred to Phase 7 benchmarks
- [Phase 03-indexing-pipeline]: Chunk string IDs converted to UUID format via sha256 first 32 hex chars for Qdrant point IDs
- [Phase 03-indexing-pipeline]: ignore package imported via createRequire() CJS interop (NodeNext + default callable export incompatible)
- [Phase 03-indexing-pipeline]: vi.hoisted() required for mock variables referenced in vi.mock() factories in Vitest
- [Phase 04-mcp-server]: Parallel Promise.all for text+code vector searches — avoids sequential latency, same query vector for both
- [Phase 04-mcp-server]: Max-score merge strategy for dual-vector results — when same chunkId appears in both vectors, keep higher score and set matchedVector='both'
- [Phase 04-mcp-server]: Use CallToolResult type from MCP SDK instead of custom ToolOutput interface — required index signature [x: string]: unknown
- [Phase 04-mcp-server]: bin.ts uses IA_FRAMEWORK_CONFIG env var fallback to .ia-framework/project.json — supports both custom paths and convention discovery
- [Phase 05-installer]: Ollama and OpenCode are soft-fail installs (non-fatal) — Docker and Node.js are hard-fail (framework cannot run without them)
- [Phase 05-installer]: configure-opencode.sh uses 'node -e' for JSON merge in bash — avoids jq dependency, keeps installer self-contained
- [Phase 05-installer]: CLI test file (cli.test.ts) added as smoke tests — Vitest exits code 1 with no test files, breaking pnpm test
- [Phase 05-installer]: EmbeddingProvider interface requires 'name' and 'model' readonly string fields — test mocks must include these
- [Phase 06-observability]: MCP and CLI both log RagEvents with strategy='mcp'; graceful degradation via try/catch; MetricsStore co-located with project.json at .ia-framework/metrics.sqlite
- [Phase 07-benchmarking]: compare subcommand supports prefix ID matching via listRuns() scan — avoids requiring full UUID input
- [Phase 07-benchmarking]: All benchmark subcommands extracted to named helpers (runSubcommand/listSubcommand/historySubcommand/compareSubcommand) co-located in one file for readability
- [Phase 07-benchmarking]: SQLite REAL cannot store Infinity — stored as 1e308, restored via rank >= 1e307 ? Infinity : rank
- [Phase 07-benchmarking]: isBaseline = scoreThreshold > 1.0 (2.0 used for no-RAG baseline runs)
- [Phase 07-benchmarking]: Zod v4 added explicitly to @ia-framework/benchmark package.json (workspace uses v4.3.6)
- [Phase 08-dashboard]: packages/dashboard-api + apps/dashboard — two-package structure, single Docker container
- [Phase 08-dashboard]: Hono serves both REST API and Vite static build from one container
- [Phase 08-dashboard]: Re-indexing triggered in-process via IndexingPipeline (direct call, not subprocess)
- [Phase 08-dashboard]: IndexingPanel polls /api/indexing/status every 2s when running=true (useRef interval)
- [Phase 08-dashboard]: IA_FRAMEWORK_DIR env var set by install.sh, bind-mounted into dashboard container at /ia-framework-data
- [Phase 08-dashboard]: ConfigWatcher uses chokidar for live project.json sync (in-memory cache + EventEmitter)
- [Phase 08-dashboard]: No authentication — localhost-only Docker container (same as Qdrant pattern)
- [Phase 08-dashboard]: Token charts: daily BarChart (Recharts) + paginated per-query QueryEventTable with expandable rows
- [Phase 08-dashboard]: MetricsStore extended with getEventsByDay() + listEvents(limit, offset) for dashboard API routes
- [Phase 08-dashboard]: recharts Formatter type requires ValueType|undefined and NameType|undefined params for TypeScript-strict compatibility
- [Phase 08-dashboard]: QueryEventTable self-fetches with internal pagination state rather than receiving data as props
- [Phase 08-dashboard]: tsup split into two configs for server entry to ensure import.meta.url guard works correctly (splitting:false)
- [Phase 08-dashboard]: Dockerfile requires python3/make/g++ in both stages for tree-sitter native module compilation
- [Phase 08-dashboard]: tsconfig.base.json must be copied in Docker build stage alongside workspace manifest files
- [Phase 08-dashboard]: Qdrant image (qdrant/qdrant:latest) has no curl, wget, nc, or /dev/tcp — healthcheck removed entirely; depends_on uses service_started
- [Phase 08-dashboard]: QDRANT_HOST env var in docker-compose dashboard service set to "qdrant" (Docker service name) — without project.json, server.ts falls back to this env var so /api/status can reach Qdrant inside the container network
- [Phase 08-dashboard]: ConfigWatcher.start() catches ConfigNotFoundError and runs in unconfigured mode (config=null) rather than crashing — watches for project.json creation via chokidar 'add' event for hot-reload
- [Phase 08-dashboard]: Config page shows friendly "No project configured yet" UI (with install.sh hint) when /api/config returns 503 — no red error state
- [Phase 09]: Pool constructor injection (not vi.mock) for PostgresSource testability
- [Phase 09]: FK query runs once for all tables for efficiency; contextSources processed after file chunks
- [Phase 09]: Used class mock pattern instead of vi.fn().mockReturnValue() for PostgresSource constructor — vi.fn with new does not return mocked value in Vitest
- [Phase 09]: dbRouter accepts injectable loadDbConfigFn + PostgresSourceCtor for testability without vi.mock()
- [Phase 10]: RETR-04 (auto-context) deferred to v2 — OpenCode doesn't support MCP Resources/Prompts or prompt.before plugin hooks; tool-based search is more token-efficient
- [Phase 10]: GSD-RAG integration via MCP tools (won 11-1-0 over CLI subprocess in research spike)
- [Phase 10]: WKFL-03 (online LLMs) satisfied by OpenCode's 75+ provider model config — no implementation needed
- [Phase 10]: Agent docs injection targets the target project's AGENTS.md/CLAUDE.md, not the framework's own docs
- [Phase 10]: Marker-based idempotency for agent docs injection (<!-- ia-framework:rag-start/end -->)
- [Phase 10]: DependencyGraph.getNeighborFiles() is sync but wrapped in async lambda in bin.ts to match SearchEngineConfig interface
- [Phase 10]: mockReset() required instead of mockClear() — mockClear does NOT clear mockResolvedValueOnce queue
- [Phase 11-mrr-optimization]: validateCorpus uses async fs.access; Zod schema expectedFiles min(0) for negative queries; loadCorpus supports flat JSON array format; corpus file tracked via gitignore exception
- [Phase 11-mrr-optimization]: ChunkLike structural type accepts both CodeChunk and ChunkMetadata for chunkToDescription() — avoids cross-package dependency while supporting DB context source chunks with extra chunkTypes ('table', 'view')
- [Phase 11-mrr-optimization]: Embedding cost doubles (2x embedBatch calls) with prose descriptions — intentional for semantic quality; acceptable for Ollama (local), documented for OpenAI users
- [Phase 11-mrr-optimization]: Hybrid search exposed as separate search_codebase_hybrid MCP tool (not a param on existing tool) for independent evaluation
- [Phase 11-mrr-optimization]: computeTermFrequencySparseVector exported from @ia-framework/retrieval and imported by indexer (no circular dep)
- [Phase 11-mrr-optimization]: SearchEngine.searchHybrid() falls back to search() when vectorStore.searchHybrid is absent for backward compat
- [Phase 11-mrr-optimization]: djb2 hash collisions in sparse vectors fixed via indexMap merge (sum TF values) — prevents Qdrant 422 "indices must be unique"
- [Phase 11-mrr-optimization]: Threshold sweep 0.3/0.4/0.5 tied at MRR=0.50; 0.3 chosen (max recall at equal precision); 0.6 worse (MRR 0.46)
- [Phase 11-mrr-optimization]: MCP default scoreThreshold lowered from 0.5 → 0.3 based on benchmark evidence

### Pending Todos

None — v1.0 milestone shipped. Next: plan v2.0 roadmap.

### Phase 10 Design Decisions (from /gsd:discuss-phase 10)

- [Phase 10]: Auto-context (RETR-04) — research first; spike in 10-02 before implementation; outcome may defer to v2
- [Phase 10]: GSD-RAG integration — dedicated spike (10-03) comparing CLI subprocess vs MCP tool; key criteria: token cost, call count, latency, context quality; MCP expected to win
- [Phase 10]: WKFL-03 (online LLMs) expected to already be satisfied by OpenCode model config — verification only
- [Phase 10]: DependencyGraph in packages/retrieval (file-level adjacency, SQLite graph.sqlite, BFS for hop expansion)
- [Phase 10]: 4 plans instead of 3 — GSD-RAG spike gets its own dedicated plan (10-03)

### Blockers/Concerns

None — all blockers resolved:

- Auto-context injection mechanism: researched, deferred to v2 with rationale documented
- Benchmark task corpus design: resolved in Phase 7 (retrieval precision queries)

### Quick Tasks Completed

| #          | Description                                     | Date       | Commit  | Status   | Directory                                                                                                           |
| ---------- | ----------------------------------------------- | ---------- | ------- | -------- | ------------------------------------------------------------------------------------------------------------------- |
| 260402-j1g | Add Ollama embedding model selection capability | 2026-04-02 | 661f679 | Verified | [260402-j1g-add-capability-of-ollama-to-change-betwe](./quick/260402-j1g-add-capability-of-ollama-to-change-betwe/) |
| 260406-ms1 | Dashboard live-updating 4-stage pipeline view   | 2026-04-06 | 4b061fa | Complete | [260406-ms1-make-the-dashboard-live-updating-with-fi](./quick/260406-ms1-make-the-dashboard-live-updating-with-fi/) |
| 260406-n9z | Add stop indexing capability — CLI + dashboard  | 2026-04-06 | -       | Complete | [260406-n9z-add-stop-indexing-capability-cli-command](./quick/260406-n9z-add-stop-indexing-capability-cli-command/) |

## Session Continuity

Last session: 2026-04-07T14:25:00.000Z
Stopped at: Completed 11-mrr-optimization-04-PLAN.md — v1.0 milestone COMPLETE
Resume file: None
