# Tasks: AST + LLM RAG Optimization

**Input**: Design documents from `/specs/008-ast-llm-rag-optimization/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Included (TDD mandated by constitution — tests written before implementation)

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization, shared types, and dependency installation

- [x] T001 Install tree-sitter-yaml and tree-sitter-xml dependencies in packages/ast-parser/package.json
- [x] T002 [P] Define shared types (ChunkPayload, ChunkType, Stereotype, ArchLayer, ModuleInfo, MavenCoordinates, RelationshipTag, DependencyEdge) in packages/core/src/types/index.ts
- [x] T003 [P] Update VectorPoint interface (3 named vectors: semantic, signature, sparse) and new ChunkPayload (no content field) in packages/vector-store/src/interface.ts
- [x] T004 [P] Extend CodeChunk type with new fields (annotations, visibility, defines, calls, contextHeader, classSignature, stereotype, archLayer, moduleInfo) in packages/ast-parser/src/types.ts
- [x] T005 [P] Add enrichment config schema (EnrichmentConfig with provider, model, baseUrl, numCtx, concurrency, retryAttempts, skipOnFailure) in packages/core/src/config/

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before user story implementation

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T006 Update Qdrant collection initialization to support 3 named vectors (semantic: 768d Cosine, signature: 768d Cosine) + sparse vector (modifier: idf) with payload indexes (stereotype, archLayer, moduleInfo.module, language, repoId, relativePath) in packages/vector-store/src/qdrant.ts
- [x] T007 Implement old-schema detection (check for 'text'/'code' vector names) and migration prompt logic in packages/vector-store/src/qdrant.ts
- [x] T008 [P] Remove ChunkingStrategy interface and strategy dispatch from packages/indexer/src/strategies/types.ts
- [x] T009 [P] Delete packages/indexer/src/strategies/llm-strategy.ts, packages/indexer/src/strategies/llm-chunker.ts, packages/indexer/src/strategies/prompt.ts, packages/indexer/src/strategies/prompt-examples.ts
- [x] T010 [P] Delete packages/indexer/src/chunk-description.ts
- [x] T011 Remove --strategy CLI flag from packages/cli/src/commands/ (index command)
- [x] T012 Add --skip-enrichment CLI flag to index command in packages/cli/src/commands/

**Checkpoint**: Foundation ready — vector store supports new schema, old code removed, CLI updated

---

## Phase 3: User Story 1 — Enriched Chunk Indexing with LLM Metadata (Priority: P1) 🎯 MVP

**Goal**: AST-parsed chunks enriched with LLM-generated metadata (description, businessContext, semanticTags, relationships) via Ollama, stored as lean payloads in Qdrant (no raw code).

**Independent Test**: Index a sample repository and verify chunks contain LLM-generated metadata fields and that raw code is NOT stored in Qdrant.

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T013 [P] [US1] Test for stereotype classifier: given Java class with @Service annotation, returns stereotype 'service' and archLayer 'service' in packages/ast-parser/src/classifier.test.ts
- [x] T014 [P] [US1] Test for module resolver: given path with pom.xml, returns correct moduleInfo and mavenCoordinates in packages/ast-parser/src/module-resolver.test.ts
- [x] T015 [P] [US1] Test for LLM enricher: given chunks + mock Ollama response, returns enriched metadata (description, businessContext, semanticTags, relationships) in packages/indexer/src/enrichment/enricher.test.ts
- [x] T016 [P] [US1] Test for enrichment cache: given same contentHash, skips LLM call and returns cached result in packages/indexer/src/enrichment/cache.test.ts
- [x] T017 [P] [US1] Test for graceful degradation: given Ollama unavailable, enricher returns chunks without LLM fields and logs warning in packages/indexer/src/enrichment/enricher.test.ts
- [x] T018 [P] [US1] Test for 3-vector embedder: given enriched chunk, produces semantic vector (from description+businessContext+tags), signature vector (from signature+contextHeader), and sparse vector (from name+imports+annotations) in packages/indexer/src/embedder.test.ts
- [x] T019 [P] [US1] Test for unified pipeline: given a Java file, runs AST parse → classify → enrich → embed → returns VectorPoints with no raw code in payload in packages/indexer/src/pipeline.test.ts
- [x] T020 [P] [US1] Test for contextHeader generation: given a class with methods, each method chunk includes contextHeader (class name + fields, max 5 lines) in packages/ast-parser/src/chunker.test.ts
- [x] T021 [P] [US1] Test for class-signature chunk: given a class, produces a class-signature chunk (declaration + fields + method signatures, no bodies) in packages/ast-parser/src/chunker.test.ts

### Implementation for User Story 1

- [x] T022 [P] [US1] Implement stereotype classifier with positive-evidence heuristics (Spring, Guice, JavaLite, JDBC, Flyway, naming conventions) in packages/ast-parser/src/classifier.ts
- [x] T023 [P] [US1] Implement module resolver (walk up directory tree for pom.xml, extract moduleInfo from path segments, parse Maven coordinates) in packages/ast-parser/src/module-resolver.ts
- [x] T024 [US1] Enhance Java parser to extract annotations array, visibility, and pass to classifier in packages/ast-parser/src/parsers/java.ts
- [x] T025 [US1] Enhance AST chunker to generate class-signature chunks and contextHeader for method chunks in packages/ast-parser/src/chunker.ts
- [x] T026 [P] [US1] Implement enrichment prompt template (file-level: chunk boundaries marked, structured JSON response format for description/businessContext/semanticTags/relationships) in packages/indexer/src/enrichment/prompt.ts
- [x] T027 [US1] Implement LLM enricher with Ollama integration (batching max 10 methods, concurrency from config, retry logic, graceful degradation) in packages/indexer/src/enrichment/enricher.ts
- [x] T028 [P] [US1] Adapt enrichment cache from existing llm-cache.ts (keyed by contentHash, skip LLM for unchanged content) in packages/indexer/src/enrichment/cache.ts
- [x] T029 [US1] Implement 3-vector embedder (semantic from description+businessContext+semanticTags, signature from signature+contextHeader, sparse from name+defines+imports+annotations tokenized by camelCase/dots/underscores) in packages/indexer/src/embedder.ts
- [x] T030 [US1] Implement unified pipeline orchestrator (file discovery → incremental check → AST parse → classify → enrich → embed → upsert) replacing strategy dispatch in packages/indexer/src/pipeline.ts
- [x] T031 [US1] Update Qdrant upsert to use new VectorPoint format (3 named vectors, lean payload without content field) in packages/vector-store/src/qdrant.ts
- [x] T032 [US1] Implement large file strategy (group by class using AST metadata, send class signature + imports + method bodies per group when file exceeds 70% of context window) in packages/indexer/src/enrichment/enricher.ts
- [x] T033 [US1] Wire unified pipeline into CLI index command (replace old strategy-based dispatch) in packages/cli/src/commands/

**Checkpoint**: Indexing produces LLM-enriched chunks with 3 vectors, no raw code in Qdrant. Graceful degradation works.

---

## Phase 4: User Story 2 — Improved Dependency Graph (Priority: P2)

**Goal**: Build comprehensive dependency graph during indexing from imports, exports, service references, and config bindings. Store as dependencyEdges on chunk metadata.

**Independent Test**: Index a multi-file project and verify cross-file relationships (imports, service bindings) are captured in dependencyEdges.

### Tests for User Story 2

- [x] T034 [P] [US2] Test for dependency edge extraction: given Java file importing 3 modules, produces 3 DependencyEdge entries with relation 'imports' in packages/ast-parser/src/parsers/java.test.ts
- [x] T035 [P] [US2] Test for dependency graph expansion: given a search result with dependencyEdges, expand_hops=1 returns direct dependencies in packages/retrieval/src/dependency-graph.test.ts
- [x] T036 [P] [US2] Test for YAML config references: given YAML referencing service classes, produces dependencyEdges with relation 'configures' in packages/ast-parser/src/parsers/yaml.test.ts (placeholder until US4 parser exists)

### Implementation for User Story 2

- [x] T037 [US2] Enhance Java parser to extract full DependencyEdge data (import paths → targetPath, relation 'imports', symbols extracted) in packages/ast-parser/src/parsers/java.ts
- [x] T038 [US2] Enhance TypeScript parser to extract DependencyEdge data (import/export relationships) in packages/ast-parser/src/parsers/typescript.ts
- [x] T039 [US2] Update dependency graph module to traverse indexed edges from Qdrant payload (query by relativePath filter, follow dependencyEdges) in packages/retrieval/src/dependency-graph.ts
- [x] T040 [US2] Integrate graph expansion into search pipeline (after RRF fusion, expand top-K results along dependencyEdges up to expand_hops depth) in packages/retrieval/src/search-engine.ts

**Checkpoint**: Dependency edges stored per chunk, graph expansion works during retrieval.

---

## Phase 5: User Story 3 — Better Chunk Boundaries via AST (Priority: P2)

**Goal**: AST-enforced chunk boundaries that never split mid-function/class/block. Each method chunk includes contextHeader for disambiguation.

**Independent Test**: Index files with complex nesting and verify no chunk splits a function/class/block mid-definition.

### Tests for User Story 3

- [x] T041 [P] [US3] Test for Java class chunking: given 200-line class with 8 methods, each method is its own chunk with contextHeader preserved, class-signature chunk created in packages/ast-parser/src/parsers/java.test.ts
- [x] T042 [P] [US3] Test for no mid-split: given a large method exceeding maxChunkLines, chunk is NOT split mid-body (kept whole or split at logical block boundaries) in packages/ast-parser/src/chunker.test.ts

### Implementation for User Story 3

- [x] T043 [US3] Refine Java parser to guarantee no mid-method splits — methods always chunked whole regardless of size (override maxChunkLines for semantic integrity) in packages/ast-parser/src/parsers/java.ts
- [x] T044 [US3] Ensure chunker respects leading comments, decorators, and type annotations as part of the chunk boundary (never orphaned from their target) in packages/ast-parser/src/chunker.ts

**Checkpoint**: All chunks respect semantic boundaries. No partial functions/classes in output.

---

## Phase 6: User Story 4 — Extended Language Support (Priority: P3)

**Goal**: AST chunker supports .proto, .yaml/.yml, .xml, and .sql files with appropriate boundary logic.

**Independent Test**: Index a project with .proto, .yaml, .xml, .sql files and verify chunks are created with correct boundaries and metadata.

### Tests for User Story 4

- [x] T045 [P] [US4] Test for proto chunker: given .proto with service + message + enum definitions, produces separate chunks per construct (service-def, message-def, enum) in packages/ast-parser/src/parsers/proto.test.ts
- [x] T046 [P] [US4] Test for YAML chunker: given .yaml with multiple top-level service definitions, each definition is a separate chunk (config-block) in packages/ast-parser/src/parsers/yaml.test.ts
- [x] T047 [P] [US4] Test for XML chunker: given Spring config XML with bean definitions, each major element (bean, import) is a chunk in packages/ast-parser/src/parsers/xml.test.ts
- [x] T048 [P] [US4] Test for SQL chunker: given Flyway migration file (V*\_\_*.sql), entire file is one chunk with chunkType 'migration' in packages/ast-parser/src/parsers/sql.test.ts

### Implementation for User Story 4

- [x] T049 [P] [US4] Implement proto chunker (regex-based: split on message/service/enum keywords, include associated comments) in packages/ast-parser/src/parsers/proto.ts
- [x] T050 [P] [US4] Implement YAML chunker (tree-sitter-yaml: top-level keys as chunk boundaries, nested config preserved) in packages/ast-parser/src/parsers/yaml.ts
- [x] T051 [P] [US4] Implement XML chunker (tree-sitter-xml: beans/dependencies/plugins as chunk boundaries) in packages/ast-parser/src/parsers/xml.ts
- [x] T052 [P] [US4] Implement SQL chunker (statement-based: each migration file = one chunk, chunkType 'migration') in packages/ast-parser/src/parsers/sql.ts
- [x] T053 [US4] Register new parsers in chunker dispatch (route by file extension to appropriate parser) in packages/ast-parser/src/chunker.ts
- [x] T054 [US4] Update supportedExtensions in pipeline config validation to include .proto, .yaml, .yml, .xml, .sql in packages/indexer/src/pipeline.ts

**Checkpoint**: All 6 language families produce semantically valid chunks.

---

## Phase 7: User Story 5 — Improved Retrieval Precision and Recall (Priority: P3)

**Goal**: Unified search with query classification, multi-vector search, RRF fusion, graph expansion, BM25 rerank, and MMR diversity.

**Independent Test**: Run benchmark suite and compare precision@5 / recall@10 against baseline.

### Tests for User Story 5

- [x] T055 [P] [US5] Test for query classifier: given "payment retry logic" returns 'semantic', given "PaymentService.processPayment" returns 'symbol', given "FiGatewayClient" returns 'keyword' in packages/retrieval/src/query-classifier.test.ts
- [x] T056 [P] [US5] Test for unified search pipeline: given a semantic query, routes to semantic vector only; given mixed query, routes to all 3 vectors in packages/retrieval/src/search-engine.test.ts
- [x] T057 [P] [US5] Test for MCP search_codebase tool: given metadata filters (stereotype, archLayer, module), applies Qdrant payload filters correctly in packages/mcp-server/src/tools/search-codebase.test.ts
- [x] T058 [P] [US5] Test for filesystem read at retrieval: given search result with relativePath + startLine:endLine, returns live code content in packages/mcp-server/src/tools/search-codebase.test.ts
- [x] T059 [P] [US5] Test for token budget: top-5 results include content (max 2000 tokens each), results 6-10 are metadata-only in packages/mcp-server/src/tools/search-codebase.test.ts

### Implementation for User Story 5

- [x] T060 [US5] Implement query classifier (heuristic: CamelCase/dots → symbol, natural language → semantic, mixed → all, single uppercase token → keyword) in packages/retrieval/src/query-classifier.ts
- [x] T061 [US5] Implement unified search pipeline (classify → multi-vector search → RRF fusion → graph expansion → BM25 rerank → MMR diversity) in packages/retrieval/src/search-engine.ts
- [x] T062 [US5] Update search_codebase MCP tool: add metadata filter params (stereotype, archLayer, module, language), remove use_template, add filesystem read for top-5 results, token budget in packages/mcp-server/src/tools/search-codebase.ts
- [x] T063 [US5] Update get_file MCP tool: filesystem read primary, semantic search fallback, return indexed chunk metadata in packages/mcp-server/src/tools/get-file.ts
- [x] T064 [US5] Update get_dependencies MCP tool: merge file-level + module-level, support path OR module param, BFS traversal for module queries in packages/mcp-server/src/tools/get-dependencies.ts
- [x] T065 [US5] Delete packages/mcp-server/src/tools/search-codebase-hybrid.ts and remove from server registration
- [x] T066 [US5] Delete packages/mcp-server/src/tools/get-module-dependencies.ts and remove from server registration
- [x] T067 [US5] Convert benchmark-preflight to internal health check (lazy on first search, log failures to dashboard) — delete packages/mcp-server/src/tools/benchmark-preflight.ts, add health check to search-engine.ts
- [x] T068 [US5] Implement zero-result fallback (glob for path-like queries, grep for identifiers when Qdrant returns empty) in packages/retrieval/src/search-engine.ts
- [x] T069 [US5] Implement contentHash drift detection at retrieval time (compare stored hash vs current file hash, flag stale results) in packages/mcp-server/src/tools/search-codebase.ts

**Checkpoint**: Unified search with auto-classification, 3 MCP tools, benchmark validation.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Configuration, installation, documentation, and final validation

- [x] T070 [P] Update install.sh to prompt for enrichment model (default: qwen3:8b) and auto-pull from Ollama
- [x] T071 [P] Update project.json schema: add enrichment block, remove strategy field, remove indexing.llm
- [x] T072 [P] Update agent injection template (ia-framework agents inject) with new 3-tool documentation in packages/cli/src/commands/agents.command.ts
- [x] T073 [P] Update MCP server tool registration (remove deleted tools, update descriptions) in packages/mcp-server/src/server.ts
- [x] T074 Run full test suite (pnpm test) and fix any failures
- [x] T075 Run pnpm build and fix any type errors
- [x] T076 Run benchmark suite to validate precision@5 and recall@10 improvements
- [x] T077 Validate quickstart.md flow end-to-end (fresh index → search → verify results)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 (types must exist first) — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Phase 2 — core MVP
- **US2 (Phase 4)**: Depends on Phase 2 + partially on US1 (pipeline must exist for edge storage)
- **US3 (Phase 5)**: Depends on Phase 2 — can run parallel to US1/US2
- **US4 (Phase 6)**: Depends on Phase 2 — can run parallel to US1/US2/US3
- **US5 (Phase 7)**: Depends on US1 (pipeline + vectors must exist for retrieval to query them)
- **Polish (Phase 8)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (P1)**: Foundational only — no other story dependencies. **This is the MVP.**
- **US2 (P2)**: Foundational + US1 pipeline (needs pipeline to store edges during indexing)
- **US3 (P2)**: Foundational only — purely ast-parser changes, independent of US1
- **US4 (P3)**: Foundational only — purely new parsers, independent of US1
- **US5 (P3)**: Depends on US1 (needs 3-vector Qdrant data to search against)

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Types/interfaces before implementations
- Parser changes before pipeline changes
- Pipeline before MCP tool changes

### Parallel Opportunities

- T002, T003, T004, T005 in Phase 1 (all different files)
- T008, T009, T010 in Phase 2 (independent deletions)
- All US1 tests (T013-T021) can run in parallel
- T022, T023, T026, T028 in US1 (different files)
- All US4 parsers (T049-T052) can run in parallel
- US3 and US4 can run in parallel with US1 (different packages)

---

## Parallel Example: User Story 1

```bash
# Launch all tests for US1 together (TDD - write first, verify they fail):
Task: "Test for stereotype classifier in packages/ast-parser/src/classifier.test.ts"
Task: "Test for module resolver in packages/ast-parser/src/module-resolver.test.ts"
Task: "Test for LLM enricher in packages/indexer/src/enrichment/enricher.test.ts"
Task: "Test for 3-vector embedder in packages/indexer/src/embedder.test.ts"

# Launch parallel implementations (different files):
Task: "Implement stereotype classifier in packages/ast-parser/src/classifier.ts"
Task: "Implement module resolver in packages/ast-parser/src/module-resolver.ts"
Task: "Implement enrichment prompt in packages/indexer/src/enrichment/prompt.ts"
Task: "Adapt enrichment cache in packages/indexer/src/enrichment/cache.ts"
```

## Parallel Example: User Story 4

```bash
# All new parsers are independent files — full parallelism:
Task: "Implement proto chunker in packages/ast-parser/src/parsers/proto.ts"
Task: "Implement YAML chunker in packages/ast-parser/src/parsers/yaml.ts"
Task: "Implement XML chunker in packages/ast-parser/src/parsers/xml.ts"
Task: "Implement SQL chunker in packages/ast-parser/src/parsers/sql.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (types and dependencies)
2. Complete Phase 2: Foundational (Qdrant schema, remove old code, CLI flags)
3. Complete Phase 3: User Story 1 (classifier → enricher → embedder → pipeline)
4. **STOP and VALIDATE**: Index a test repo, verify LLM metadata in Qdrant, verify no raw code stored
5. This alone delivers the core value proposition (enriched metadata for better retrieval)

### Incremental Delivery

1. Setup + Foundational → new Qdrant schema live
2. US1 → enriched indexing works → can already see better semantic search results
3. US3 + US4 (parallel) → better chunk boundaries + more languages → broader coverage
4. US2 → dependency graph → enables graph expansion in retrieval
5. US5 → unified search tool → full end-to-end retrieval improvements
6. Polish → install script, benchmarks, documentation

### Critical Path

```
Phase 1 → Phase 2 → US1 (T030 pipeline) → US5 (T061 unified search) → T076 benchmark
```

This is the minimum path to prove the full value chain: index with enrichment → search with classification.

---

## Phase 9: Pipeline Completeness (Post-MVP Gap-Fill)

**Goal**: Fix all pipeline wiring gaps discovered during live testing against a real Java project.

- [x] T078 Remove `filePath` from `embedBatchAndStore()` payload in `packages/indexer/src/pipeline.ts` — stop writing it to Qdrant. Update `toRetrievalResult()` in `packages/retrieval/src/search-engine.ts` to reconstruct absolute path as `projectRoot + '/' + relativePath` when stored `filePath` is absent. Update `packages/mcp-server/src/tools/search-codebase.ts` and `get-file.ts` `readFileFn` call sites to use `result.filePath ?? (projectRoot + '/' + result.relativePath)`.

- [x] T079 Wire classifier into parsing loop in `packages/indexer/src/pipeline.ts`: after `parseFile()`, call `classify(chunk)` from `packages/ast-parser/src/classifier.ts` on each chunk; set `chunk.stereotype` and `chunk.archLayer`. Copy `stereotype` and `archLayer` to `ChunkPayload` in `embedBatchAndStore()`.

- [x] T080 Wire missing `CodeChunk` fields to `ChunkPayload` in `embedBatchAndStore()` in `packages/indexer/src/pipeline.ts`: add `annotations`, `visibility`, `dependencyEdges`, `contextHeader`, `classSignature`, `moduleInfo` (structured `{group, module, submodule}` block), and `contentHash` (SHA256 of the reloaded content, computed from `contents[j]` before embedding).

- [x] T081 Wire LLM enricher into pipeline in `packages/indexer/src/pipeline.ts`: between the parsing loop and embedding loop (new `enriching` stage), call `LlmEnricher.enrich()` from `packages/indexer/src/enrichment/enricher.ts` on `allChunks` when `enrichmentConfig` is set and `skipEnrichment` is not true. Copy enrichment results (`description`, `businessContext`, `semanticTags`, `relationships`, `enrichedAt`, `enrichmentModel`) to `ChunkPayload` in `embedBatchAndStore()`.

- [x] T082 Add `enriching` to the `stage` union in `IndexingProgress` in `packages/indexer/src/pipeline.ts`. Emit `enriching` progress between the parsing and embedding loops. Update CLI progress renderer in `packages/cli/src/commands/index.command.ts` to show an enriching bar.

**Checkpoint**: Pipeline stores all metadata that the spec defines; no host-path leakage; LLM enricher is reachable from the CLI.

---

## Phase 10: Enrichment Progress Visibility

**Goal**: Make the `enriching` stage show a real progress bar with elapsed time and ETA so operators can track long Ollama runs.

- [x] T083 Add `EnrichmentProgress` interface and optional `onProgress` callback to `LlmEnricher.enrich()` in `packages/indexer/src/enrichment/enricher.ts`. Pre-compute `batchesTotal` upfront; call `onProgress({ batchesCompleted, batchesTotal, currentFile })` after every batch (both successful and failed).

- [x] T084 Wire enrichment progress into `IndexingProgress` in `packages/indexer/src/pipeline.ts`: pass a callback to `enricher.enrich()` that updates `progress.batchesTotal`, `progress.batchesCompleted`, `progress.currentFile` and calls `onProgress`. Reset `batchesTotal`/`batchesCompleted` to `undefined` before transitioning to the embedding stage.

- [x] T085 Replace the static spinner in the CLI enriching renderer (`packages/cli/src/commands/index.command.ts`) with a progress bar showing `X/Y batches`, elapsed time, and ETA: `[████░░] 42%  enriching  130/308 batches  4m32s  ~6m left  FileName.java`.

**Checkpoint**: Running `ia-framework index` with enrichment enabled shows a live progress bar during Ollama calls.

---

---

## Phase 11: Retrieval Correctness — Fix Silent Lean-Payload Bugs (US6)

**Goal**: Fix five silent bugs introduced when migrating to the lean-payload schema (no raw code in Qdrant). Each bug causes a search pipeline component to silently degrade to a no-op, undermining the value of the enriched index.

**Root cause**: Several pipeline components assume `chunk.content` is always populated. In the lean-payload schema `content = ""` — code is read from filesystem at query time. Additionally two places still reference the deprecated `filePath` field the new indexer no longer writes.

### Tests for Phase 11

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T086 [P] [US6] Test that `search()` queries the sparse vector when query type is `keyword` or `mixed`: given a mock `vectorStore.searchKeyword`, a keyword query MUST call it and merge its results — in `packages/retrieval/src/search-engine.test.ts`

- [x] T087 [P] [US6] Test that MMR provides diversity for lean-payload chunks (content = ""): given two chunks with the same score but different `relativePath`/`name`/`defines`, MMR must not select both when lambda < 1.0 — in `packages/retrieval/src/search-engine.test.ts`

- [x] T088 [P] [US6] Test that `bm25Rerank()` produces non-zero scores for lean-payload chunks: given results with `content = ""` but populated `name`/`defines`/`calls`, the reranker MUST produce a non-zero BM25 score for a matching query term — in `packages/retrieval/src/bm25-reranker.test.ts`

- [x] T089 [P] [US6] Test that `searchWithExpansion()` fetches neighbor chunks by `relativePath` (not `filePath`): given a mock SQLite graph returning neighbor paths, the Qdrant filter MUST use `key: 'relativePath'` — in `packages/retrieval/src/search-engine.test.ts`

- [x] T090 [P] [US6] Test that incremental re-index deletes chunks using `relativePath`: given a changed file path returned by git-diff, `deleteByFilter` MUST be called with `{ relativePath: ... }` not `{ filePath: ... }` — in `packages/indexer/src/pipeline.test.ts`

### Implementation for Phase 11

- [x] T091 [US6] Fix sparse vector routing in `search()` in `packages/retrieval/src/search-engine.ts:234`: when `vectorsToSearch` includes `'sparse'`, compute `computeTermFrequencySparseVector(query.text)` and call `vectorStore.searchKeyword()` in parallel with the dense searches; merge results into the max-score dedup map; guard gracefully when `vectorStore.searchKeyword` is undefined.

- [x] T092 [US6] Fix MMR pairSim for lean-payload chunks in `packages/retrieval/src/search-engine.ts`: when calling `mmrRerank()`, pass a custom `similarityFn` that uses `jaccardSimilarity` on `(a.relativePath + ' ' + (a.name ?? '') + ' ' + (a.defines?.join(' ') ?? ''))` as a proxy for content similarity — no change to `mmr.ts` itself (the `similarityFn` option already exists).

- [x] T093 [US6] Fix BM25 reranker for lean-payload chunks in `packages/retrieval/src/bm25-reranker.ts:110`: change `tokenize(r.content)` to fall back to metadata text when `r.content` is empty: `tokenize(r.content || [r.name, r.packageName, ...(r.defines ?? []), ...(r.calls ?? [])].filter(Boolean).join(' '))`.

- [x] T094 [US6] Fix SQLite graph expansion deprecated `filePath` filter in `packages/retrieval/src/search-engine.ts:330,353`: change `baseFilePaths` collection from `r.filePath` to `r.relativePath`; replace call to `this.fetchChunksForFiles(newFiles)` with `this.fetchChunksForRelativePaths(newFiles)` (which already uses `relativePath` correctly); mark `fetchChunksForFiles()` as `@deprecated`.

- [x] T095 [US6] Fix incremental delete deprecated `filePath` filter in `packages/indexer/src/pipeline.ts:373`: change `vectorStore.deleteByFilter({ filePath })` to `vectorStore.deleteByFilter({ relativePath: filePath })` (git-diff paths are already relative to the project root).

**Checkpoint**: All 5 bugs fixed. Benchmark Hit@K and MRR improve for lean-payload collections. No stale chunk accumulation on incremental re-index.

---

## Phase 12: Score Type Transparency — Label Cosine vs RRF in MCP Output (US7)

**Goal**: Add a `scoreType: 'cosine' | 'rrf'` field to `RetrievalResult` and update the MCP `formatResult` display so users can distinguish primary cosine search results (scale 0–1) from hybrid RRF fallback results (scale ~0.01–0.05).

**Root cause**: `RetrievalResult.score` is an untyped `number`. When the hybrid RRF fallback fires, its rank-based scores (~0.02) are displayed identically to cosine scores, causing users to misread valid matches as near-failures.

### Tests for Phase 12

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T096 [P] [US7] Test that `search()` results have `scoreType: 'cosine'`: given a mock vector store returning one result, the returned `RetrievalResult` must have `scoreType === 'cosine'` — in `packages/retrieval/src/search-engine.test.ts`

- [x] T097 [P] [US7] Test that `searchHybrid()` results have `scoreType: 'rrf'`: given a mock `searchHybrid` returning one result, the returned `RetrievalResult` must have `scoreType === 'rrf'` — in `packages/retrieval/src/search-engine.test.ts`

- [x] T098 [P] [US7] Test that `formatResult` renders `rrf: X.XXXX` for RRF results and `score: X.XX` for cosine results — in `packages/mcp-server/src/tools/search-codebase.test.ts`

### Implementation for Phase 12

- [x] T099 [P] [US7] Add `scoreType?: 'cosine' | 'rrf'` field to `RetrievalResult` in `packages/retrieval/src/types.ts` (after the `score` field).

- [x] T100 [US7] Set `scoreType: 'cosine'` in `toRetrievalResult()` in `packages/retrieval/src/search-engine.ts`; set `scoreType: 'rrf'` on results mapped in `searchHybrid()`.

- [x] T101 [US7] Update `formatResult` in `packages/mcp-server/src/tools/search-codebase.ts` (lines 273–275, 595, 671): render `rrf: ${score.toFixed(4)}` when `scoreType === 'rrf'`, keep `score: ${score.toFixed(2)}` otherwise.

**Checkpoint**: MCP output unambiguously labels cosine vs RRF scores. No score interpretation required by users.

---

## Notes

- [P] tasks = different files, no dependencies
- Constitution mandates TDD — all tests written before implementation
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- The old `strategies/` files are deleted in Phase 2 — ensure no lingering imports

---

## Phase 13: Wire Filesystem Read to MCP Tools (US9)

**Goal**: Fix the broken wiring between config loader and MCP tool registrations so that `get_file` and `search_codebase` read live file content from disk using the multi-repo path resolution, enabling the intended 5–8 tool-call pattern.

**Root cause**: `bin.ts` passes `projectRoot: config.targetProjectPath` (always `undefined` with `repos[]` config), `server.ts` never creates `readFileFn` closures, and tool signatures lack the `repoId` parameter needed for multi-repo path resolution.

### Tests for Phase 13

- [x] T102 [P] [US9] Fix broken assertion in `get-file.test.ts:123`: update `toHaveBeenCalledWith('src/auth.ts')` → `toHaveBeenCalledWith('src/auth.ts', undefined)` to match new 2-param `readFileFn` signature

- [x] T103 [P] [US9] Fix broken assertion in `search-codebase.test.ts:717`: update `toHaveBeenCalledWith('src/auth.ts', 10, 20)` → `toHaveBeenCalledWith('src/auth.ts', 10, 20, undefined)` to match new 4-param `readFileFn` signature

- [x] T104 [P] [US9] New test in `get-file.test.ts`: given path `core:src/auth.ts` with `readFileFn`, verify `readFileFn` is called with `('src/auth.ts', 'core')` — confirming repo prefix is forwarded

- [x] T105 [P] [US9] New test in `search-codebase.test.ts`: given a result with `repoId: 'core'`, verify `readFileFn` is called with `('src/auth.ts', 10, 20, 'core')` — confirming repoId is forwarded

### Implementation for Phase 13

- [x] T106 [US9] Update `bin.ts`: import `RepoRegistry` from `@ia-framework/core`, build `resolvedRepos` via `RepoRegistry.fromConfig(config, dirname(configPath))`, pass both `projectRoot: resolvedRepos[0]?.path` and `repos: resolvedRepos` to `createMcpServer`

- [x] T107 [US9] Update `server.ts`: add `repos?: Array<{ name: string; path: string }>` to `McpServerConfig`; import `readFile` from `node:fs/promises` and `join` from `node:path`; build `repoPathMap` from `config.repos`; implement `resolveRoot(repoId?)` helper; create `searchReadFileFn` (line-range slicing) and `getFileReadFileFn` (full-file read) closures; pass to tool registrations via conditional spread

- [x] T108 [US9] Update `get-file.ts`: extend `GetFileOptions.readFileFn` type to `(path: string, repo?: string) => Promise<string>`; forward `repo` from `parseRepoPath` to `readFileFn(filePath, repo)` call; update `registerGetFileTool` to accept and pass `options?: GetFileOptions`

- [x] T109 [US9] Update `search-codebase.ts`: extend `ObservabilityConfig.readFileFn` type to include `repoId?: string` as 4th param; forward `results[i]!.repoId` as 4th arg in the filesystem read loop

**Checkpoint**: Both `get_file` and `search_codebase` read live file content from disk. Multi-repo path resolution works via `repoId`. Single-repo backward compatibility preserved. All 203 tests pass.

---

## Phase 14: Heuristic Semantic Enrichment for Thin Classes (US10)

**Goal**: Improve retrieval precision for "thin" delegation classes (controllers, facades, delegates) by extracting structured annotation values during AST parsing and using them to build semantically rich embedding inputs — even when LLM enrichment is absent or insufficient.

**Root cause**: `buildSemanticInput()` fallback (`packages/indexer/src/embedder.ts:174`) produces weak embeddings for classes dominated by imports and boilerplate. Domain signals like endpoint paths (`@RequestMapping("v1/entries")`), operation summaries (`@Operation(summary = "Create an entry")`), and command references are present in annotation text but never parsed into structured form or surfaced in the embedding input.

**Evidence**: Searching for "createEntry payment flow controller" with `stereotype: controller` returned `PaymentProcessorController` (score 0.69) instead of `EntryController` because:

- The word "payment" never appears in EntryController
- The semantic embedding of raw controller code is too thin to match natural language queries
- Even the exact query `"EntryController"` only scored 0.61 with the controller filter

**Expected impact**: For EntryController, the new `buildSemanticInput()` fallback produces:

```
REST controller EntryController at v1/entries.
Operations: Get an entry by ID, Create an entry, Refund an entry, Retry an entry, Resolve a held entry, Cancel an entry, Collect an entry.
Methods: getEntry, createEntry, refundEntry, getEntryDetail, retryEntry, resumeEntry, cancelEntry, collectEntry.
```

Instead of: `java class EntryController <96 lines of raw imports + boilerplate code>`

### Tests for Phase 14

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T110 [P] [US10] Test for Java parser annotation value extraction: given a class with `@Operation(summary = "Create an entry")`, returns `annotationMeta.operationSummaries = ["Create an entry"]` — in `packages/ast-parser/src/parsers/java.test.ts`

- [x] T111 [P] [US10] Test for Java parser endpoint path extraction: given a class with `@RequestMapping("v1/entries")` and methods with `@GetMapping("/{id}")`, `@PostMapping`, returns `annotationMeta.endpointPaths` and `annotationMeta.httpMethods` populated — in `packages/ast-parser/src/parsers/java.test.ts`

- [x] T112 [P] [US10] Test for TypeScript parser decorator value extraction: given a class with `@Controller('entries')` and methods with `@Get(':id')`, `@Post()`, returns `annotationMeta` populated — in `packages/ast-parser/src/parsers/typescript.test.ts`

- [x] T113 [P] [US10] Test for `buildSemanticInput()` heuristic fallback: given a chunk with `annotationMeta` (operationSummaries + endpointPaths) and no LLM enrichment, returns text containing operation summaries, endpoint path, and method names — NOT raw code — in `packages/indexer/src/embedder.test.ts`

- [x] T114 [P] [US10] Test for `buildSemanticInput()` supplementary mode: given a chunk with LLM enrichment (description only, no businessContext/tags) AND `annotationMeta`, returns LLM description supplemented with annotation metadata — in `packages/indexer/src/embedder.test.ts`

- [x] T115 [P] [US10] Test for enrichment prompt annotation inclusion: given a chunk with `stereotype = 'controller'` and `annotationMeta`, the prompt includes annotation values in the chunk header for richer LLM output — in `packages/indexer/src/enrichment/prompt.test.ts`

### Implementation for Phase 14

- [x] T116 [US10] Add `annotationMeta` field to `CodeChunk` interface in `packages/ast-parser/src/types.ts`:

  ```typescript
  annotationMeta?: {
    operationSummaries?: string[];  // @Operation(summary=...) values
    endpointPaths?: string[];       // @RequestMapping / @XMapping path values
    httpMethods?: string[];         // GET, POST, PUT, DELETE, PATCH from @XMapping
    tagName?: string;               // @Tag(name=...) value
  } | undefined;
  ```

- [x] T117 [US10] Enhance Java parser (`packages/ast-parser/src/parsers/java.ts`) to parse annotation attribute values: extract `summary` from `@Operation(summary=...)`, path from `@RequestMapping("...")` / `@GetMapping("...")` / `@PostMapping(...)` / `@PutMapping(...)` / `@DeleteMapping(...)` / `@PatchMapping(...)`, `name` from `@Tag(name=...)`. Populate `annotationMeta` on both the class chunk and the class-signature chunk.

- [x] T118 [US10] Enhance TypeScript parser (`packages/ast-parser/src/parsers/typescript.ts`) to parse decorator argument values: extract path from `@Controller('...')` / `@Get('...')` / `@Post('...')` / `@Put('...')` / `@Delete('...')` / `@Patch('...')`. Populate `annotationMeta` on class and method chunks.

- [x] T119 [US10] Enhance `buildSemanticInput()` fallback in `packages/indexer/src/embedder.ts` (line 174): when `chunk.annotationMeta` is present AND no LLM enrichment exists, synthesize a structured description from: stereotype label, class name, endpoint paths, operation summaries, and exported method names. Do NOT embed raw code in this path.

- [x] T120 [US10] Enhance `buildSemanticInput()` supplementary mode in `packages/indexer/src/embedder.ts`: when LLM enrichment is partially present (e.g., only `description` without `businessContext`/`semanticTags`), append annotation metadata as supplementary signal to the LLM-generated text.

- [x] T121 [US10] Update enrichment prompt in `packages/indexer/src/enrichment/prompt.ts` (`buildEnrichmentPrompt`): when a chunk has `stereotype === 'controller'` or `stereotype === 'gateway'` and `annotationMeta` is populated, add an `endpoint_context:` line to the chunk header showing operation summaries and paths. Instruct the LLM to incorporate these in its generated description and semanticTags.

- [x] T122 [US10] Wire `annotationMeta` through `embedBatchAndStore()` in `packages/indexer/src/pipeline.ts`: add `annotationMeta` to `ChunkPayload` (conditional spread, same pattern as other optional fields). Ensure it is stored in Qdrant for retrieval transparency.

- [x] T123 [US10] Run full test suite (`pnpm test`) and fix any failures. Run `pnpm build` and fix any type errors.

**Checkpoint**: Indexing thin controllers produces semantically rich embeddings from annotation metadata alone (no LLM required). Searching "create entry controller" returns `EntryController` in top-3 results. LLM enrichment prompt produces better descriptions for controller stereotypes.

---

## Phase 15: Enrichment Parallelization (Performance)

**Goal**: Fix the enrichment bottleneck where Ollama batch calls are processed sequentially despite the `concurrency` config being available. Use `p-queue` to process N enrichment batches concurrently, achieving ~3x speedup (with default concurrency=3) during the enrichment phase.

**Root cause**: `LlmEnricher.enrich()` in `packages/indexer/src/enrichment/enricher.ts:147-149` uses a sequential `for...of` loop to process batch groups. The `concurrency` config (default 3) is stored but never used to parallelize execution. For a project with 3,000+ chunks (300+ sequential Ollama calls), this is the primary indexing bottleneck.

**Server prerequisite**: Ollama must be started with `OLLAMA_NUM_PARALLEL >= enrichment.concurrency` (e.g., `OLLAMA_NUM_PARALLEL=8 ollama serve`) for true parallel processing. Otherwise requests queue server-side.

### Tests for Phase 15

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T124 [P] [Perf] Test that `enrich()` processes batches concurrently: given 6 chunks (3 batches of 2) and `concurrency=3`, verify that multiple Ollama calls overlap in time (max concurrent > 1) — in `packages/indexer/src/enrichment/enricher.test.ts`

### Implementation for Phase 15

- [x] T125 [Perf] Parallelize enrichment batches in `packages/indexer/src/enrichment/enricher.ts:147`: import `PQueue` from `p-queue`; replace the sequential `for (const batch of batchGroups) { await applyBatch(batch); }` with a p-queue bounded by `this.config.concurrency`; use `Promise.all(batchGroups.map(batch => queue.add(() => applyBatch(batch))))` to await all batches.

- [x] T126 [Perf] Run enricher test suite (`pnpm vitest packages/indexer/src/enrichment/enricher.test.ts`) and fix any failures.

**Checkpoint**: Enrichment phase processes N batches concurrently (N = `enrichment.concurrency`, default 3). For 300 batches, expected wall-time reduction is ~3x. All existing enricher tests pass.

---

## Phase 16: Retrieval Precision — Test Filtering & Interface Expansion

**Goal**: Improve retrieval precision by (1) excluding test classes from search results by default and (2) automatically surfacing interface implementations via dependency edge expansion. Estimated ~40% reduction in tool calls for architectural queries.

**Root cause**: Test files classified as `stereotype: 'test'` occupy 3-5 result slots per search, diluting production code results. Interface searches (e.g., `EntryService`) return only the interface without its implementation (`EntryServiceImpl`), forcing multiple follow-up searches.

### Tests for Phase 16 (Test Filtering)

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T127 [US6] Test that `classify()` assigns `stereotype: 'test'` to files with path containing `/test/` or `/tests/` AND naming patterns `Fake*`, `Mock*`, `*Helper`, `*Fixture`, `*Builder` (when in test source sets) — in `packages/ast-parser/src/classifier.test.ts`

- [x] T128 [US6] Test that `classifyQueryIntent()` in `packages/retrieval/src/query-classifier.ts` detects test intent: queries containing "test", "spec", "coverage", "how is X tested", "unit test for", "test cases for" return `{ testIntent: true }`. Non-test queries return `{ testIntent: false }`.

- [x] T129 [US6] Test that `search()` in `packages/retrieval/src/search-engine.ts` applies `must_not: [{ key: 'stereotype', match: { value: 'test' } }]` filter by default when `testIntent` is false. Verify via mock Qdrant client that the filter is passed.

- [x] T130 [US6] Test that `search()` does NOT apply the test exclusion filter when query has `testIntent: true` or when user explicitly passes `stereotype: 'test'` as a filter parameter.

### Tests for Phase 16 (Interface Expansion)

- [x] T131 [US6] Test that `expandInterfaceResults()` in `packages/retrieval/src/search-engine.ts` detects interface results (via `stereotype: 'interface'` or dependency edges with `implements` type) and fetches implementations via 1-hop dependency traversal. Verify that implementations are appended to results.

- [x] T132 [US6] Test that interface expansion does NOT trigger when the result already contains the implementation, avoiding duplicates.

### Implementation for Phase 16

- [x] T133 [US6] Expand test classification in `packages/ast-parser/src/classifier.ts`: add path-based detection (`/test/`, `/tests/`) combined with naming patterns (`Fake*`, `Mock*`, `*Helper`, `*Fixture`, `*Builder`, `*Stub`, `*Dummy`) to assign `stereotype: 'test'`. Ensure regular production classes with these patterns outside test source sets are NOT affected.

- [x] T134 [US6] Add `testIntent` detection to `packages/retrieval/src/query-classifier.ts`: scan query for test-related keywords/phrases ("test", "spec", "coverage", "how is X tested", "unit test for", "test cases", "mock", "verify"). Export as part of `QueryIntelligence` result.

- [x] T135 [US6] Modify `search()` in `packages/retrieval/src/search-engine.ts`: when `testIntent` is false AND no explicit `stereotype` filter is provided by the caller, inject `must_not: [{ key: 'stereotype', match: { value: 'test' } }]` into the Qdrant filter. When `testIntent` is true, skip the exclusion.

- [x] T136 [US6] Implement `expandInterfaceResults()` in `packages/retrieval/src/search-engine.ts`: after initial search results are collected, for each result with `stereotype: 'interface'` (or with outbound `implements`/`extends` dependency edges), query Qdrant for points where `dependencyEdges` contain a matching `implements` relationship targeting that interface. Append unique implementations to the result set (deduplicate by `chunkId`).

- [x] T137 [US6] Wire interface expansion into the MCP `search-codebase` tool in `packages/mcp-server/src/tools/search-codebase.ts`: pass a new `expandInterfaces: true` default option to the search engine. Allow MCP callers to disable via parameter if needed.

- [x] T138 [US6] Run full test suite (`pnpm test`) and fix any failures. Run `pnpm build` and fix any type errors.

**Checkpoint**: Searching "EntryService createEntry" returns only production code (no test classes) and includes `EntryServiceImpl` via interface expansion. Searching "tests for EntryService" returns test classes. ~40% fewer tool calls needed for architectural queries.

---

## Phase 17: Token-Efficient `get_file` — Line-Range and Name Filtering

**Goal**: Add optional `startLine`/`endLine` and `name` parameters to the `get_file` MCP tool, enabling callers to retrieve only specific portions of a file. Reduces token usage by ~70-80% in typical LLM exploration workflows where the agent already knows (from `search_codebase` results) which function or line range it needs.

**Root cause**: After `search_codebase` returns results with exact line ranges (e.g., `Entry.java:166-231 (create)`), LLMs call `get_file` for full context but receive the entire file (~350 lines) when only ~65 lines are relevant. The `get_file` tool accepts only a `path` parameter with no filtering mechanism.

### Tests for Phase 17

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T139 [P] [US10] Test that `getFileHandler` with `startLine` and `endLine` returns only the specified line range from the file — in `packages/mcp-server/src/tools/get-file.test.ts`

- [x] T140 [P] [US10] Test that `getFileHandler` with `name` parameter filters chunks by name (case-insensitive contains match) and returns only the matching chunk content — in `packages/mcp-server/src/tools/get-file.test.ts`

- [x] T141 [P] [US10] Test that `getFileHandler` with `name` matching multiple chunks (e.g., overloaded methods) returns all matching sections, each with their own headers and line ranges — in `packages/mcp-server/src/tools/get-file.test.ts`

- [x] T142 [P] [US10] Test that `getFileHandler` with `name` that matches no chunks falls back to returning the full file content with an informational note — in `packages/mcp-server/src/tools/get-file.test.ts`

- [x] T143 [P] [US10] Test that `getFileHandler` with both `name` and `startLine`/`endLine` uses `name` as the primary filter (name takes precedence) — in `packages/mcp-server/src/tools/get-file.test.ts`

### Implementation for Phase 17

- [x] T144 [US10] Extend `GetFileInput` interface and tool schema in `packages/mcp-server/src/tools/get-file.ts`: add optional `startLine` (z.number()), `endLine` (z.number()), and `name` (z.string()) parameters with appropriate descriptions.

- [x] T145 [US10] Implement filtering logic in `getFileHandler` in `packages/mcp-server/src/tools/get-file.ts`:
  - **Name filter path**: When `name` is provided, filter the `results` array to chunks where `r.name` matches (case-insensitive substring). Use matched chunks' `startLine`/`endLine` to read only those ranges from disk. If no chunks match, fall back to full file with an informational note.
  - **Line-range path**: When `startLine`/`endLine` are provided (without `name`), read the full file and slice to the specified range (1-indexed, inclusive). Return with appropriate header showing the range.
  - **Precedence**: When both `name` and line range are provided, `name` takes precedence.
  - **No filter**: When neither is provided, preserve existing behavior (full file content).

- [x] T146 [US10] Run full test suite (`pnpm test`) and fix any failures. Run `pnpm build` and fix any type errors.

- [x] T147 [US10] Update `RAG_CONTENT` in `packages/cli/src/commands/agents.command.ts` to document the new `get_file` parameters (`name`, `startLine`, `endLine`) and recommended usage pattern (use `search_codebase` results to inform targeted `get_file` calls). Run tests and build.

**Checkpoint**: Calling `get_file` with `path: "src/entry/Entry.java", name: "create"` returns only the `create` method(s) (~65 lines) instead of the full file (~350 lines). Token usage per targeted `get_file` call reduced by ~70-80%. Existing behavior preserved when no filter params are given. Agent injection text documents new parameters so LLMs know to use them.

---

## Phase 18: Session-Level MCP Cache — Embedding Cache + Dedup

**Goal**: Add session-level caching to the MCP server that saves both tokens (70-90% per repeated call) and latency (200-500ms per cached embedding) by deduplicating responses and caching embedding vectors. All caches are in-memory with LRU-100 eviction, dying naturally with the MCP server process.

**Root cause**: The MCP server is stateless between calls. Every tool invocation re-executes the full pipeline (embedding API → Qdrant → filesystem → formatting) regardless of whether identical results were recently computed. LLM sessions involve ~30% redundant calls.

### Tests for Phase 18

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T148 [P] [US11] Test that `CachingEmbeddingProvider.embed()` returns the same vector on cache hit without calling the underlying provider a second time — in `packages/embedding/src/caching-provider.test.ts`

- [x] T149 [P] [US11] Test that `CachingEmbeddingProvider` evicts the least-recently-used entry when cache reaches 100 entries — in `packages/embedding/src/caching-provider.test.ts`

- [x] T150 [P] [US11] Test that `getFileHandler` session dedup returns a short "Content unchanged" message (~15 tokens) on second identical call when file mtime has not changed — in `packages/mcp-server/src/tools/get-file.test.ts`

- [x] T151 [P] [US11] Test that `getFileHandler` session dedup invalidates cached entry when file mtime changes (re-reads and returns fresh content) — in `packages/mcp-server/src/tools/get-file.test.ts`

- [x] T152 [P] [US11] Test that `searchCodebaseHandler` session dedup returns a short "Same results" message on second identical call with same query+filters — in `packages/mcp-server/src/tools/search-codebase.test.ts`

- [x] T153 [P] [US11] Test that session dedup produces separate cache entries for different parameters (different query → different entry, different path → different entry) — in `packages/mcp-server/src/tools/search-codebase.test.ts` and `get-file.test.ts`

### Implementation for Phase 18

- [x] T154 [US11] Implement `CachingEmbeddingProvider` in `packages/embedding/src/caching-provider.ts`: implements `EmbeddingProvider` interface, wraps an underlying provider, LRU-100 cache keyed by `(text, taskType)`, delegates `embedBatch` and `estimateTokens` to underlying provider.

- [x] T155 [US11] Implement `get_file` session dedup in `packages/mcp-server/src/tools/get-file.ts`:
  - LRU-100 cache keyed by `${repo}:${path}:${startLine}:${endLine}:${name}`
  - On cache hit: check file mtime via `stat()` — if unchanged, return short message: "Content unchanged since previous request (N lines, path). Use startLine/endLine or name to narrow."
  - On mtime change or cache miss: execute normally, store response + mtime in cache.

- [x] T156 [US11] Implement `search_codebase` session dedup in `packages/mcp-server/src/tools/search-codebase.ts`:
  - LRU-100 cache keyed by JSON-stable hash of full `SearchCodebaseInput`
  - On cache hit: return short message: "Same results as previous identical query (N results). Refine your query or use filters to get different results."
  - On cache miss: execute normally, store response in cache.

- [x] T157 [US11] Wire `CachingEmbeddingProvider` in `packages/mcp-server/src/server.ts`: wrap the search engine's embedding provider with `CachingEmbeddingProvider` at server creation time.

- [x] T158 [US11] Run full test suite (`pnpm test`) and fix any failures. Run `pnpm build` and fix any type errors.

**Checkpoint**: Second identical `get_file` call returns ~15 tokens instead of ~1100 tokens. Second identical `search_codebase` call returns ~20 tokens instead of ~500 tokens. Embedding provider is called once per unique query text regardless of how many times the same search is issued. All existing behavior preserved for non-duplicate calls.

---

## Phase 19: README Update — Reflect Spec 008 Changes

**Goal**: Rewrite the root `README.md` to accurately document the current project state after all spec 008 phases. The README currently describes the pre-008 architecture and misleads developers about capabilities, tool names, and configuration.

**Root cause**: README was never updated as spec 008 phases were implemented incrementally.

### Tasks for Phase 19

- [x] T159 [US12] Rewrite README architecture section: replace "dual-vector embeddings" with triple-vector (semantic, signature, sparse); document lean Qdrant payloads (no raw code stored); document unified AST+LLM pipeline (remove `--strategy` flag references); add stereotype/archLayer classification description.

- [x] T160 [US12] Rewrite README MCP tools section: document 3 core tools (`search_codebase`, `get_file`, `get_dependencies`) with all current parameters including metadata filters (`stereotype`, `archLayer`, `module`, `language`), `get_file` filters (`name`, `startLine`, `endLine`), and `get_dependencies` BFS depth. Remove all references to deprecated tools (`search_codebase_hybrid`, `get_module_dependencies`, `benchmark_preflight`). Add usage examples and token-conscious patterns.

- [x] T161 [US12] Update remaining README sections: supported languages (add Proto, YAML, XML, SQL); CLI reference (remove deprecated flags, update `index` command docs); configuration examples (update `project.json` schema); remove/update any screenshots or diagrams that show old architecture.

**Checkpoint**: README accurately describes triple-vector architecture, 3 MCP tools with all params, 10 supported languages, and unified pipeline. No deprecated tool names or flags appear. New developer can follow README to set up and use the project correctly.
