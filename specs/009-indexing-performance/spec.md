# Feature Specification: Indexing Performance — Pipeline Streaming & Enrichment Optimization

**Feature Branch**: `009-indexing-performance`

**Created**: 2026-06-09

**Updated**: 2026-06-10

**Status**: In Progress

**Input**: User description: "Gain performance during indexing — embedding and enrichment is taking too long. With 32K+ chunks, enrichment takes ~54 minutes at default settings. Filter non-code files from LLM enrichment and increase concurrency."

## Clarifications

### Session 2026-06-09

- Q: Should this spec also fix the batch-grouping bug (cap `_top_level` groups to BATCH_SIZE sub-batches), or is filtering + concurrency sufficient? → A: Include batch-cap fix — sub-batch `_top_level` groups into chunks of 10 to eliminate the root cause of oversized batches.

### Session 2026-06-10

- Q: Should we add a persistent enrichment cache (SQLite-backed) to avoid re-enriching unchanged chunks? → A: No — keep it atomic. Always re-read and re-process files. Too many corner cases with caching (model changes, content changes, interrupted writes).
- Q: Should we add pipeline streaming to overlap enrichment and embedding? → A: Yes — significant wall-clock reduction since embedding can start while enrichment continues.
- Q: Should enrichment be skippable per-stereotype (e.g., test files, DTOs)? → A: Yes — test files, DTOs, config blocks can skip enrichment. They get embeddings from code content only.
- Q: Target hardware? → A: Apple Silicon 16GB. Concurrency defaults must be safe for this configuration.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Non-code files excluded from LLM enrichment (Priority: P1)

As a developer indexing a large multi-module Java project, I want config/build files (pom.xml, YAML, SQL migrations, proto definitions) to skip LLM enrichment — so that enrichment time is reduced by 20-40% without affecting code search quality.

**Why this priority**: Non-code files produce chunk types (config-block, migration, service-def, message-def) that don't benefit from natural language descriptions. They also cause parse failures (as seen with pom.xml) due to LLM confusion on XML content. This is both a correctness fix (eliminates "Failed to parse Ollama response" errors) and a performance win.

**Independent Test**: Run `ia-framework index` on a project with pom.xml, YAML, and SQL files. Verify those chunks are indexed (AST metadata present) but have no `enrichedAt`/`enrichmentModel` fields. Verify Java/TS chunks still receive enrichment.

**Acceptance Scenarios**:

1. **Given** a project with 100 Java files, 20 pom.xml files, 10 YAML configs, and 5 SQL migrations, **When** indexing runs with enrichment enabled, **Then** only Java file chunks are sent to Ollama for enrichment; pom.xml, YAML, and SQL chunks are passed through without enrichment.
2. **Given** `enrichment.excludeLanguages` is set to `["xml", "yaml"]` in project.json, **When** indexing runs, **Then** only xml and yaml chunks are excluded; SQL and proto chunks are still enriched.
3. **Given** `enrichment.excludeLanguages` is NOT set in project.json, **When** indexing runs, **Then** the default exclusion list `["xml", "yaml", "sql", "proto"]` is applied.
4. **Given** an excluded chunk (e.g., pom.xml), **When** indexing completes, **Then** the chunk is still present in Qdrant with AST metadata (stereotype, archLayer, imports) and embeddings, but without enrichment fields (description, businessContext, semanticTags).

---

### User Story 2 - Higher concurrency and reduced context window (Priority: P2)

As a developer with local GPU resources (Apple Silicon 16GB), I want optimized defaults for concurrency and context window — so that enrichment and embedding wall-clock time is reduced by 40-60% without manual tuning.

**Why this priority**: Default concurrency (3) and context window (32768) under-utilize Apple Silicon GPUs while over-allocating KV cache memory. Better defaults reduce per-call latency and increase throughput.

**Independent Test**: Run indexing with new defaults (enrichment concurrency: 5, embedding concurrency: 6, numCtx: 16384). Verify wall-clock time decreases vs previous defaults.

**Acceptance Scenarios**:

1. **Given** default `enrichment.concurrency` is 5 (was 3), **When** enrichment runs, **Then** up to 5 Ollama generation calls execute concurrently (observable via p-queue behavior).
2. **Given** default `embeddingConcurrency` is 6 for Ollama (was 3), **When** embedding runs, **Then** up to 6 embedding batches are processed concurrently.
3. **Given** default `enrichment.numCtx` is 16384 (was 32768), **When** Ollama is called for enrichment, **Then** the request includes `num_ctx: 16384` (reducing per-call latency by halving KV cache allocation).
4. **Given** concurrency exceeds what the GPU can handle, **When** indexing runs, **Then** the system does not crash — Ollama queues excess requests internally and throughput plateaus gracefully.
5. **Given** `enrichment.concurrency` > 3 in the resolved config, **When** the CLI starts indexing, **Then** a warning is logged reminding the user to set `OLLAMA_NUM_PARALLEL` >= the configured concurrency value.

---

### User Story 3 - Batch-grouping cap prevents oversized Ollama calls (Priority: P1)

As a developer indexing a large project, I want the enricher to never send more than 10 chunks in a single Ollama call — so that the LLM produces valid JSON responses and does not fail due to oversized prompts.

**Why this priority**: The root cause of the original "Failed to parse Ollama response" error is that `groupByClass()` accumulates all parentless chunks into a single `_top_level` group (potentially 32K+ chunks). This must be fixed alongside filtering to fully eliminate enrichment failures.

**Independent Test**: Index a project with 500+ top-level functions (no class parent). Verify that each Ollama enrichment call receives at most 10 chunks, and all calls produce valid responses.

**Acceptance Scenarios**:

1. **Given** a project with 200 top-level functions that have no class parent, **When** enrichment runs with the large-file path active, **Then** the `_top_level` group is sub-batched into groups of 10 (producing 20 Ollama calls, not 1 call with 200 chunks).
2. **Given** a class group that contains 25 methods, **When** enrichment runs, **Then** that class group is also sub-batched into groups of 10 (3 Ollama calls: 10 + 10 + 5).
3. **Given** any batch group exceeding BATCH_SIZE, **When** enrichment processes it, **Then** no single Ollama call receives more than 10 chunks regardless of grouping strategy.

---

### User Story 4 - Pipeline streaming overlaps enrichment and embedding (Priority: P1)

As a developer indexing a large codebase, I want enrichment and embedding to run concurrently (producer-consumer pattern) — so that total indexing wall-clock time is reduced by 30-40% compared to sequential processing.

**Why this priority**: The current pipeline processes ALL enrichment before ANY embedding starts. For 32K chunks this means ~20 min of pure enrichment followed by ~10 min of pure embedding. Overlapping them reduces total time to ~max(enrichment, embedding) + overhead ≈ 22 min → ~15 min.

**Independent Test**: Run indexing and observe that embedding batches start appearing in progress output while enrichment is still in progress (both stages active simultaneously).

**Acceptance Scenarios**:

1. **Given** a project with 32K chunks where 22K are enrichable, **When** indexing runs, **Then** the first embedding batch starts within 30 seconds of the first enrichment batch completing (not after all enrichment finishes).
2. **Given** chunks excluded from enrichment (skipped by language/stereotype), **When** indexing runs, **Then** those skipped chunks are queued for embedding immediately (no waiting for enrichment of other chunks).
3. **Given** enrichment produces chunks faster than embedding can consume them, **When** the accumulator buffer exceeds `embeddingBatchSize` (50), **Then** embedding batches are triggered automatically via `flushToEmbedding()`.
4. **Given** enrichment finishes with < `embeddingBatchSize` chunks remaining in the accumulator, **When** the enrichment queue becomes idle, **Then** the remaining chunks are flushed to embedding as a final partial batch.
5. **Given** embedding encounters a failure for one batch, **When** retry is exhausted, **Then** that batch is skipped but other batches continue processing (no pipeline stall).
6. **Given** the user cancels indexing (abort signal), **When** both queues are active, **Then** both enrichment and embedding queues are cleared and the pipeline exits gracefully.

---

### User Story 5 - Stereotype-based enrichment filtering (Priority: P2)

As a developer indexing a large project, I want test files, DTOs, config blocks, and migrations to automatically skip LLM enrichment — so that only high-value code chunks consume GPU time for enrichment.

**Why this priority**: Test files, DTOs, and config blocks produce chunk types that don't benefit meaningfully from LLM-generated descriptions. Their code content and AST metadata (name, imports, annotations, stereotype) provide sufficient retrieval signal. Skipping them reduces enrichable chunk count by 15-25%.

**Independent Test**: Index a project with test files, DTO classes, and migration scripts. Verify those chunks have no `enrichedAt` field but are still searchable via signature/sparse vectors.

**Acceptance Scenarios**:

1. **Given** a project with test files (stereotype: 'test'), **When** indexing runs with default `excludeStereotypes`, **Then** test chunks skip enrichment but retain AST metadata and embeddings.
2. **Given** `enrichment.excludeStereotypes` is set to `["test", "dto"]` in project.json, **When** indexing runs, **Then** only test and dto chunks are excluded; config-block and migration chunks are still enriched.
3. **Given** `enrichment.excludeStereotypes` is set to an empty array `[]`, **When** indexing runs, **Then** all stereotypes are enriched (explicit override of defaults).
4. **Given** `enrichment.excludeStereotypes` is NOT set in project.json, **When** indexing runs, **Then** the default exclusion list `["test", "dto", "config-block", "migration"]` is applied.
5. **Given** a chunk with no stereotype assigned, **When** filtering runs, **Then** the chunk is enriched (only explicitly listed stereotypes are excluded).

---

### Edge Cases

- What happens when `excludeLanguages` contains a language identifier that doesn't match any indexed file (e.g., typo like "xmll")? → Silently ignored; no error.
- What happens when ALL chunks in a project are excluded from enrichment (e.g., a YAML-only repo)? → Enrichment stage completes instantly with 0 batches; all chunks indexed without enrichment. Skipped chunks flow directly to embedding.
- What happens when concurrency is set to 1 (effectively serial)? → Works correctly, just slower.
- What happens when a file has an unknown extension (fallback language) — is it enriched or excluded? → Enriched by default (only explicitly listed languages in `excludeLanguages` are excluded).
- What happens when `excludeLanguages` is set to an empty array `[]`? → Overrides default; all chunks are enriched.
- What happens when a class group from `groupByClass` exceeds BATCH_SIZE? → Sub-batched into chunks of 10 before sending to Ollama.
- What happens when `excludeStereotypes` contains a stereotype that doesn't exist (e.g., typo)? → Silently ignored; no error.
- What happens when ALL chunks are excluded by stereotype AND language? → Enrichment completes with 0 batches; all chunks go directly to embedding.
- What happens when enrichment is producing chunks faster than embedding can process? → Accumulator buffer grows unboundedly in memory; embedding catches up when enrichment finishes. Not a concern for typical 32K chunk projects (buffer holds enrichment metadata only, not full file content).
- What happens when embedding fails for a batch during streaming? → That batch is skipped (existing retry logic applies); pipeline continues with remaining batches. No cascading failure.
- What happens when the user cancels (Ctrl+C) during streaming pipeline? → Both p-queues are cleared, pipeline exits. Already-upserted chunks remain in Qdrant (idempotent on next run).
- What happens with progress reporting during streaming? → Enrichment progress and embedding progress are tracked independently. The CLI shows whichever stage is currently active or both if overlapping.

## Decisions

### D-001: No Persistent Enrichment Cache

A persistent cache (SQLite-backed, keyed by content hash) was considered and rejected. Rationale:

- Adds corner cases: model changes, content changes, interrupted writes, schema versioning
- The pipeline should be atomic — always re-read and re-process files for predictability
- Performance gains from other optimizations (streaming + filtering + concurrency) are sufficient
- Incremental indexing (git-based) already handles the "skip unchanged files" use case at the file level

### D-002: Sequential Pipeline (Streaming Reverted)

The enrichment→embedding flow remains **sequential** (enrich all → embed all). Streaming (producer-consumer overlap) was attempted but reverted due to Ollama instability:

- Ollama cannot reliably hold both the generate model (qwen3:8b) and embed model (nomic-embed-text) in memory simultaneously on 16GB Apple Silicon
- Concurrent `/api/generate` + `/api/embed` requests cause `llama-server` process crashes
- The streaming architecture's theoretical 30-40% wall-clock reduction is not achievable with a single Ollama instance on 16GB

**Remaining optimizations still provide significant improvement**:

- Stereotype + language filtering reduces enrichable chunks by ~23%
- Higher enrichment concurrency (5) and reduced numCtx (16384) cut per-call latency by ~40%
- Higher embedding concurrency (6) doubles embedding throughput
- Combined: ~50-60% total time reduction (sequential)

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST support an `excludeLanguages` field in `EnrichmentConfig` that accepts a list of language identifiers to skip from LLM enrichment.
- **FR-002**: When `excludeLanguages` is not configured, the system MUST apply a default exclusion list of `["xml", "yaml", "sql", "proto"]`.
- **FR-003**: Excluded chunks MUST still be indexed (parsed, classified, embedded, and stored in Qdrant) with all AST-derived metadata — only LLM enrichment is skipped.
- **FR-004**: The `concurrency` field in `EnrichmentConfig` MUST control the maximum number of parallel Ollama generation calls via the existing p-queue mechanism. Default MUST be 5 (was 3).
- **FR-005**: The `embeddingConcurrency` field in `IndexingConfig` MUST control the maximum number of parallel embedding batch operations. Default for Ollama MUST be 6 (was 3).
- **FR-006**: The `numCtx` field in `EnrichmentConfig` MUST be passed to Ollama API calls as the context window size parameter. Default MUST be 16384 (was 32768).
- **FR-007**: Progress reporting MUST correctly reflect the filtered chunk count (only enrichable chunks) for the enrichment stage, not total chunks.
- **FR-008**: When `excludeLanguages` is set to an empty array `[]`, system MUST enrich all chunks (explicit override of defaults).
- **FR-009**: The `groupByClass()` method in the enricher MUST sub-batch any group exceeding BATCH_SIZE (10) into multiple sub-batches of at most 10 chunks each, preventing oversized Ollama calls.
- **FR-010**: No single Ollama enrichment call SHALL receive more than 10 chunks regardless of the grouping strategy (large-file or standard).
- **FR-011**: The pipeline MUST implement a streaming (producer-consumer) pattern where enrichment and embedding run concurrently — enriched chunks flow to embedding as they complete, without waiting for all enrichment to finish.
- **FR-012**: Chunks excluded from enrichment (by language or stereotype) MUST be queued for embedding immediately, without waiting for enrichment of other chunks.
- **FR-013**: System MUST support an `excludeStereotypes` field in `EnrichmentConfig` that accepts a list of chunk stereotypes to skip from LLM enrichment.
- **FR-014**: When `excludeStereotypes` is not configured, the system MUST apply a default exclusion list of `["test", "dto", "config-block", "migration"]`.
- **FR-015**: When `enrichment.concurrency` > 3, the CLI MUST log a warning reminding the user to set `OLLAMA_NUM_PARALLEL` >= the configured concurrency value.
- **FR-016**: The streaming pipeline MUST flush remaining accumulated chunks to embedding when enrichment completes (final partial batch).
- **FR-017**: The streaming pipeline MUST respect the abort signal — clearing both enrichment and embedding queues on cancellation.

### Non-Functional Requirements

- **NFR-001**: No persistent enrichment cache. The pipeline is atomic — always re-processes all files from scratch (aside from incremental git-based file filtering).
- **NFR-002**: Memory usage during streaming MUST NOT exceed the current sequential pipeline's peak usage (accumulator holds enrichment metadata only, not full file content).
- **NFR-003**: The pipeline MUST be safe for Apple Silicon with 16GB unified memory at default concurrency settings.

### Key Entities

- **EnrichmentConfig** (`packages/core/src/types/index.ts`): Extended with `excludeLanguages?: string[]` and `excludeStereotypes?: string[]` fields. Affects filtering logic in the pipeline. Default `numCtx` changed to 16384, default `concurrency` changed to 5.
- **IndexingConfig** (`packages/core/src/types/index.ts`): Default `embeddingConcurrency` for Ollama changed from 3 to 6.
- **project.json** (`.ia-framework/project.json`): User-facing configuration where concurrency and exclusion values are set.
- **pipeline.ts** (`packages/indexer/src/pipeline.ts`): The orchestrator that implements the streaming producer-consumer pattern — enrichment produces chunks, embedding consumes them concurrently.
- **enricher.ts** (`packages/indexer/src/enrichment/enricher.ts`): Contains `groupByClass()` and batch formation logic that must enforce the BATCH_SIZE cap on all groups.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Total indexing time for a 32K-chunk Java project drops from ~54 minutes to ≤18 minutes (combined streaming + filtering + concurrency improvements).
- **SC-002**: Zero Ollama parse failures for any file type — both excluded files (no longer sent) and large code groups (now capped at 10 per call).
- **SC-003**: No regression in search quality for code queries — Java/TS results remain unchanged in relevance and ranking.
- **SC-004**: All existing tests pass after changes (`pnpm test` exits 0).
- **SC-005**: Excluded chunks are still searchable via signature/sparse vectors and AST metadata filters (stereotype, archLayer, module).
- **SC-006**: No single Ollama enrichment call receives more than 10 chunks (verifiable via unit test on batch formation).
- **SC-007**: Embedding batches begin processing before enrichment completes (observable in progress output — both stages active simultaneously).
- **SC-008**: Memory usage during indexing does not increase vs the sequential pipeline (streaming accumulator holds metadata only).

## Assumptions

- Ollama server can handle 5 concurrent generation requests + 6 concurrent embed requests without OOM on Apple Silicon with 16GB unified memory (embed requests don't allocate KV cache).
- Non-code files (XML, YAML, SQL, proto) and low-value stereotypes (test, dto, config-block, migration) derive sufficient search value from AST metadata + sparse/signature embeddings alone — LLM descriptions add negligible retrieval benefit for these chunk types.
- The `language` field on `CodeChunk` is reliably set by the parser layer for all file types (verified: set via `LANGUAGE_MAP` in `chunker.ts`).
- The `stereotype` field on `CodeChunk` is reliably set by the `classify()` function during parsing (verified: assigned in pipeline.ts lines 469-477).
- Reducing `numCtx` from 32768 to 16384 does not degrade enrichment quality for batches of ≤10 chunks (typical batch content fits within 8K-12K tokens).
- The existing `p-queue` concurrency mechanism in both `enricher.ts` and `pipeline.ts` correctly enforces the configured concurrency limit.
- Sub-batching class groups into chunks of 10 does not lose important cross-method context because the enrichment prompt already operates on individual chunk descriptions independently.
- Ollama's `/api/embed` endpoint is lightweight enough to run concurrently with `/api/generate` without causing memory pressure — embed does not allocate generation KV cache.
- The user starts Ollama with `OLLAMA_NUM_PARALLEL >= 5` for optimal performance. The CLI warns if this may not be the case.
- No persistent enrichment cache is needed — the combination of streaming, filtering, and concurrency provides sufficient performance improvement. Incremental git-based indexing handles the "skip unchanged files" case at the file level.
