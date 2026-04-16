---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: RAG Quality & Dashboard Evolution
status: complete
stopped_at: Phase 18 complete — v1.1 milestone shipped
last_updated: '2026-04-16T00:00:00.000Z'
progress:
  total_phases: 7
  completed_phases: 7
  total_plans: 17
  completed_plans: 19
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-09)

**Core value:** AI that actually understands the codebase — better context means better code output.
**Current focus:** v1.1 complete — ready to plan v1.2 or next milestone

## Current Position

Phase: 18 (dashboard-analytics) — COMPLETE
Milestone: v1.1 — SHIPPED 2026-04-16

## v1.0 Performance Summary

**Velocity (v1.0):**

- Total phases: 11
- Total plans completed: 34
- Average duration: ~14 min/plan
- Total execution time: ~7 hours

## v1.1 Performance Summary

**Velocity (v1.1):**

- Total phases: 7
- Total plans completed: 17 (+ 2 context/summary files)
- Phases: 12 → 13 → 14 → 15 → 16 → 17 → 18

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.

**Carried from v1.0 (still relevant):**

- [Phase 01]: Logger uses stderr (fd 2) — MCP stdout is JSON-RPC 2.0
- [Phase 01]: Health check uses /readyz (Qdrant shard-readiness)
- [Phase 03]: Single shared Parser causes state corruption — use per-language lazy-initialized Parsers
- [Phase 03]: Chunk IDs → UUID via sha256 first 32 hex chars for Qdrant point IDs
- [Phase 04]: Max-score merge for dual-vector results
- [Phase 06]: MetricsStore co-located at .ia-framework/metrics.sqlite
- [Phase 08]: Hono serves both REST API and Vite static build from one container
- [Phase 08]: ConfigWatcher uses chokidar for live project.json sync
- [Phase 08]: Dockerfile requires python3/make/g++ for tree-sitter native module
- [Phase 08]: Qdrant Docker image has no healthcheck tools — uses service_started
- [Phase 09]: Pool constructor injection for PostgresSource testability
- [Phase 10]: Auto-context deferred to v2 — OpenCode lacks MCP Resources/Prompts support
- [Phase 10]: GSD-RAG via MCP tools (won 11-1-0 over CLI subprocess)
- [Phase 10]: Agent docs injection targets target project's AGENTS.md/CLAUDE.md
- [Phase 11]: Hybrid search as separate MCP tool (search_codebase_hybrid)
- [Phase 11]: MCP default scoreThreshold 0.3 (benchmark-validated)
- [Phase 11]: Embedding cost doubles with prose descriptions — acceptable for Ollama
- [Phase 13]: Used spread-based conditional property forwarding to handle exactOptionalPropertyTypes between ChunkingConfig and ChunkerConfig
- [Phase 13]: Used p-queue for concurrent batch embedding with provider-aware defaults (ollama:3, openai:10)
- [Phase 13]: Retry-once-then-skip pattern for embedding batch resilience with skippedChunks tracking
- [Phase 13]: No ETA in progress display — stage bar, counts, stage name only per D-05
- [Phase 14]: Extended CodeChunk with optional description field and semantic chunkType to support LLM-generated descriptions
- [Phase 14]: Added LlmConfigSchema (model + ollamaUrl) to indexing config for LLM chunking provider settings
- [Phase 14]: Pipeline uses description ?? chunkToDescription(c) pattern — LLM descriptions take priority, fallback to heuristic
- [Phase 14]: Content-hash cache key is SHA-256(fileContent):modelName for per-model cache isolation
- [Phase 14]: LlmChunkingStrategy uses retry-once on Ollama failure per file (D-19)
- [Phase 14]: Collection routing uses suffix pattern ({project}-llm) to keep AST and LLM chunks separate
- [Phase 14]: Ollama verification is fail-fast at CLI level before any LLM chunking work
- [Phase 14]: Default chunking model is llama3.2:latest when not configured in project.json
- [Phase 15]: Over-fetch with limit\*2 per engine before RRF ensures good candidates without ballooning API calls
- [Phase 15]: searchWithExpansion routes through this.getFile() (all collections) rather than individual engine.searchWithExpansion to avoid single-collection bias in graph expansion
- [Phase 15-multi-collection-search-mcp-integration]: McpServerConfig.searchEngine widened to SearchEngine | MultiCollectionSearchEngine — both satisfy tool duck types
- [Phase 15-multi-collection-search-mcp-integration]: @qdrant/js-client-rest must be added explicitly to mcp-server and cli packages (not inherited from vector-store)
- [Phase 16]: DependencyGraph.getNeighborFiles is sync (string[]) but SearchEngineConfig expects async (Promise<string[]>) — server.ts wraps with Promise.resolve() adapter rather than modifying DependencyGraph
- [Phase 18]: Score bucketing uses floor(rr \* 10) with rr >= 1.0 clamped to bucket 9 — inclusive upper bound for perfect MRR scores
- [Phase 18]: analyticsRouter uses listRuns(1000) for aggregation queries — pragmatic limit for local single-user tool

### Pending Todos

None.

### Blockers/Concerns

None — v1.1 complete.

### Quick Tasks Completed

| #          | Description                                                                        | Date       | Commit  | Directory                                                                                                           |
| ---------- | ---------------------------------------------------------------------------------- | ---------- | ------- | ------------------------------------------------------------------------------------------------------------------- |
| 260416-fkg | Add LLM chunking model config to project.json init, dashboard settings, and README | 2026-04-16 | d8badcf | [260416-fkg-add-llm-chunking-model-config-to-project](./quick/260416-fkg-add-llm-chunking-model-config-to-project/) |

## Session Continuity

Last activity: 2026-04-16 - Completed quick task 260416-fkg: Add LLM chunking model config to project.json init, dashboard settings, and README
Stopped at: Quick task 260416-fkg complete
Resume file: Plan next milestone (v1.2) when ready
