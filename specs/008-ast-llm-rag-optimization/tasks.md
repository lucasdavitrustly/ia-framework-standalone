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
