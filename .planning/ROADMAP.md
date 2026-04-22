# Roadmap: ia-framework

## Milestones

- ✅ **v1.0 MVP** - Phases 1-11 (shipped 2026-04-07)
- ✅ **v1.1 RAG Quality & Dashboard Evolution** - Phases 12-18 (shipped 2026-04-15)
- 🚧 **v1.2 Chunking Tuning & Retrieval Quality** - Phases 19-21 (in progress)

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
- [x] **Phase 13: Pipeline Refactoring & Parallel Embedding** - Extract ChunkingStrategy interface, add concurrent embedding with progress events (completed 2026-04-10)
- [x] **Phase 14: LLM Chunking Implementation & CLI** - Full LLM chunking pipeline, CLI strategy flags, Ollama model management, multi-collection storage (completed 2026-04-14)
- [x] **Phase 15: Multi-Collection Search & MCP Integration** - Cross-collection querying with RRF merging and source tagging (completed 2026-04-14)
- [x] **Phase 16: Dashboard Search** - Search page with query input, collection selector, per-query metrics, and A/B comparison (completed 2026-04-14)
- [x] **Phase 17: Dashboard Search History** - Persistent search log with replay, filtering, and comparison (completed 2026-04-15)
- [x] **Phase 18: Dashboard Analytics** - Strategy comparison charts, RAG quality trends, token breakdowns, score distributions (completed 2026-04-15)

<details>
<summary>v1.1 Phase Details (Phases 12-18)</summary>

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

- [x] 12-01-PLAN.md — Build and run LLM chunking spike

### Phase 13: Pipeline Refactoring & Parallel Embedding

**Goal**: Indexing pipeline is faster and extensible — parallel embedding with provider-aware concurrency and real-time progress visibility
**Depends on**: Nothing (independent refactoring of existing pipeline)
**Requirements**: INDX-14, INDX-15, INDX-16, INDX-17
**Plans**: 3 plans

Plans:

- [x] 13-01-PLAN.md — Config schema + types + ChunkingStrategy interface with AstChunkingStrategy
- [x] 13-02-PLAN.md — Pipeline refactoring with p-queue concurrency, retry/abort, strategy delegation
- [x] 13-03-PLAN.md — CLI stage-specific progress, batch fields in dashboard JSON, integration verification

### Phase 14: LLM Chunking Implementation & CLI

**Goal**: Developer can index codebase using LLM-based semantic chunking via Ollama, with chunks stored in a dedicated collection
**Depends on**: Phase 12 (GO decision), Phase 13 (ChunkingStrategy interface)
**Requirements**: INDX-10, INDX-11, INDX-12, CLIE-01, CLIE-02, CLIE-03, RETR-07
**Plans**: 4 plans

Plans:

- [x] 14-01-PLAN.md — Types, config, and pipeline description-aware embedding
- [x] 14-02-PLAN.md — LlmChunkingStrategy with content-hash cache
- [x] 14-03-PLAN.md — CLI --strategy flag, Ollama model management, collection routing
- [x] 14-04-PLAN.md — Gap closure: fix collection routing bug + remove dead onFileProgress code

### Phase 15: Multi-Collection Search & MCP Integration

**Goal**: MCP search tools seamlessly query both AST and LLM collections with fair cross-collection ranking
**Depends on**: Phase 14 (collections must exist)
**Requirements**: RETR-08, RETR-09, RETR-10, RETR-11
**Plans**: 2 plans

Plans:

- [x] 15-01-PLAN.md — Core RRF merge + MultiCollectionSearchEngine (TDD)
- [x] 15-02-PLAN.md — MCP/CLI wiring, collection discovery, source tag rendering

### Phase 16: Dashboard Search

**Goal**: Developer can search the indexed codebase directly from the dashboard with per-query metrics and strategy comparison
**Depends on**: Phase 15 (multi-collection search engine)
**Requirements**: DASH-07, DASH-08, DASH-09, DASH-10
**Plans**: 3 plans

Plans:

- [x] 16-01-PLAN.md — Backend search API
- [x] 16-02-PLAN.md — Frontend search page
- [x] 16-03-PLAN.md — Metrics panel + A/B comparison

### Phase 17: Dashboard Search History

**Goal**: Developer can review, replay, and compare past searches with a persistent searchable log
**Depends on**: Phase 16 (search functionality must exist)
**Requirements**: DASH-12, DASH-13, DASH-14
**Plans**: 2 plans

Plans:

- [x] 17-01-PLAN.md — Backend: SearchHistoryStore (SQLite), API endpoints
- [x] 17-02-PLAN.md — Frontend: History page, HistoryTable, HistoryFilterBar, ReplayDiffLayout

### Phase 18: Dashboard Analytics

**Goal**: Developer has full analytics visibility into RAG quality trends, strategy performance, token costs, and score distributions
**Depends on**: Phase 15 (multi-collection data), Phase 16 (search infrastructure)
**Requirements**: DASH-11, DASH-15, DASH-16, DASH-17, DASH-18
**Plans**: 2 plans

Plans:

- [x] 18-01-PLAN.md — Backend: /api/analytics router
- [x] 18-02-PLAN.md — Frontend: AnalyticsPage with charts

</details>

### 🚧 v1.2 Chunking Tuning & Retrieval Quality (In Progress)

**Milestone Goal:** Push MRR past 0.7 through LLM chunking prompt engineering, smarter score-based filtering, and dashboard tuning visibility — all benchmark-driven.

- [ ] **Phase 19: Baseline & Score Filtering** - Reproducible MRR baseline, RRF threshold bug fix, prompt versioning, chunk validation, mode-aware score filtering
- [ ] **Phase 20: Prompt Engineering** - Better chunk boundaries and summaries via few-shot examples, class grouping, intent-focused summaries, quality scoring, A/B comparison
- [ ] **Phase 21: Dashboard Tuning Views** - Chunk inspector, score distributions, filtering effectiveness, prompt version comparison

## Phase Details

### Phase 19: Baseline & Score Filtering

**Goal**: All measurement infrastructure is in place — reproducible baseline established, RRF score bug fixed, prompt versioning tracks changes, and mode-aware filtering stops dropping valid results
**Depends on**: Phase 18 (v1.1 complete)
**Requirements**: BASE-01, BASE-02, BASE-03, BASE-04, FILT-01
**Success Criteria** (what must be TRUE):

1. Running benchmark with temperature=0 produces consistent MRR within ±0.01 across 3 consecutive runs on frozen corpus
2. Hybrid and RRF search modes return results instead of silently filtering everything (mode-appropriate thresholds applied)
3. Each LLM-chunked collection stores prompt version hash in metadata; developer can identify which prompt version produced any chunk
4. Running chunk validation on an LLM-indexed collection reports any source lines that are missing or duplicated across chunks
5. Score filtering applies different default thresholds per search mode: dense (~0.3 cosine), hybrid (~0.0 rank-based), multi-collection RRF (~0.0 rank-based)
   **Plans**: TBD

### Phase 20: Prompt Engineering

**Goal**: LLM chunking produces higher-quality chunks with better boundaries and intent-focused summaries, measurably improving MRR toward 0.7
**Depends on**: Phase 19 (baseline + versioning required)
**Requirements**: PRMT-01, PRMT-02, PRMT-03, PRMT-04, PRMT-05
**Success Criteria** (what must be TRUE):

1. Chunking prompt includes few-shot examples showing good and bad boundary detection; classes are never split from their methods
2. LLM chunks enforce minimum size (5+ lines) and keep class methods grouped with their class definition
3. Chunk summaries describe what code does using domain terminology (not "this function takes X and returns Y" syntax descriptions)
4. Each chunk summary receives a heuristic quality score; developer can identify low-quality summaries for diagnosis
5. Developer can run CLI comparison of two prompt versions on the same corpus and see per-query MRR deltas side-by-side
   **Plans**: TBD

### Phase 21: Dashboard Tuning Views

**Goal**: Developer has visual tools to inspect chunking quality, analyze score distributions, and attribute MRR improvements to specific prompt versions
**Depends on**: Phase 19 (score data), Phase 20 (prompt versions + chunk quality data)
**Requirements**: DTUN-01, DTUN-02, DTUN-03, DTUN-04
**Success Criteria** (what must be TRUE):

1. Dashboard shows individual chunks with line boundaries, prose summaries, and quality scores alongside syntax-highlighted source code
2. Dashboard shows histogram of top-50 candidate scores with threshold boundary line clearly marking returned vs filtered zones
3. Dashboard shows returned results alongside near-miss filtered results (just below threshold) with score comparison for diagnosis
4. Dashboard links benchmark MRR results to prompt versions so developer can see which prompt version produced which MRR score over time
   **Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 19 → 20 → 21

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
| 12. LLM Chunking Spike                        | v1.1      | 1/1            | Complete    | 2026-04-10 |
| 13. Pipeline Refactoring & Parallel Embedding | v1.1      | 3/3            | Complete    | 2026-04-10 |
| 14. LLM Chunking Implementation & CLI         | v1.1      | 4/4            | Complete    | 2026-04-14 |
| 15. Multi-Collection Search & MCP Integration | v1.1      | 2/2            | Complete    | 2026-04-14 |
| 16. Dashboard Search                          | v1.1      | 3/3            | Complete    | 2026-04-14 |
| 17. Dashboard Search History                  | v1.1      | 2/2            | Complete    | 2026-04-15 |
| 18. Dashboard Analytics                       | v1.1      | 2/2            | Complete    | 2026-04-15 |
| 19. Baseline & Score Filtering                | v1.2      | 0/?            | Not started | -          |
| 20. Prompt Engineering                        | v1.2      | 0/?            | Not started | -          |
| 21. Dashboard Tuning Views                    | v1.2      | 0/?            | Not started | -          |
