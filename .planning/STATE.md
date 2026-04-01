---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: in_progress
stopped_at: Completed 07-benchmarking-03-PLAN.md — Phase 7 complete
last_updated: "2026-04-01T18:13:53Z"
last_activity: 2026-04-01
progress:
  total_phases: 10
  completed_phases: 7
  total_plans: 20
  completed_plans: 20
  percent: 70
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-31)

**Core value:** AI that actually understands the codebase — better context means better code output.
**Current focus:** Phase 8 — Monitoring Dashboard

## Current Position

Phase: 7 of 10 (Benchmarking System) — COMPLETE
Plan: 3 of 3 in current phase
Status: Phase 7 complete — ready to begin Phase 8

Last activity: 2026-04-01

Progress: [███████░░░] 70%

## Performance Metrics

**Velocity:**

- Total plans completed: 20
- Average duration: ~13 min/plan
- Total execution time: ~4.5 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| Phase 01-foundation | 3 | ~25min | ~8min |
| Phase 02-project-detection | 2 | ~31min | ~15min |
| Phase 03-indexing-pipeline | 4 | ~75min | ~19min |
| Phase 04-mcp-server | 3 | ~37min | ~12min |
| Phase 05-installer | 3 | ~25min | ~8min |
| Phase 06-observability | 2 | ~45min | ~22min |
| Phase 07-benchmarking | 3 | ~30min | ~10min |

**Recent Trend:**

- Last 5 plans: 06-01 (observability), 06-02 (wire metrics), 07-01 (benchmark core), 07-02 (corpus + CLI), 07-03 (compare + verify)
- Trend: ~10min per Phase 7 plan

*Updated after each plan completion*
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

### Pending Todos

None.

### Blockers/Concerns

- Auto-context injection mechanism via OpenCode is unvalidated — research deferred to Phase 10
- Benchmark task corpus design (coding tasks) resolved: used retrieval precision queries (expectedFiles per query) — AI output quality benchmarks deferred (BNCH-01 not yet implemented)

## Session Continuity

Last session: 2026-04-01T18:13:53Z
Stopped at: Completed 07-benchmarking-03-PLAN.md — Phase 7 complete
Resume file: None
