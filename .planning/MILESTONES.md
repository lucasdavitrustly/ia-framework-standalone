# Milestones

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
