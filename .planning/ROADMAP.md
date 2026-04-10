# Roadmap: ia-framework

## Milestones

- ✅ **v1.0 MVP** - Phases 1-11 (shipped 2026-04-07)
- 🚧 **v1.1 RAG Quality & Dashboard Evolution** - Phases 12-18 (in progress)

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

<details>
<summary>✅ v1.0 MVP (Phases 1-11) — SHIPPED 2026-04-07</summary>

- [x] **Phase 1: Foundation & Infrastructure** - Monorepo scaffolding, shared types, config system, Docker + Qdrant infrastructure (completed 2026-04-01)
- [x] **Phase 2: Project Detection & Configuration** - Auto-detect target project's tech stack and produce confirmed profile (completed 2026-04-01)
- [x] **Phase 3: Indexing Pipeline** - AST-aware codebase parsing, dual-vector embedding, Qdrant storage (completed 2026-04-01)
- [x] **Phase 4: Retrieval & MCP Server** - Semantic search engine and MCP tools for OpenCode integration (completed 2026-04-01)
- [x] **Phase 5: Installation & CLI** - One-shot installer and CLI commands for frictionless setup (completed 2026-04-01)
- [x] **Phase 6: Observability & Metrics** - Token tracking, RAG interaction logging, SQLite metrics storage (completed 2026-04-01)
- [x] **Phase 7: Benchmarking System** - End-to-end RAG quality measurement with comparison and history (completed 2026-04-01)
- [x] **Phase 8: Monitoring Dashboard** - Browser-based visibility into system health, usage, and benchmarks (completed 2026-04-01)
- [x] **Phase 9: Database Context** - Database schema indexing and query support as additional AI context (completed 2026-04-01)
- [x] **Phase 10: Advanced Retrieval & Workflow Integration** - Dependency graph expansion, auto-context injection, GSD integration (completed 2026-04-02)
- [x] **Phase 11: MRR Quick Wins & Corpus Building** - Improve retrieval quality through corpus expansion and threshold tuning (completed 2026-04-07)

### Phase 1: Foundation & Infrastructure

**Goal**: The monorepo is bootstrapped with shared types, configuration, and Docker infrastructure ready for development
**Depends on**: Nothing (first phase)
**Requirements**: ARCH-01, ARCH-02, ARCH-03
**Success Criteria** (what must be TRUE):

1. Developer can clone the repo, run `pnpm install`, and build all packages without errors
2. Core types package exports shared interfaces (ChunkMetadata, ProjectProfile, EmbeddingVector) importable by other packages
3. Qdrant container starts via Docker Compose and accepts connections on localhost
4. Config loader validates `.ia-framework/project.json` against Zod schemas and rejects invalid configs
5. Structured logging outputs to stderr in a consistent format across all packages
   **Plans**: 3 plans

Plans:

- [x] 01-01-PLAN.md — Monorepo scaffold (pnpm workspaces, Turborepo, TypeScript/ESLint/Prettier base config)
- [x] 01-02-PLAN.md — Core package: shared types, Zod config loader (TDD), pino logger
- [x] 01-03-PLAN.md — Docker infrastructure: Qdrant container with named volumes and health check

### Phase 2: Project Detection & Configuration

**Goal**: Framework can auto-detect a target project's technology stack and produce a confirmed profile
**Depends on**: Phase 1
**Requirements**: INST-05, INST-06, INST-07
**Success Criteria** (what must be TRUE):

1. Running project detection on a target codebase identifies its language, framework, package manager, test runner, and build commands
2. Developer is shown the detected profile and can confirm, correct, or extend any field
3. Confirmed profile is persisted to `.ia-framework/project.json` and loads correctly on next startup
   **Plans**: 2 plans

Plans:

- [x] 02-01: TBD
- [x] 02-02: TBD

### Phase 3: Indexing Pipeline

**Goal**: Framework can index any codebase into Qdrant with AST-aware chunking and dual-vector embeddings
**Depends on**: Phase 1, Phase 2
**Requirements**: INDX-01, INDX-02, INDX-03, INDX-04, INDX-05, INDX-06, INDX-07, INDX-08
**Success Criteria** (what must be TRUE):

1. Running the indexer on a TypeScript project produces chunks at function, class, and interface boundaries (not arbitrary text splits)
2. Each indexed chunk has both a text embedding and a code embedding stored as named vectors in Qdrant
3. Indexing uses the configured embedding provider (OpenAI or Ollama) without code changes
4. Indexer skips files matching .gitignore and standard exclusions (node_modules, build output, binary files)
5. Re-running the indexer after code changes only re-indexes modified files (detected via git diff)
   **Plans**: 4 plans

Plans:

- [x] 03-01: AST Parser package (web-tree-sitter, TypeScript/Python grammars, chunk extraction)
- [x] 03-02: Embedding package (provider interface, Ollama + OpenAI adapters)
- [x] 03-03: Vector store package (QdrantVectorStore with dual named vectors)
- [x] 03-04: Indexing pipeline (FileWalker, incremental indexing via git diff)

### Phase 4: Retrieval & MCP Server

**Goal**: Developer can search the indexed codebase from OpenCode and get relevant code context
**Depends on**: Phase 3
**Requirements**: RETR-01, RETR-02, RETR-06
**Success Criteria** (what must be TRUE):

1. Developer can issue a natural language query (e.g., "authentication middleware") and receive relevant code chunks ranked by similarity
2. MCP server registers tools (search_codebase, get_file, get_dependencies) accessible from OpenCode via stdio transport
3. Search results include file path, function/class name, and code content for each match
4. All retrieval operations run locally — queries and results never leave the developer's machine
   **Plans**: 3 plans

Plans:

- [x] 04-01: SearchEngine (semantic search, dual-vector merge, score filtering)
- [x] 04-02: MCP Server (@ia-framework/mcp-server with search_codebase, get_file, get_dependencies tools)
- [x] 04-03: Integration verification (all packages build + typecheck + test clean)

### Phase 5: Installation & CLI

**Goal**: Developer can go from git clone to a fully working RAG pipeline in one command
**Depends on**: Phase 2, Phase 3, Phase 4
**Requirements**: INST-01, INST-02, INST-03, INST-04, INST-08, INST-09, INST-10, INST-11
**Success Criteria** (what must be TRUE):

1. Running `./install.sh` on a fresh machine detects missing prerequisites (Docker, Node.js, Ollama, OpenCode) and installs them automatically
2. Installer skips tools already present on the developer's machine
3. After installation completes, developer can search the indexed codebase via OpenCode MCP tools
4. Developer can run `ia-framework index`, `ia-framework search`, and `ia-framework status` without re-running the full installer
5. Installer sets up Qdrant Docker container with named volumes so indexed data persists across container restarts
   **Plans**: 3 plans

Plans:

- [x] 05-01: Shell installer (install.sh, prerequisite detection, service startup, config init)
- [x] 05-02: CLI package (@ia-framework/cli with index, search, status commands)
- [x] 05-03: Integration & OpenCode config (configure-opencode.sh, MCP wiring, smoke tests)

### Phase 6: Observability & Metrics

**Goal**: Every RAG interaction is tracked with token counts for cost visibility and optimization decisions
**Depends on**: Phase 4
**Requirements**: OBSV-01, OBSV-02, OBSV-03, OBSV-04, OBSV-05
**Success Criteria** (what must be TRUE):

1. Every query to the RAG system logs the query text, retrieved chunks, and token count to a structured log
2. Developer can see total tokens consumed in the current coding session
3. Token usage is broken down by retrieval strategy (MCP-only vs auto-context vs combined) for cost comparison
4. All metrics are stored in a local SQLite database and persist across sessions
   **Plans**: 2 plans

Plans:

- [x] 06-01: Observability package (@ia-framework/observability — TokenCounter, MetricsStore with SQLite, TDD)
- [x] 06-02: Wire into MCP server + CLI (log RagEvent per search, status command shows stats)

### Phase 7: Benchmarking System

**Goal**: Developer can measure and compare RAG retrieval quality across different configurations using retrieval precision metrics
**Depends on**: Phase 4, Phase 6
**Requirements**: BNCH-01, BNCH-02, BNCH-03, BNCH-04, BNCH-05, BNCH-06
**Success Criteria** (what must be TRUE):

1. Running `ia-framework benchmark run` measures Hit@K, MRR, and latency for each query in the corpus against the indexed codebase
2. Benchmark includes a no-RAG baseline mode (--baseline flag, scoreThreshold=2.0) to prove RAG actually helps
3. Results are stored in benchmarks.sqlite with timestamps and config snapshots for historical comparison
4. Developer can add custom evaluation queries to .ia-framework/benchmark-queries.json; example file is scaffolded on first run
5. Benchmark uses fixed Top-K (default 10) and deterministic query sets so results are reproducible across runs
6. Developer can compare two runs side-by-side with `ia-framework benchmark compare <id1> <id2>`
   **Plans**: 3 plans

Plans:

- [x] 07-01-PLAN.md — packages/benchmark core: types, BenchmarkStore (SQLite), BenchmarkRunner (Hit@K + MRR, TDD)
- [x] 07-02-PLAN.md — QueryCorpus loader (Zod JSON, scaffold on first run) + CLI benchmark run/list/history commands
- [x] 07-03-PLAN.md — benchmark compare subcommand + full workspace integration verification + human checkpoint

### Phase 8: Monitoring Dashboard

**Goal**: Developer has browser-based visibility into system health, usage, and benchmark trends
**Depends on**: Phase 6, Phase 7
**Requirements**: DASH-01, DASH-02, DASH-03, DASH-04, DASH-05, DASH-06, BNCH-07
**Success Criteria** (what must be TRUE):

1. Dashboard is accessible via browser from a Docker container on a configurable port
2. Dashboard shows current indexing status with progress, coverage percentage, and last update time
3. Dashboard shows token usage trends as interactive charts over time
4. Dashboard shows benchmark score trends with historical comparison and allows triggering re-indexing with different strategies
5. Dashboard displays the detected project profile and stays in sync with the `.ia-framework/project.json` config file
   **Plans**: 4 plans

Plans:

- [x] 08-01: Hono REST API (8 endpoints, MetricsStore/BenchmarkStore/IndexingState wiring, 15 unit tests)
- [x] 08-02: React frontend scaffold (Vite + Tailwind, routing, Overview + Config pages)
- [x] 08-03: Charts and interactive components (TokenUsage BarChart, Benchmarks LineChart, IndexingPanel)
- [x] 08-04: Docker container (multi-stage Dockerfile, docker-compose update, install.sh integration, graceful unconfigured mode)

### Phase 9: Database Context

**Goal**: Framework can index database schema and data as additional context for AI understanding
**Depends on**: Phase 3, Phase 5
**Requirements**: DBAS-01, DBAS-02, DBAS-03
**Success Criteria** (what must be TRUE):

1. Developer provides database connection details and the framework connects and validates the connection
2. Database schema (tables, columns, types, relationships) is indexed as searchable context alongside code
3. Framework can execute read-write queries against the connected database for AI to understand data patterns
   **Plans**: 2 plans

Plans:

- [x] 09-01-PLAN.md — db-context package (ContextSource interface in core, PostgresSource, DatabaseConfig Zod schema, db.json loader, IndexingPipeline contextSources extension — full TDD)
- [x] 09-02-PLAN.md — MCP tools (query_database + index_database_schema) + CLI db subcommand (configure/connect/index/status) + dashboard /api/db/status + Overview DB status card

### Phase 10: Advanced Retrieval & Workflow Integration

**Goal**: RAG results are enhanced with dependency context and automatically injected into developer workflows
**Depends on**: Phase 4, Phase 7
**Requirements**: INDX-05, RETR-03, RETR-04, RETR-05, WKFL-01, WKFL-02, WKFL-03
**Success Criteria** (what must be TRUE):

1. Retrieval results expand 1-2 hops along the dependency graph to include referenced types, interfaces, and utilities
2. Auto-context mode automatically prepends relevant codebase context to prompts without explicit developer queries (documented as v2 — OpenCode doesn't support MCP Resources/Prompts or plugin hooks for injection)
3. Developer can switch between MCP-only, auto-context, and combined retrieval modes via configuration
4. GSD planning and execution phases automatically receive relevant architectural and code context from RAG (via `ia-framework agents inject` into target project AGENTS.md/CLAUDE.md)
5. GSD workflows can leverage online LLMs for reasoning while RAG provides local codebase context (satisfied by OpenCode's 75+ provider model config)
   **Plans**: 4 plans

Plans:

- [x] 10-01-PLAN.md — DependencyGraph barrel export + IndexingPipeline upsertEdges wiring
- [x] 10-02-PLAN.md — Graph-expanded retrieval (searchWithExpansion) + retrieval.mode config + auto-context v2 deferral (TDD)
- [x] 10-03-PLAN.md — GSD-RAG integration (MCP approach), agents inject/check CLI commands, install.sh wiring, WKFL-03 verification
- [x] 10-04-PLAN.md — Full workspace verification (build/typecheck/test), success criteria validation, ROADMAP + STATE update

### Phase 11: MRR Quick Wins & Corpus Building

**Goal**: Improve RAG retrieval quality (MRR) end-to-end — better corpus, better text vectors, hybrid search, and MCP integration so OpenCode sees the improvements
**Depends on**: Phase 7 (Benchmarking System), Phase 4 (Retrieval & MCP Server)
**Requirements**: BNCH-01 (completion), RETR-01 (quality improvement)
**Success Criteria** (what must be TRUE):

1. Benchmark corpus grows from 3 → 30 queries with balanced semantic, keyword, cross-file, and negative coverage; all queries validated
2. Text vector embeds a prose description of each chunk (not raw code) via `chunkToDescription()` helper in `@ia-framework/indexer`
3. Hybrid search (BM25 sparse + dense + RRF) implemented in `SearchEngine.searchHybrid()` and exposed as `search_codebase_hybrid` MCP tool
4. Score threshold is systematically tested (0.3, 0.4, 0.5, 0.6) and optimal value applied as MCP default
5. Before/after MRR comparison published; measurable improvement over Phase 10 baseline
6. All MCP changes are live for OpenCode in target project
   **Plans**: 4 plans

Plans:

- [x] 11-01-PLAN.md — 30-query corpus: JSON schema, 6 categories × 5 queries, validateCorpus() TDD, CORPUS.md
- [x] 11-02-PLAN.md — Fix text vector: chunkToDescription() helper (TDD), pipeline wiring, full re-index required
- [x] 11-03-PLAN.md — Hybrid search: BM25 sparse vectors in Qdrant, SearchEngine.searchHybrid(), search_codebase_hybrid MCP tool
- [x] 11-04-PLAN.md — Threshold tuning (post re-index), benchmark comparison, MCP default update, ROADMAP + STATE update

</details>

### 🚧 v1.1 RAG Quality & Dashboard Evolution (In Progress)

**Milestone Goal:** Improve RAG retrieval quality (MRR > 0.7) through LLM-based chunking, parallel embedding, systematic strategy optimization, and dashboard analytics with interactive search.

**Critical dependency:** INDX-13 (LLM chunking spike) is a GO/NO-GO gate. Phase 12 must complete first. If the spike fails, LLM-specific requirements (INDX-10, INDX-11, INDX-12) are descoped and the milestone pivots.

- [x] **Phase 12: LLM Chunking Spike** - GO/NO-GO validation of LLM-based chunking feasibility via Ollama (completed 2026-04-10)
- [ ] **Phase 13: Pipeline Refactoring & Parallel Embedding** - Extract ChunkingStrategy interface, add concurrent embedding with progress events
- [ ] **Phase 14: LLM Chunking Implementation & CLI** - Full LLM chunking pipeline, CLI strategy flags, Ollama model management, multi-collection storage
- [ ] **Phase 15: Multi-Collection Search & MCP Integration** - Cross-collection querying with RRF merging and source tagging
- [ ] **Phase 16: Dashboard Search** - Search page with query input, collection selector, per-query metrics, and A/B comparison
- [ ] **Phase 17: Dashboard Search History** - Persistent search log with replay, filtering, and comparison
- [ ] **Phase 18: Dashboard Analytics** - Strategy comparison charts, RAG quality trends, token breakdowns, score distributions

## Phase Details

### Phase 12: LLM Chunking Spike

**Goal**: Validate LLM chunking feasibility before committing to full implementation — GO/NO-GO gate for all LLM-dependent work
**Depends on**: Nothing (first v1.1 phase)
**Requirements**: INDX-13
**Success Criteria** (what must be TRUE):

1. Spike script sends representative files (small, medium, large) to Ollama and receives structured JSON with chunk boundaries and prose summaries
2. Measured latency (seconds/file, tokens/sec) is documented for 3+ file sizes with a clear viability assessment
3. Same file produces consistent chunk boundaries across 5 runs with temperature=0 (determinism validated)
4. GO/NO-GO decision is documented with evidence covering quality, latency, context window handling, and model recommendation
   **Plans**: 1 plan

Plans:

- [ ] 12-01-PLAN.md — Build and run LLM chunking spike (scaffold, Ollama integration, measurement harnesses, GO/NO-GO report)

### Phase 13: Pipeline Refactoring & Parallel Embedding

**Goal**: Indexing pipeline is faster and extensible — parallel embedding with provider-aware concurrency and real-time progress visibility
**Depends on**: Nothing (independent refactoring of existing pipeline)
**Requirements**: INDX-14, INDX-15, INDX-16, INDX-17
**Success Criteria** (what must be TRUE):

1. Embedding pipeline processes multiple chunks concurrently via p-queue, completing indexing measurably faster than sequential baseline
2. Concurrency automatically adapts to provider type (Ollama: 2-3 concurrent, OpenAI: 5-10 concurrent) without manual configuration
3. CLI and dashboard receive real-time progress events during indexing showing phase, completed count, and total count
4. Developer can override default embedding concurrency via `embeddingConcurrency` in project.json
   **Plans**: 3 plans

Plans:

- [x] 13-01-PLAN.md — Config schema + types + ChunkingStrategy interface with AstChunkingStrategy
- [ ] 13-02-PLAN.md — Pipeline refactoring with p-queue concurrency, retry/abort, strategy delegation
- [ ] 13-03-PLAN.md — CLI stage-specific progress, batch fields in dashboard JSON, integration verification

### Phase 14: LLM Chunking Implementation & CLI

**Goal**: Developer can index codebase using LLM-based semantic chunking via Ollama, with chunks stored in a dedicated collection
**Depends on**: Phase 12 (GO decision), Phase 13 (ChunkingStrategy interface)
**Requirements**: INDX-10, INDX-11, INDX-12, CLIE-01, CLIE-02, CLIE-03, RETR-07
**Success Criteria** (what must be TRUE):

1. Running `ia-framework index --strategy llm` produces semantically chunked code with prose summaries via Ollama in a single pass per file
2. LLM chunks are stored in a separate `{project}-llm` Qdrant collection alongside the existing `{project}` AST collection
3. CLI verifies the configured Ollama model is available before LLM indexing starts; prompts interactive model selection when the configured model is missing
4. Re-running LLM indexing on unchanged files skips LLM processing (cached by file content hash)
5. Running `ia-framework index` without `--strategy` flag defaults to AST chunking (backward compatible)
   **Plans**: TBD

### Phase 15: Multi-Collection Search & MCP Integration

**Goal**: MCP search tools seamlessly query both AST and LLM collections with fair cross-collection ranking
**Depends on**: Phase 14 (collections must exist)
**Requirements**: RETR-08, RETR-09, RETR-10, RETR-11
**Success Criteria** (what must be TRUE):

1. MCP `search_codebase` and `search_codebase_hybrid` tools automatically query all active Qdrant collections for the project
2. Cross-collection results are merged via Reciprocal Rank Fusion (RRF) — rank-based merging, never raw score comparison
3. Each search result includes a `source` tag (`ast` or `llm`) indicating which collection produced it
4. Search works normally when only one collection exists — no LLM collection means AST-only results with no errors or degradation
   **Plans**: TBD

### Phase 16: Dashboard Search

**Goal**: Developer can search the indexed codebase directly from the dashboard with per-query metrics and strategy comparison
**Depends on**: Phase 15 (multi-collection search engine)
**Requirements**: DASH-07, DASH-08, DASH-09, DASH-10
**Success Criteria** (what must be TRUE):

1. Dashboard has a search page with query input field, ranked results showing relevance scores, file paths, and inline code previews
2. Developer can select which collection(s) to search: AST only, LLM only, or both (merged)
3. Each search displays per-query metrics panel: latency, chunks scanned, and score distribution visualization
4. Developer can run the same query against AST and LLM collections side-by-side for A/B comparison with visual diff of rankings
   **Plans**: TBD

### Phase 17: Dashboard Search History

**Goal**: Developer can review, replay, and compare past searches with a persistent searchable log
**Depends on**: Phase 16 (search functionality must exist)
**Requirements**: DASH-12, DASH-13, DASH-14
**Success Criteria** (what must be TRUE):

1. Every dashboard search is automatically persisted with query text, results, scores, strategy, and timestamp
2. Developer can replay any past query to compare results before and after re-indexing
3. Search history is filterable by date range, strategy used, query text substring, and minimum relevance score
   **Plans**: TBD

### Phase 18: Dashboard Analytics

**Goal**: Developer has full analytics visibility into RAG quality trends, strategy performance, token costs, and score distributions
**Depends on**: Phase 15 (multi-collection data), Phase 16 (search infrastructure)
**Requirements**: DASH-11, DASH-15, DASH-16, DASH-17, DASH-18
**Success Criteria** (what must be TRUE):

1. Dashboard shows strategy comparison scores (MRR, P@K) via radar or bar charts from benchmark data
2. Dashboard shows RAG quality trend charts tracking MRR, average latency, and chunk relevance over time
3. Dashboard shows aggregate strategy comparison table with average MRR, average latency, and average chunks per strategy
4. Dashboard shows token usage breakdown by strategy (indexing tokens vs query tokens, broken down per AST/LLM)
5. Dashboard shows score distribution histograms across queries and strategies for distribution shape analysis
   **Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 12 → 13 → 14 → 15 → 16 → 17 → 18

| Phase                                         | Milestone | Plans Complete | Status      | Completed  |
| --------------------------------------------- | --------- | -------------- | ----------- | ---------- |
| 1. Foundation & Infrastructure                | v1.0      | 3/3            | Complete    | 2026-04-01 |
| 2. Project Detection & Configuration          | v1.0      | 2/2            | Complete    | 2026-04-01 |
| 3. Indexing Pipeline                          | v1.0      | 4/4            | Complete    | 2026-04-01 |
| 4. Retrieval & MCP Server                     | v1.0      | 3/3            | Complete    | 2026-04-01 |
| 5. Installation & CLI                         | v1.0      | 3/3            | Complete    | 2026-04-01 |
| 6. Observability & Metrics                    | v1.0      | 2/2            | Complete    | 2026-04-01 |
| 7. Benchmarking System                        | v1.0      | 3/3            | Complete    | 2026-04-01 |
| 8. Monitoring Dashboard                       | v1.0      | 4/4            | Complete    | 2026-04-01 |
| 9. Database Context                           | v1.0      | 2/2            | Complete    | 2026-04-01 |
| 10. Advanced Retrieval & Workflow Integration | v1.0      | 4/4            | Complete    | 2026-04-02 |
| 11. MRR Quick Wins & Corpus Building          | v1.0      | 4/4            | Complete    | 2026-04-07 |
| 12. LLM Chunking Spike                        | v1.1      | 0/?            | Complete    | 2026-04-10 |
| 13. Pipeline Refactoring & Parallel Embedding | v1.1      | 1/3 | In Progress|  |
| 14. LLM Chunking Implementation & CLI         | v1.1      | 0/?            | Not started | -          |
| 15. Multi-Collection Search & MCP Integration | v1.1      | 0/?            | Not started | -          |
| 16. Dashboard Search                          | v1.1      | 0/?            | Not started | -          |
| 17. Dashboard Search History                  | v1.1      | 0/?            | Not started | -          |
| 18. Dashboard Analytics                       | v1.1      | 0/?            | Not started | -          |
