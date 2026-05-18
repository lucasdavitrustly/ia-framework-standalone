# Milestones

## v1.6 RAG Retrieval Quality Improvements (Shipped: 2026-05-18)

**Goal:** Based on benchmark results (Claude Opus 4.6, 2026-05-15), MCP provides +1.1% quality uplift but regresses on keyword lookups (-3pts). This milestone targets specific regression gaps, latency issues, and benchmark tooling blockers.

**Phases completed:** 5 phases (37-41), 7 plans, shipped via PRs #38, #39, #40

**Key accomplishments:**

- Deterministic query complexity classifier (`classifyQuery`) routes keyword/symbol lookups directly to BM25, eliminating the -3pt keyword regression — zero LLM calls, <5ms latency
- Line-number-aware search results display `file:startLine-endLine` format with pipeline validation warning when chunk boundaries exceed file line count
- Confidence-based early exit: keyword queries at ≥0.8 confidence skip vector search entirely, with structured logging of earlyExit/earlyExitReason
- Benchmark preflight expanded to 5 tools with `BenchmarkPreflightError` and gate in `BenchmarkRunner.run()` — unblocks benchmark runs when tools are available
- Configurable hybrid search tuning: `keywordPrefetchMultiplier`, `semanticPrefetchMultiplier`, `rrfK`, `rrfScoreThreshold` in project.json — enables per-project hybrid search optimization without code changes

---

## v1.5 RAG Retrieval Quality Improvements (Active)

**Goal:** Eliminate context pollution causing MCP to be a net negative (-3% quality, +20% cost). A/B benchmark showed RAG injecting irrelevant context causes hallucination on negative queries and inflates token usage without quality gain.

**Benchmark baseline:** MCP is net negative — -3% quality, +20% cost, 2/6 win rate. Negative query test showed 2x irrelevant tokens injected causing hallucination.

**Success criteria:** MCP win rate >= 4/6, no hallucination flags, <= +30% token overhead.

**Phases:**

| Phase                          | Name                                       | Priority | Size | Package               | Expected Impact                                         |
| ------------------------------ | ------------------------------------------ | -------- | ---- | --------------------- | ------------------------------------------------------- |
| 32 — relevance-score-threshold | Score threshold >= 0.5 with null fallback  | P0       | S    | `packages/mcp-server` | Eliminates hallucination on negative/irrelevant queries |
| 33 — reranking-layer           | Re-ranking before context injection        | P1       | M    | `packages/core`       | Filters low-relevance chunks, improves precision        |
| 34 — context-budget-caps       | Token caps per query type                  | P2       | S    | `packages/mcp-server` | Reduces token waste on simple queries                   |
| 35 — index-code-patterns       | Index code examples/patterns               | P3       | M    | `packages/core`       | Improves actionability of retrieved context             |
| 36 — query-type-classification | Query classification for retrieval routing | P4       | L    | `packages/mcp-server` | Skip retrieval entirely for negative/simple queries     |

**Key accomplishments:** _(to be filled on ship)_

---

## v1.4 RAG Quality Improvements (Shipped: 2026-04-30)

**Phases completed:** 8 phases, 22 plans, 19 tasks

**Key accomplishments:**

- One-liner:
- @ia-framework/core: shared TypeScript types, Zod-validated config loader with ConfigNotFoundError, and pino logger factory writing JSON to stderr
- Qdrant vector database via Docker Compose with named volume persistence, health checks, and dev/prod environment split
- Class inheritance metadata (extends/implements) extracted from Java and TypeScript ASTs into CodeChunk fields — superclass, interfaces, isInnerClass
- Found during:
- @ia-framework/project-detector: detectProject(path) → ProjectProfile scanning languages, frameworks, package manager, test runner, and build commands from filesystem signals
- confirmProfile() + persistProfile() enabling developer override of detected profile and durable storage in .ia-framework/project.json with full loadConfig() round-trip
- One-liner:
- One-liner:
- One-liner:
- One-liner:
- One-liner:
- One-liner:
- One-liner:
- One-liner:
- One-liner:
- One-liner:
- Task 1 — TypeScript decorator chunks:
- Token cap utility `applyTokenCap` + `estimateTokens` implemented via TDD, with `RetrievalConfigSchema` extended to accept optional `maxTokensPerCall` positive integer
- Both search tool handlers enforce a 6000-token soft cap with 70/30 hierarchy/direct budget split and response metadata

---

## v1.4 RAG Retrieval Quality Improvements (Planned)

**Goal:** Close the two regression gaps from the v1.3 benchmark run (arch-semantic, deps-cross-file) and raise overall quality score by ~10–15 pts through structural indexing improvements, smarter retrieval, and token budget discipline.

**Benchmark baseline:** MCP +7% quality gain vs no-MCP, 4/6 prompts won. Two regressions on arch-semantic and deps-cross-file prompts.

**Phases:**

| Phase                                 | Priority    | Scope                                                        | Package                               | Expected Impact                                                                      |
| ------------------------------------- | ----------- | ------------------------------------------------------------ | ------------------------------------- | ------------------------------------------------------------------------------------ |
| ✅ 27 — cross-file-relationship-graph | P1 (Large)  | Cross-file import/export relationship graph indexing         | `packages/core` (indexer)             | +10 pts — fixes arch-semantic and deps-cross-file regressions (completed 2026-04-30) |
| 28 — query-aware-mmr-reranking        | P2 (Medium) | MMR re-ranking in retrieval to reduce redundant chunks       | `packages/mcp-server` (retrieval)     | +4 pts — Technical Depth and Completeness on arch/synthesis queries                  |
| 29 — negative-result-citation         | P3 (Small)  | Surface present alternatives on negative-result queries      | `packages/mcp-server` (tool response) | +1 pt Code References, trust win                                                     |
| 30 — adaptive-decorator-chunking      | P4 (Medium) | Preserve decorator/aspect chains across chunk boundaries     | `packages/core` (chunker)             | +3 pts — AOP/annotation-heavy Java codebases                                         |
| 31 — dynamic-retrieval-cost-cap       | P5 (Small)  | Soft token budget cap + cost awareness in retrieval pipeline | `packages/mcp-server` (retrieval)     | Prevents 9× token spikes on over-retrieved queries                                   |

**Key accomplishments:** _(to be filled on ship)_

---

## v1.3 RAG Quality Improvements (Shipped: 2026-04-29)

**Phases completed:** 27 phases, 74 plans, 79 tasks

**Key accomplishments:**

- One-liner:
- @ia-framework/core: shared TypeScript types, Zod-validated config loader with ConfigNotFoundError, and pino logger factory writing JSON to stderr
- Qdrant vector database via Docker Compose with named volume persistence, health checks, and dev/prod environment split
- @ia-framework/project-detector: detectProject(path) → ProjectProfile scanning languages, frameworks, package manager, test runner, and build commands from filesystem signals
- confirmProfile() + persistProfile() enabling developer override of detected profile and durable storage in .ia-framework/project.json with full loadConfig() round-trip
- One-liner:
- One-liner:
- One-liner:
- One-liner:
- One-liner:
- One-liner:
- One-liner:
- One-liner:
- One-liner:
- One-liner:
- One-liner:
- One-liner:
- One-liner:
- One-liner:
- One-liner:
- 1. [Rule 1 - Bug] Mock triggerIndexing resolved immediately causing state.running=false before assertion
- None
- One-liner:
- One-liner:
- One-liner:
- 1. [Rule 1 - Bug] Fixed Vitest mock pattern for PostgresSource constructor in db.test.ts
- One-liner:
- One-liner:
- One-liner:
- One-liner:
- One-liner:
- `chunkToDescription()` helper generates NLP-friendly prose from chunk metadata; IndexingPipeline now embeds prose descriptions into textVector and raw code into codeVector using separate embedBatch calls
- One-liner:
- One-liner:
- Phase:
- ChunkingStrategy interface with AstChunkingStrategy wrapper, embeddingConcurrency config, and batch progress fields for pipeline refactoring
- One-liner:
- Extended CodeChunk with description field and semantic chunkType, added LlmConfigSchema validation, and made pipeline text embedding description-aware with nullish coalescing fallback
- Ported spike LLM chunking code into production indexer strategies and implemented LlmChunkingStrategy with SHA-256 content-hash cache, producing semantic CodeChunks with LLM prose summaries
- `--strategy llm` CLI flag wiring LlmChunkingStrategy with Ollama verification, model management, collection routing, and per-file progress
- Problem:
- One-liner:
- One-liner:
- DependencyGraph async adapter
- Task 1: SearchHistoryStore (TDD)
- Task 1: API client + History page + table + filter bar
- API client additions (`apps/dashboard/src/api/client.ts`)
- P0 bug fix: hybrid and multi-collection RRF search modes no longer silently drop all results due to 0.3 cosine threshold applied to rank-based RRF scores (~0.01-0.03)
- 3-run MRR baseline benchmark with stddev reporting, dedicated SQLite storage, and `ia-framework benchmark baseline` CLI subcommand
- Prompt version added to LLM cache key (hash:model:version format) with PROMPT_CONTENT_HASH export and `ia-framework prompt bump` CLI command
- Chunk overlap/gap detector with 4 violation types auto-wired into LlmChunkingStrategy.chunk() on both cache-hit and cache-miss paths
- Enhanced LLM chunking prompt with class grouping rules, minimum 5-line size enforcement, domain terminology guidance, and few-shot Java boundary examples via configurable example loader
- Heuristic 0-100 scorer for LLM chunk summaries stored as Qdrant metadata, with end-of-run quality distribution report
- `ia-framework prompt compare v1 v2` command with full re-index per version, per-query MRR delta table with ANSI color coding, and markdown report output
- 1. [Rule 1 - Bug] exactOptionalPropertyTypes incompatibility in app.ts
- TuningPage at /tuning with ChunkInspector (filterable chunk list with quality scores) and PromptVersionChart (color-coded MRR timeline with click-to-detail via BenchmarkDetailPanel)
- Recharts histogram with interactive threshold slider, query selector, and side-by-side near-miss comparison panel completing the Score Distribution tab
- Java method chunks now include class-level preamble (package + imports + class signature) making each chunk independently comprehensible, with parentName set and parse-failure fallback
- Spring Boot OrderController integration test validates preamble on @RestController-annotated classes; fixed buildPreamble to correctly capture class signature when annotations precede the declaration
- `searchWithFallback()` method on SearchEngine with semantic → hybrid → BM25 keyword fallback sequence, `searchKeyword?` interface extension, and `FallbackSearchResult` typed envelope
- search_codebase and search_codebase_hybrid tools now return structured fallback envelope with keyword suggestions when primary search returns zero results
- Maven POM parser with fast-xml-parser extracting coordinates/dependencies into typed ModuleGraph with BFS transitive traversal and SQLite persistence
- ChunkPayload enriched with maven_module coordinates during indexing, get_module_dependencies MCP tool returning BFS dependency graph with interface chunks
- searchByModule adapter wired to SearchEngine with mavenModule.artifactId Qdrant filter, closing the verification gap from 24-02
- One-liner:
- Identity parser extracts LLM-IDENTITY blocks with case-insensitive model comparison; BenchmarkStore schema extended with model_mismatch, identity_missing, and run_integrity columns
- BenchmarkRunner now parses LLM-IDENTITY blocks from rawResponse, flags model mismatches, aborts in strict mode, and computes runIntegrity (full/partial/unknown) after each run
- --strict-model flag and validate-models subcommand added to benchmark CLI, enabling CI enforcement and retroactive model identity auditing

---

## v1.3 RAG Quality Improvements (Shipped: 2026-04-29)

**Phases completed:** 27 phases, 74 plans, 79 tasks

**Key accomplishments:**

- One-liner:
- @ia-framework/core: shared TypeScript types, Zod-validated config loader with ConfigNotFoundError, and pino logger factory writing JSON to stderr
- Qdrant vector database via Docker Compose with named volume persistence, health checks, and dev/prod environment split
- @ia-framework/project-detector: detectProject(path) → ProjectProfile scanning languages, frameworks, package manager, test runner, and build commands from filesystem signals
- confirmProfile() + persistProfile() enabling developer override of detected profile and durable storage in .ia-framework/project.json with full loadConfig() round-trip
- One-liner:
- One-liner:
- One-liner:
- One-liner:
- One-liner:
- One-liner:
- One-liner:
- One-liner:
- One-liner:
- One-liner:
- One-liner:
- One-liner:
- One-liner:
- One-liner:
- One-liner:
- 1. [Rule 1 - Bug] Mock triggerIndexing resolved immediately causing state.running=false before assertion
- None
- One-liner:
- One-liner:
- One-liner:
- 1. [Rule 1 - Bug] Fixed Vitest mock pattern for PostgresSource constructor in db.test.ts
- One-liner:
- One-liner:
- One-liner:
- One-liner:
- One-liner:
- `chunkToDescription()` helper generates NLP-friendly prose from chunk metadata; IndexingPipeline now embeds prose descriptions into textVector and raw code into codeVector using separate embedBatch calls
- One-liner:
- One-liner:
- Phase:
- ChunkingStrategy interface with AstChunkingStrategy wrapper, embeddingConcurrency config, and batch progress fields for pipeline refactoring
- One-liner:
- Extended CodeChunk with description field and semantic chunkType, added LlmConfigSchema validation, and made pipeline text embedding description-aware with nullish coalescing fallback
- Ported spike LLM chunking code into production indexer strategies and implemented LlmChunkingStrategy with SHA-256 content-hash cache, producing semantic CodeChunks with LLM prose summaries
- `--strategy llm` CLI flag wiring LlmChunkingStrategy with Ollama verification, model management, collection routing, and per-file progress
- Problem:
- One-liner:
- One-liner:
- DependencyGraph async adapter
- Task 1: SearchHistoryStore (TDD)
- Task 1: API client + History page + table + filter bar
- API client additions (`apps/dashboard/src/api/client.ts`)
- P0 bug fix: hybrid and multi-collection RRF search modes no longer silently drop all results due to 0.3 cosine threshold applied to rank-based RRF scores (~0.01-0.03)
- 3-run MRR baseline benchmark with stddev reporting, dedicated SQLite storage, and `ia-framework benchmark baseline` CLI subcommand
- Prompt version added to LLM cache key (hash:model:version format) with PROMPT_CONTENT_HASH export and `ia-framework prompt bump` CLI command
- Chunk overlap/gap detector with 4 violation types auto-wired into LlmChunkingStrategy.chunk() on both cache-hit and cache-miss paths
- Enhanced LLM chunking prompt with class grouping rules, minimum 5-line size enforcement, domain terminology guidance, and few-shot Java boundary examples via configurable example loader
- Heuristic 0-100 scorer for LLM chunk summaries stored as Qdrant metadata, with end-of-run quality distribution report
- `ia-framework prompt compare v1 v2` command with full re-index per version, per-query MRR delta table with ANSI color coding, and markdown report output
- 1. [Rule 1 - Bug] exactOptionalPropertyTypes incompatibility in app.ts
- TuningPage at /tuning with ChunkInspector (filterable chunk list with quality scores) and PromptVersionChart (color-coded MRR timeline with click-to-detail via BenchmarkDetailPanel)
- Recharts histogram with interactive threshold slider, query selector, and side-by-side near-miss comparison panel completing the Score Distribution tab
- Java method chunks now include class-level preamble (package + imports + class signature) making each chunk independently comprehensible, with parentName set and parse-failure fallback
- Spring Boot OrderController integration test validates preamble on @RestController-annotated classes; fixed buildPreamble to correctly capture class signature when annotations precede the declaration
- `searchWithFallback()` method on SearchEngine with semantic → hybrid → BM25 keyword fallback sequence, `searchKeyword?` interface extension, and `FallbackSearchResult` typed envelope
- search_codebase and search_codebase_hybrid tools now return structured fallback envelope with keyword suggestions when primary search returns zero results
- Maven POM parser with fast-xml-parser extracting coordinates/dependencies into typed ModuleGraph with BFS transitive traversal and SQLite persistence
- ChunkPayload enriched with maven_module coordinates during indexing, get_module_dependencies MCP tool returning BFS dependency graph with interface chunks
- searchByModule adapter wired to SearchEngine with mavenModule.artifactId Qdrant filter, closing the verification gap from 24-02
- One-liner:
- Identity parser extracts LLM-IDENTITY blocks with case-insensitive model comparison; BenchmarkStore schema extended with model_mismatch, identity_missing, and run_integrity columns
- BenchmarkRunner now parses LLM-IDENTITY blocks from rawResponse, flags model mismatches, aborts in strict mode, and computes runIntegrity (full/partial/unknown) after each run
- --strict-model flag and validate-models subcommand added to benchmark CLI, enabling CI enforcement and retroactive model identity auditing

---

## v1.2 Chunking Tuning & Retrieval Quality (Shipped: 2026-04-29)

**Phases completed:** 27 phases, 74 plans, 79 tasks

**Key accomplishments:**

- One-liner:
- @ia-framework/core: shared TypeScript types, Zod-validated config loader with ConfigNotFoundError, and pino logger factory writing JSON to stderr
- Qdrant vector database via Docker Compose with named volume persistence, health checks, and dev/prod environment split
- @ia-framework/project-detector: detectProject(path) → ProjectProfile scanning languages, frameworks, package manager, test runner, and build commands from filesystem signals
- confirmProfile() + persistProfile() enabling developer override of detected profile and durable storage in .ia-framework/project.json with full loadConfig() round-trip
- One-liner:
- One-liner:
- One-liner:
- One-liner:
- One-liner:
- One-liner:
- One-liner:
- One-liner:
- One-liner:
- One-liner:
- One-liner:
- One-liner:
- One-liner:
- One-liner:
- One-liner:
- 1. [Rule 1 - Bug] Mock triggerIndexing resolved immediately causing state.running=false before assertion
- None
- One-liner:
- One-liner:
- One-liner:
- 1. [Rule 1 - Bug] Fixed Vitest mock pattern for PostgresSource constructor in db.test.ts
- One-liner:
- One-liner:
- One-liner:
- One-liner:
- One-liner:
- `chunkToDescription()` helper generates NLP-friendly prose from chunk metadata; IndexingPipeline now embeds prose descriptions into textVector and raw code into codeVector using separate embedBatch calls
- One-liner:
- One-liner:
- Phase:
- ChunkingStrategy interface with AstChunkingStrategy wrapper, embeddingConcurrency config, and batch progress fields for pipeline refactoring
- One-liner:
- Extended CodeChunk with description field and semantic chunkType, added LlmConfigSchema validation, and made pipeline text embedding description-aware with nullish coalescing fallback
- Ported spike LLM chunking code into production indexer strategies and implemented LlmChunkingStrategy with SHA-256 content-hash cache, producing semantic CodeChunks with LLM prose summaries
- `--strategy llm` CLI flag wiring LlmChunkingStrategy with Ollama verification, model management, collection routing, and per-file progress
- Problem:
- One-liner:
- One-liner:
- DependencyGraph async adapter
- Task 1: SearchHistoryStore (TDD)
- Task 1: API client + History page + table + filter bar
- API client additions (`apps/dashboard/src/api/client.ts`)
- P0 bug fix: hybrid and multi-collection RRF search modes no longer silently drop all results due to 0.3 cosine threshold applied to rank-based RRF scores (~0.01-0.03)
- 3-run MRR baseline benchmark with stddev reporting, dedicated SQLite storage, and `ia-framework benchmark baseline` CLI subcommand
- Prompt version added to LLM cache key (hash:model:version format) with PROMPT_CONTENT_HASH export and `ia-framework prompt bump` CLI command
- Chunk overlap/gap detector with 4 violation types auto-wired into LlmChunkingStrategy.chunk() on both cache-hit and cache-miss paths
- Enhanced LLM chunking prompt with class grouping rules, minimum 5-line size enforcement, domain terminology guidance, and few-shot Java boundary examples via configurable example loader
- Heuristic 0-100 scorer for LLM chunk summaries stored as Qdrant metadata, with end-of-run quality distribution report
- `ia-framework prompt compare v1 v2` command with full re-index per version, per-query MRR delta table with ANSI color coding, and markdown report output
- 1. [Rule 1 - Bug] exactOptionalPropertyTypes incompatibility in app.ts
- TuningPage at /tuning with ChunkInspector (filterable chunk list with quality scores) and PromptVersionChart (color-coded MRR timeline with click-to-detail via BenchmarkDetailPanel)
- Recharts histogram with interactive threshold slider, query selector, and side-by-side near-miss comparison panel completing the Score Distribution tab
- Java method chunks now include class-level preamble (package + imports + class signature) making each chunk independently comprehensible, with parentName set and parse-failure fallback
- Spring Boot OrderController integration test validates preamble on @RestController-annotated classes; fixed buildPreamble to correctly capture class signature when annotations precede the declaration
- `searchWithFallback()` method on SearchEngine with semantic → hybrid → BM25 keyword fallback sequence, `searchKeyword?` interface extension, and `FallbackSearchResult` typed envelope
- search_codebase and search_codebase_hybrid tools now return structured fallback envelope with keyword suggestions when primary search returns zero results
- Maven POM parser with fast-xml-parser extracting coordinates/dependencies into typed ModuleGraph with BFS transitive traversal and SQLite persistence
- ChunkPayload enriched with maven_module coordinates during indexing, get_module_dependencies MCP tool returning BFS dependency graph with interface chunks
- searchByModule adapter wired to SearchEngine with mavenModule.artifactId Qdrant filter, closing the verification gap from 24-02
- One-liner:
- Identity parser extracts LLM-IDENTITY blocks with case-insensitive model comparison; BenchmarkStore schema extended with model_mismatch, identity_missing, and run_integrity columns
- BenchmarkRunner now parses LLM-IDENTITY blocks from rawResponse, flags model mismatches, aborts in strict mode, and computes runIntegrity (full/partial/unknown) after each run
- --strict-model flag and validate-models subcommand added to benchmark CLI, enabling CI enforcement and retroactive model identity auditing

---
