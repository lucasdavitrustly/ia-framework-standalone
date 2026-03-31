# Roadmap: ia-framework

## Overview

This roadmap delivers a local RAG framework for AI-assisted development in large codebases. The journey builds bottom-up: monorepo foundation → project detection → indexing pipeline → retrieval & MCP integration → installer → observability → benchmarking → dashboard → database context → advanced retrieval & workflow integration. Each phase delivers a complete, verifiable capability. The first four phases establish the core RAG pipeline (index → retrieve → serve via MCP). The installer then wraps this pipeline into a frictionless first-run experience. Observability and benchmarking add measurement infrastructure. The dashboard provides visual monitoring. Database context and advanced retrieval are refinements validated by benchmarks.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation & Infrastructure** - Monorepo scaffolding, shared types, config system, Docker + Qdrant infrastructure
- [ ] **Phase 2: Project Detection & Configuration** - Auto-detect target project's tech stack and produce confirmed profile
- [ ] **Phase 3: Indexing Pipeline** - AST-aware codebase parsing, dual-vector embedding, Qdrant storage
- [ ] **Phase 4: Retrieval & MCP Server** - Semantic search engine and MCP tools for OpenCode integration
- [ ] **Phase 5: Installation & CLI** - One-shot installer and CLI commands for frictionless setup
- [ ] **Phase 6: Observability & Metrics** - Token tracking, RAG interaction logging, SQLite metrics storage
- [ ] **Phase 7: Benchmarking System** - End-to-end RAG quality measurement with comparison and history
- [ ] **Phase 8: Monitoring Dashboard** - Browser-based visibility into system health, usage, and benchmarks
- [ ] **Phase 9: Database Context** - Database schema indexing and query support as additional AI context
- [ ] **Phase 10: Advanced Retrieval & Workflow Integration** - Dependency graph expansion, auto-context injection, GSD integration

## Phase Details

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
**Plans**: TBD

Plans:
- [ ] 01-01: TBD
- [ ] 01-02: TBD
- [ ] 01-03: TBD

### Phase 2: Project Detection & Configuration
**Goal**: Framework can auto-detect a target project's technology stack and produce a confirmed profile
**Depends on**: Phase 1
**Requirements**: INST-05, INST-06, INST-07
**Success Criteria** (what must be TRUE):
  1. Running project detection on a target codebase identifies its language, framework, package manager, test runner, and build commands
  2. Developer is shown the detected profile and can confirm, correct, or extend any field
  3. Confirmed profile is persisted to `.ia-framework/project.json` and loads correctly on next startup
**Plans**: TBD

Plans:
- [ ] 02-01: TBD
- [ ] 02-02: TBD

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
**Plans**: TBD

Plans:
- [ ] 03-01: TBD
- [ ] 03-02: TBD
- [ ] 03-03: TBD
- [ ] 03-04: TBD

### Phase 4: Retrieval & MCP Server
**Goal**: Developer can search the indexed codebase from OpenCode and get relevant code context
**Depends on**: Phase 3
**Requirements**: RETR-01, RETR-02, RETR-06
**Success Criteria** (what must be TRUE):
  1. Developer can issue a natural language query (e.g., "authentication middleware") and receive relevant code chunks ranked by similarity
  2. MCP server registers tools (search_codebase, get_file, get_dependencies) accessible from OpenCode via stdio transport
  3. Search results include file path, function/class name, and code content for each match
  4. All retrieval operations run locally — queries and results never leave the developer's machine
**Plans**: TBD

Plans:
- [ ] 04-01: TBD
- [ ] 04-02: TBD
- [ ] 04-03: TBD

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
**Plans**: TBD

Plans:
- [ ] 05-01: TBD
- [ ] 05-02: TBD
- [ ] 05-03: TBD

### Phase 6: Observability & Metrics
**Goal**: Every RAG interaction is tracked with token counts for cost visibility and optimization decisions
**Depends on**: Phase 4
**Requirements**: OBSV-01, OBSV-02, OBSV-03, OBSV-04, OBSV-05
**Success Criteria** (what must be TRUE):
  1. Every query to the RAG system logs the query text, retrieved chunks, and token count to a structured log
  2. Developer can see total tokens consumed in the current coding session
  3. Token usage is broken down by retrieval strategy (MCP-only vs auto-context vs combined) for cost comparison
  4. All metrics are stored in a local SQLite database and persist across sessions
**Plans**: TBD

Plans:
- [ ] 06-01: TBD
- [ ] 06-02: TBD

### Phase 7: Benchmarking System
**Goal**: Developer can measure and compare RAG quality across different configurations
**Depends on**: Phase 4, Phase 6
**Requirements**: BNCH-01, BNCH-02, BNCH-03, BNCH-04, BNCH-05, BNCH-06
**Success Criteria** (what must be TRUE):
  1. Running a benchmark executes coding tasks, sends them through RAG, generates AI output, and measures compile + test pass rate
  2. Benchmark includes a no-RAG baseline run to prove RAG actually helps
  3. Results are stored with timestamps and configuration snapshots for historical comparison
  4. Developer can add custom evaluation queries specific to their codebase to the benchmark suite
  5. Benchmark uses fixed Top-K and deterministic query sets so results are reproducible across runs
**Plans**: TBD

Plans:
- [ ] 07-01: TBD
- [ ] 07-02: TBD
- [ ] 07-03: TBD

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
**Plans**: TBD

Plans:
- [ ] 08-01: TBD
- [ ] 08-02: TBD
- [ ] 08-03: TBD

### Phase 9: Database Context
**Goal**: Framework can index database schema and data as additional context for AI understanding
**Depends on**: Phase 3, Phase 5
**Requirements**: DBAS-01, DBAS-02, DBAS-03
**Success Criteria** (what must be TRUE):
  1. Developer provides database connection details and the framework connects and validates the connection
  2. Database schema (tables, columns, types, relationships) is indexed as searchable context alongside code
  3. Framework can execute read-write queries against the connected database for AI to understand data patterns
**Plans**: TBD

Plans:
- [ ] 09-01: TBD
- [ ] 09-02: TBD

### Phase 10: Advanced Retrieval & Workflow Integration
**Goal**: RAG results are enhanced with dependency context and automatically injected into developer workflows
**Depends on**: Phase 4, Phase 7
**Requirements**: RETR-03, RETR-04, RETR-05, WKFL-01, WKFL-02, WKFL-03
**Success Criteria** (what must be TRUE):
  1. Retrieval results expand 1-2 hops along the dependency graph to include referenced types, interfaces, and utilities
  2. Auto-context mode automatically prepends relevant codebase context to prompts without explicit developer queries
  3. Developer can switch between MCP-only, auto-context, and combined retrieval modes via configuration
  4. GSD planning and execution phases automatically receive relevant architectural and code context from RAG
  5. GSD workflows can leverage online LLMs for reasoning while RAG provides local codebase context
**Plans**: TBD

Plans:
- [ ] 10-01: TBD
- [ ] 10-02: TBD
- [ ] 10-03: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation & Infrastructure | 0/3 | Not started | - |
| 2. Project Detection & Configuration | 0/2 | Not started | - |
| 3. Indexing Pipeline | 0/4 | Not started | - |
| 4. Retrieval & MCP Server | 0/3 | Not started | - |
| 5. Installation & CLI | 0/3 | Not started | - |
| 6. Observability & Metrics | 0/2 | Not started | - |
| 7. Benchmarking System | 0/3 | Not started | - |
| 8. Monitoring Dashboard | 0/3 | Not started | - |
| 9. Database Context | 0/2 | Not started | - |
| 10. Advanced Retrieval & Workflow Integration | 0/3 | Not started | - |
