# Requirements: ia-framework

**Defined:** 2026-03-31
**Core Value:** AI that actually understands the codebase — better context means better code output.

## v1.0 Requirements (Complete)

Requirements shipped in v1.0. All verified and complete unless noted.

### Installation

- [x] **INST-01**: Developer can clone the framework repo anywhere and run `./install.sh` to start setup
- [x] **INST-02**: Installer detects missing prerequisite tools (Docker, OpenCode, Node.js, Ollama) and installs them automatically
- [x] **INST-03**: Installer skips tools that are already installed on the developer's machine
- [x] **INST-04**: Installer asks the developer for the target project path and configures the framework to point at it
- [x] **INST-05**: Installer auto-detects target project's language, framework, package manager, test runner, build/dev commands, and project structure
- [x] **INST-06**: Developer can confirm, correct, or extend the detected project profile
- [x] **INST-07**: Installer writes framework config to `.ia-framework/project.json` (stored in the framework, not the target project)
- [x] **INST-08**: Installer spins up Qdrant Docker container with named volumes and correct ulimit settings
- [x] **INST-09**: Installer triggers initial codebase indexing after setup completes
- [x] **INST-10**: Installer configures OpenCode MCP server integration automatically
- [x] **INST-11**: If framework is already installed, developer can run individual components (dashboard, re-indexing, benchmarks) without re-running full installer
- [x] **INST-12**: Installer configures Context7 and Sequential Thinking MCP servers in OpenCode if not already present

### Architecture

- [x] **ARCH-01**: Framework is a standalone tool that lives outside the target project — it is never installed inside the target codebase
- [x] **ARCH-02**: GSD workflows run inside the target project directory, and all GSD-generated artifacts (.planning/, AGENTS.md) belong to the target project
- [x] **ARCH-03**: Framework can be pointed at any codebase regardless of language or framework

### Indexing

- [x] **INDX-01**: Framework indexes codebase into Qdrant vector storage
- [x] **INDX-02**: Indexing uses AST-aware chunking via tree-sitter (function/class/interface boundaries)
- [x] **INDX-03**: Indexing supports provider-agnostic local embeddings (Ollama, local models)
- [x] **INDX-04**: Indexing uses dual-vector storage (text embedding + code embedding per point)
- [x] **INDX-05**: Indexing builds a dependency graph (imports, type references, function calls) during parsing
- [x] **INDX-06**: Incremental re-indexing detects changed files via git diff and only re-indexes those
- [x] **INDX-07**: Indexing respects .gitignore and skips irrelevant files (node_modules, build output, etc.)
- [x] **INDX-08**: All indexing runs fully locally — no codebase data is sent to external services
- [x] **INDX-09**: Indexing supports Java as a default language alongside TypeScript and Python — tree-sitter-java grammar is pulled during installation

### Retrieval

- [x] **RETR-01**: Developer can query indexed codebase via semantic search and get relevant code results
- [x] **RETR-02**: MCP server exposes RAG tools (search_codebase, get_file, get_dependencies) for OpenCode
- [x] **RETR-03**: Retrieval expands results 1-2 hops along the dependency graph to include types, interfaces, and utilities
- [ ] **RETR-04**: Auto-context mode prepends relevant codebase context to prompts automatically — Deferred to v2
- [x] **RETR-05**: Developer can configure retrieval mode: MCP-only, auto-context, or both
- [x] **RETR-06**: All retrieval runs fully locally — queries and results never leave the developer's machine

### Observability

- [x] **OBSV-01**: Every RAG interaction (query, retrieval, context injection) is logged with token counts
- [x] **OBSV-02**: Token usage is tracked per-query (tokens consumed per retrieval)
- [x] **OBSV-03**: Token usage is tracked per-session (total RAG tokens across a coding session)
- [x] **OBSV-04**: Token usage is tracked per-strategy (cost comparison between retrieval modes)
- [x] **OBSV-05**: RAG interaction logs are stored locally in SQLite for dashboard consumption

### Benchmarking

- [x] **BNCH-01**: Developer can run end-to-end benchmarks that measure AI output quality (compile + test pass rate)
- [x] **BNCH-02**: Benchmarks compare across embedding models, chunking strategies, and retrieval modes
- [x] **BNCH-03**: Benchmark runs are stored with timestamps and config snapshots for historical comparison
- [x] **BNCH-04**: Benchmark includes a no-RAG baseline to prove RAG actually helps
- [x] **BNCH-05**: Benchmarks use a fixed Top-K and the same deterministic query set every run so results are comparable
- [x] **BNCH-06**: Developer can add custom evaluation queries to the benchmark suite to check RAG accuracy for their specific codebase
- [x] **BNCH-07**: Developer can trigger re-indexing with a different LLM or strategy and benchmark the difference from the dashboard

### Dashboard

- [x] **DASH-01**: Monitoring dashboard runs as a Docker container accessible via browser
- [x] **DASH-02**: Dashboard shows indexing status (progress, coverage, last update time)
- [x] **DASH-03**: Dashboard shows token usage trends (charts over time)
- [x] **DASH-04**: Dashboard shows benchmark history with score trend visualization
- [x] **DASH-05**: Dashboard shows detected project profile
- [x] **DASH-06**: Dashboard syncs with `.ia-framework/project.json` config file

### Database

- [x] **DBAS-01**: Developer provides database connection details during installation
- [x] **DBAS-02**: Framework indexes database schema (tables, columns, types, relationships) as context
- [x] **DBAS-03**: Database connection supports read-write operations for AI to query and understand data

### Workflow Integration

- [x] **WKFL-01**: GSD planning phases automatically inject relevant architectural context from RAG
- [x] **WKFL-02**: GSD execution phases automatically inject relevant code context from RAG
- [x] **WKFL-03**: GSD workflows can use online LLMs for reasoning and code generation

## v1.1 Requirements

Requirements for milestone v1.1 — RAG Quality & Dashboard Evolution.

**Critical dependency:** INDX-13 (LLM chunking spike) is a GO/NO-GO gate. It must complete first. If the spike fails, LLM-specific requirements (INDX-10, INDX-11, INDX-12) are descoped and the milestone pivots.

### Indexing

- [ ] **INDX-13**: Time-boxed spike validates LLM chunking quality, latency, and Ollama structured output feasibility — GO/NO-GO gate before all other v1.1 work proceeds
- [x] **INDX-10**: Developer can index codebase using LLM-based semantic chunking via Ollama as alternative to AST
- [x] **INDX-11**: LLM chunking identifies semantic boundaries and generates prose summaries per chunk in a single pass
- [x] **INDX-12**: LLM chunking results are cached by file content hash to avoid re-processing unchanged files
- [x] **INDX-14**: Embedding pipeline processes multiple batches concurrently via p-queue
- [x] **INDX-15**: Embedding concurrency adapts to provider type (Ollama: 2-3, OpenAI: 5-10)
- [x] **INDX-16**: Indexing pipeline emits progress events (phase, completed, total) for CLI and dashboard consumption
- [x] **INDX-17**: Embedding concurrency is configurable via project.json

### Retrieval

- [x] **RETR-07**: Each indexing strategy stores chunks in a separate Qdrant collection ({project}-ast, {project}-llm)
- [x] **RETR-08**: MCP search tools (search_codebase, search_codebase_hybrid) query all active collections
- [x] **RETR-09**: Cross-collection results are merged via Reciprocal Rank Fusion for fair ranking
- [x] **RETR-10**: Each search result is tagged with source strategy (ast/llm) for provenance
- [x] **RETR-11**: Search works normally when only one collection exists (backward compatible)

### CLI

- [x] **CLIE-01**: Developer can select indexing strategy via `--strategy ast|llm` flag at index time
- [x] **CLIE-02**: CLI verifies configured Ollama model is available before starting LLM indexing
- [x] **CLIE-03**: CLI prompts interactive Ollama model selection when configured model is missing

### Dashboard

- [ ] **DASH-07**: Dashboard provides search page with query input, ranked results, scores, file paths, and code previews
- [ ] **DASH-08**: Dashboard search allows selecting which collection(s) to query (AST, LLM, both)
- [ ] **DASH-09**: Dashboard shows per-query metrics (latency, chunks scanned, score distribution) alongside results
- [ ] **DASH-10**: Dashboard supports A/B comparison — same query against AST vs LLM collections side-by-side
- [ ] **DASH-11**: Dashboard visualizes strategy comparison scores (MRR, P@K) via radar/bar charts
- [ ] **DASH-12**: Dashboard persists search history with results, scores, and timestamps
- [ ] **DASH-13**: Dashboard allows replaying past queries to compare results before/after re-indexing
- [ ] **DASH-14**: Dashboard search history is filterable by date, strategy, query text, minimum score
- [ ] **DASH-15**: Dashboard shows RAG quality trend charts (MRR, latency, chunk relevance over time)
- [ ] **DASH-16**: Dashboard shows aggregate strategy comparison (avg MRR, avg latency, avg chunks per strategy)
- [ ] **DASH-17**: Dashboard shows token usage breakdown by strategy (indexing vs query, per strategy)
- [ ] **DASH-18**: Dashboard shows score distribution visualizations (histograms across queries and strategies)

## v1.2 Requirements

Requirements for milestone v1.2 — Chunking Tuning & Retrieval Quality.

**Goal:** Push MRR past 0.7 through LLM chunking prompt engineering, smarter score-based filtering, and dashboard tuning visibility — all benchmark-driven.

### Baseline & Infrastructure

- [ ] **BASE-01**: RRF and hybrid search use mode-appropriate score thresholds instead of applying cosine threshold (0.3) to rank-based fusion scores
- [ ] **BASE-02**: Reproducible MRR baseline benchmark is established before any tuning changes (temperature=0, 3x averaged runs, frozen corpus)
- [ ] **BASE-03**: Prompt versioning system tracks which prompt version produced which chunks via hash-based version metadata stored with collection
- [ ] **BASE-04**: Chunk overlap/gap detection validates LLM chunks cover every source line exactly once and reports violations

### Prompt Engineering

- [ ] **PRMT-01**: Chunking prompt includes few-shot examples of good and bad boundary detection for improved chunk accuracy
- [ ] **PRMT-02**: Chunking prompt enforces class grouping rules (keep methods with class) and minimum chunk size constraints (5+ lines)
- [ ] **PRMT-03**: Chunking prompt produces intent-focused summaries with domain terminology instead of syntax descriptions
- [ ] **PRMT-04**: Summary quality scoring provides heuristic quality score per chunk summary (length check, no raw code tokens, contains purpose verbs)
- [ ] **PRMT-05**: Developer can compare two prompt versions on the same benchmark corpus via CLI with side-by-side MRR deltas and per-query breakdown

### Score Filtering

- [ ] **FILT-01**: Score filtering uses mode-aware thresholds with appropriate defaults: dense (cosine ~0.3), hybrid (rank-based ~0.0), multi-collection RRF (~0.0)

### Dashboard Tuning

- [ ] **DTUN-01**: Dashboard chunking inspector shows individual chunks with line boundaries, prose summaries, and quality scores alongside syntax-highlighted source code
- [ ] **DTUN-02**: Dashboard score distribution view shows histogram of all candidate scores (top-50) with threshold boundary line and returned/filtered zones
- [ ] **DTUN-03**: Dashboard filtering effectiveness view shows returned results vs filtered near-miss results (just below threshold) with score comparison
- [ ] **DTUN-04**: Dashboard prompt version comparison links benchmark MRR results to prompt versions for quality attribution over time

### Future (Deferred from v1.2)

- **FILT-02**: Score gap detection — cut results at natural relevance cliff between result N and N+1
- **FILT-03**: Dynamic threshold auto-tuning based on labeled relevance data
- **RANK-01**: Cross-encoder reranking model for post-retrieval re-ranking (v1.3+)
- **PRMT-06**: User-editable prompt templates (framework owns prompt quality)

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Auto-Context

- **RETR-04**: Auto-context mode prepends relevant codebase context to prompts automatically — deferred (OpenCode lacks MCP Resources/Prompts support)

### LLM Chunking Resilience

- **LCHK-01**: If LLM chunking fails for a file, fall back to AST chunking for that file in the LLM collection

### Jira Integration

- **JIRA-01**: Framework connects to Jira to read assigned tasks
- **JIRA-02**: Framework watches Jira board and suggests next tasks proactively
- **JIRA-03**: Framework updates Jira task status after feature completion

### TDD Enforcement

- **TDDE-01**: Framework generates test stubs before guiding implementation
- **TDDE-02**: Framework blocks progress until tests pass (full TDD cycle)
- **TDDE-03**: Framework validates test coverage meets threshold

### Multi-Project

- **MULT-01**: Framework supports multiple project profiles simultaneously
- **MULT-02**: Framework indexes multiple codebases with separate Qdrant collections

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature                               | Reason                                                                        |
| ------------------------------------- | ----------------------------------------------------------------------------- |
| Own IDE / editor                      | OpenCode is the primary interface — framework provides infrastructure, not UI |
| Code completion / autocomplete        | AI client's responsibility — framework improves context, not suggestions      |
| Own chat interface                    | OpenCode has full TUI chat — building another is redundant                    |
| Multi-tenancy / authentication        | Internal single-user tool — no auth needed                                    |
| npm / binary distribution             | Git clone + ./install.sh sufficient for internal use                          |
| Proactive task suggestion             | Unreliable without deep understanding — be reactive, not intrusive            |
| Cloud-hosted RAG                      | RAG must run fully locally for codebase privacy                               |
| Sending codebase to external APIs     | Privacy constraint — only GSD reasoning uses online LLMs                      |
| Cloud LLM chunking (OpenAI/Anthropic) | Deferred to v3 — v1.1 focuses on local Ollama only                            |
| Custom chunking prompt templates      | Framework owns the chunking prompt — user tweaks via config, not raw prompts  |
| Real-time re-chunking on file save    | LLM chunking is too slow for real-time — use explicit index command           |
| Automatic strategy recommendation     | Show data (A/B, analytics), let developer decide — premature automation       |
| Embedding model fine-tuning UI        | Swap models via config + benchmark — no fine-tuning infrastructure            |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

### v1.0 Traceability

| Requirement | Phase       | Status                           |
| ----------- | ----------- | -------------------------------- |
| INST-01     | Phase 5     | Complete                         |
| INST-02     | Phase 5     | Complete                         |
| INST-03     | Phase 5     | Complete                         |
| INST-04     | Phase 5     | Complete                         |
| INST-05     | Phase 2     | Complete                         |
| INST-06     | Phase 2     | Complete                         |
| INST-07     | Phase 2     | Complete                         |
| INST-08     | Phase 5     | Complete                         |
| INST-09     | Phase 5     | Complete                         |
| INST-10     | Phase 5     | Complete                         |
| INST-11     | Phase 5     | Complete                         |
| INST-12     | Phase 5     | Complete                         |
| ARCH-01     | Phase 1     | Complete                         |
| ARCH-02     | Phase 1     | Complete                         |
| ARCH-03     | Phase 1     | Complete                         |
| INDX-01     | Phase 3     | Complete                         |
| INDX-02     | Phase 3     | Complete                         |
| INDX-03     | Phase 3     | Complete                         |
| INDX-04     | Phase 3     | Complete                         |
| INDX-05     | Phase 3, 10 | Complete                         |
| INDX-06     | Phase 3     | Complete                         |
| INDX-07     | Phase 3     | Complete                         |
| INDX-08     | Phase 3     | Complete                         |
| INDX-09     | Phase 3     | Complete                         |
| RETR-01     | Phase 4     | Complete                         |
| RETR-02     | Phase 4     | Complete                         |
| RETR-03     | Phase 10    | Complete                         |
| RETR-04     | Phase 10    | Deferred (v2)                    |
| RETR-05     | Phase 10    | Complete                         |
| RETR-06     | Phase 4     | Complete                         |
| OBSV-01     | Phase 6     | Complete                         |
| OBSV-02     | Phase 6     | Complete                         |
| OBSV-03     | Phase 6     | Complete                         |
| OBSV-04     | Phase 6     | Complete                         |
| OBSV-05     | Phase 6     | Complete                         |
| BNCH-01     | Phase 7     | Partial (retrieval quality only) |
| BNCH-02     | Phase 7     | Complete                         |
| BNCH-03     | Phase 7     | Complete                         |
| BNCH-04     | Phase 7     | Complete                         |
| BNCH-05     | Phase 7     | Complete                         |
| BNCH-06     | Phase 7     | Complete                         |
| BNCH-07     | Phase 8     | Complete                         |
| DASH-01     | Phase 8     | Complete                         |
| DASH-02     | Phase 8     | Complete                         |
| DASH-03     | Phase 8     | Complete                         |
| DASH-04     | Phase 8     | Complete                         |
| DASH-05     | Phase 8     | Complete                         |
| DASH-06     | Phase 8     | Complete                         |
| DBAS-01     | Phase 9     | Complete                         |
| DBAS-02     | Phase 9     | Complete                         |
| DBAS-03     | Phase 9     | Complete                         |
| WKFL-01     | Phase 10    | Complete                         |
| WKFL-02     | Phase 10    | Complete                         |
| WKFL-03     | Phase 10    | Complete                         |

### v1.1 Traceability

| Requirement | Phase    | Status   |
| ----------- | -------- | -------- |
| INDX-13     | Phase 12 | Pending  |
| INDX-14     | Phase 13 | Complete |
| INDX-15     | Phase 13 | Complete |
| INDX-16     | Phase 13 | Complete |
| INDX-17     | Phase 13 | Complete |
| INDX-10     | Phase 14 | Complete |
| INDX-11     | Phase 14 | Complete |
| INDX-12     | Phase 14 | Complete |
| CLIE-01     | Phase 14 | Complete |
| CLIE-02     | Phase 14 | Complete |
| CLIE-03     | Phase 14 | Complete |
| RETR-07     | Phase 14 | Complete |
| RETR-08     | Phase 15 | Complete |
| RETR-09     | Phase 15 | Complete |
| RETR-10     | Phase 15 | Complete |
| RETR-11     | Phase 15 | Complete |
| DASH-07     | Phase 16 | Pending  |
| DASH-08     | Phase 16 | Pending  |
| DASH-09     | Phase 16 | Pending  |
| DASH-10     | Phase 16 | Pending  |
| DASH-12     | Phase 17 | Pending  |
| DASH-13     | Phase 17 | Pending  |
| DASH-14     | Phase 17 | Pending  |
| DASH-11     | Phase 18 | Pending  |
| DASH-15     | Phase 18 | Pending  |
| DASH-16     | Phase 18 | Pending  |
| DASH-17     | Phase 18 | Pending  |
| DASH-18     | Phase 18 | Pending  |

**Coverage:**

- v1.0 requirements: 54 total (51 complete, 1 partial, 1 deferred, 1 unchecked)
- v1.1 requirements: 28 total
- v1.1 mapped to phases: 28/28 ✓
- v1.1 unmapped: 0

### v1.2 Traceability

| Requirement | Phase    | Status  |
| ----------- | -------- | ------- |
| BASE-01     | Phase 19 | Pending |
| BASE-02     | Phase 19 | Pending |
| BASE-03     | Phase 19 | Pending |
| BASE-04     | Phase 19 | Pending |
| FILT-01     | Phase 19 | Pending |
| PRMT-01     | Phase 20 | Pending |
| PRMT-02     | Phase 20 | Pending |
| PRMT-03     | Phase 20 | Pending |
| PRMT-04     | Phase 20 | Pending |
| PRMT-05     | Phase 20 | Pending |
| DTUN-01     | Phase 21 | Pending |
| DTUN-02     | Phase 21 | Pending |
| DTUN-03     | Phase 21 | Pending |
| DTUN-04     | Phase 21 | Pending |

**Coverage:**

- v1.2 requirements: 14 total
- v1.2 mapped to phases: 14/14 ✓
- v1.2 unmapped: 0

---

_Requirements defined: 2026-03-31_
_Last updated: 2026-04-22 — v1.2 roadmap created, all 14 requirements mapped to Phases 19-21_
