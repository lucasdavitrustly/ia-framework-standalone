# Requirements: ia-framework

**Defined:** 2026-03-31
**Core Value:** AI that actually understands the codebase — better context means better code output.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Installation

- [ ] **INST-01**: Developer can clone the framework repo anywhere and run `./install.sh` to start setup
- [ ] **INST-02**: Installer detects missing prerequisite tools (Docker, OpenCode, Node.js, Ollama) and installs them automatically
- [ ] **INST-03**: Installer skips tools that are already installed on the developer's machine
- [ ] **INST-04**: Installer asks the developer for the target project path and configures the framework to point at it
- [x] **INST-05**: Installer auto-detects target project's language, framework, package manager, test runner, build/dev commands, and project structure
- [x] **INST-06**: Developer can confirm, correct, or extend the detected project profile
- [x] **INST-07**: Installer writes framework config to `.ia-framework/project.json` (stored in the framework, not the target project)
- [ ] **INST-08**: Installer spins up Qdrant Docker container with named volumes and correct ulimit settings
- [ ] **INST-09**: Installer triggers initial codebase indexing after setup completes
- [ ] **INST-10**: Installer configures OpenCode MCP server integration automatically
- [ ] **INST-11**: If framework is already installed, developer can run individual components (dashboard, re-indexing, benchmarks) without re-running full installer

### Architecture

- [x] **ARCH-01**: Framework is a standalone tool that lives outside the target project — it is never installed inside the target codebase
- [x] **ARCH-02**: GSD workflows run inside the target project directory, and all GSD-generated artifacts (.planning/, AGENTS.md) belong to the target project
- [x] **ARCH-03**: Framework can be pointed at any codebase regardless of language or framework

### Indexing

- [ ] **INDX-01**: Framework indexes codebase into Qdrant vector storage
- [ ] **INDX-02**: Indexing uses AST-aware chunking via tree-sitter (function/class/interface boundaries)
- [ ] **INDX-03**: Indexing supports provider-agnostic local embeddings (Ollama, local models)
- [ ] **INDX-04**: Indexing uses dual-vector storage (text embedding + code embedding per point)
- [ ] **INDX-05**: Indexing builds a dependency graph (imports, type references, function calls) during parsing
- [ ] **INDX-06**: Incremental re-indexing detects changed files via git diff and only re-indexes those
- [ ] **INDX-07**: Indexing respects .gitignore and skips irrelevant files (node_modules, build output, etc.)
- [ ] **INDX-08**: All indexing runs fully locally — no codebase data is sent to external services

### Retrieval

- [ ] **RETR-01**: Developer can query indexed codebase via semantic search and get relevant code results
- [ ] **RETR-02**: MCP server exposes RAG tools (search_codebase, get_file, get_dependencies) for OpenCode
- [ ] **RETR-03**: Retrieval expands results 1-2 hops along the dependency graph to include types, interfaces, and utilities
- [ ] **RETR-04**: Auto-context mode prepends relevant codebase context to prompts automatically
- [ ] **RETR-05**: Developer can configure retrieval mode: MCP-only, auto-context, or both
- [ ] **RETR-06**: All retrieval runs fully locally — queries and results never leave the developer's machine

### Observability

- [ ] **OBSV-01**: Every RAG interaction (query, retrieval, context injection) is logged with token counts
- [ ] **OBSV-02**: Token usage is tracked per-query (tokens consumed per retrieval)
- [ ] **OBSV-03**: Token usage is tracked per-session (total RAG tokens across a coding session)
- [ ] **OBSV-04**: Token usage is tracked per-strategy (cost comparison between retrieval modes)
- [ ] **OBSV-05**: RAG interaction logs are stored locally in SQLite for dashboard consumption

### Benchmarking

- [ ] **BNCH-01**: Developer can run end-to-end benchmarks that measure AI output quality (compile + test pass rate)
- [ ] **BNCH-02**: Benchmarks compare across embedding models, chunking strategies, and retrieval modes
- [ ] **BNCH-03**: Benchmark runs are stored with timestamps and config snapshots for historical comparison
- [ ] **BNCH-04**: Benchmark includes a no-RAG baseline to prove RAG actually helps
- [ ] **BNCH-05**: Benchmarks use a fixed Top-K and the same deterministic query set every run so results are comparable
- [ ] **BNCH-06**: Developer can add custom evaluation queries to the benchmark suite to check RAG accuracy for their specific codebase
- [ ] **BNCH-07**: Developer can trigger re-indexing with a different LLM or strategy and benchmark the difference from the dashboard

### Dashboard

- [ ] **DASH-01**: Monitoring dashboard runs as a Docker container accessible via browser
- [ ] **DASH-02**: Dashboard shows indexing status (progress, coverage, last update time)
- [ ] **DASH-03**: Dashboard shows token usage trends (charts over time)
- [ ] **DASH-04**: Dashboard shows benchmark history with score trend visualization
- [ ] **DASH-05**: Dashboard shows detected project profile
- [ ] **DASH-06**: Dashboard syncs with `.ia-framework/project.json` config file

### Database

- [ ] **DBAS-01**: Developer provides database connection details during installation
- [ ] **DBAS-02**: Framework indexes database schema (tables, columns, types, relationships) as context
- [ ] **DBAS-03**: Database connection supports read-write operations for AI to query and understand data

### Workflow Integration

- [ ] **WKFL-01**: GSD planning phases automatically inject relevant architectural context from RAG
- [ ] **WKFL-02**: GSD execution phases automatically inject relevant code context from RAG
- [ ] **WKFL-03**: GSD workflows can use online LLMs for reasoning and code generation

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

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

| Feature | Reason |
|---------|--------|
| Own IDE / editor | OpenCode is the primary interface — framework provides infrastructure, not UI |
| Code completion / autocomplete | AI client's responsibility — framework improves context, not suggestions |
| Own chat interface | OpenCode has full TUI chat — building another is redundant |
| Multi-tenancy / authentication | Internal single-user tool — no auth needed |
| npm / binary distribution | Git clone + ./install.sh sufficient for internal use |
| Proactive task suggestion | Unreliable without deep understanding — be reactive, not intrusive |
| Cloud-hosted RAG | RAG must run fully locally for codebase privacy |
| Sending codebase to external APIs | Privacy constraint — only GSD reasoning uses online LLMs |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| INST-01 | Phase 5 | Pending |
| INST-02 | Phase 5 | Pending |
| INST-03 | Phase 5 | Pending |
| INST-04 | Phase 5 | Pending |
| INST-05 | Phase 2 | Complete |
| INST-06 | Phase 2 | Complete |
| INST-07 | Phase 2 | Complete |
| INST-08 | Phase 5 | Pending |
| INST-09 | Phase 5 | Pending |
| INST-10 | Phase 5 | Pending |
| INST-11 | Phase 5 | Pending |
| ARCH-01 | Phase 1 | Complete |
| ARCH-02 | Phase 1 | Complete |
| ARCH-03 | Phase 1 | Complete |
| INDX-01 | Phase 3 | Pending |
| INDX-02 | Phase 3 | Pending |
| INDX-03 | Phase 3 | Pending |
| INDX-04 | Phase 3 | Pending |
| INDX-05 | Phase 3 | Pending |
| INDX-06 | Phase 3 | Pending |
| INDX-07 | Phase 3 | Pending |
| INDX-08 | Phase 3 | Pending |
| RETR-01 | Phase 4 | Pending |
| RETR-02 | Phase 4 | Pending |
| RETR-03 | Phase 10 | Pending |
| RETR-04 | Phase 10 | Pending |
| RETR-05 | Phase 10 | Pending |
| RETR-06 | Phase 4 | Pending |
| OBSV-01 | Phase 6 | Pending |
| OBSV-02 | Phase 6 | Pending |
| OBSV-03 | Phase 6 | Pending |
| OBSV-04 | Phase 6 | Pending |
| OBSV-05 | Phase 6 | Pending |
| BNCH-01 | Phase 7 | Pending |
| BNCH-02 | Phase 7 | Pending |
| BNCH-03 | Phase 7 | Pending |
| BNCH-04 | Phase 7 | Pending |
| BNCH-05 | Phase 7 | Pending |
| BNCH-06 | Phase 7 | Pending |
| BNCH-07 | Phase 8 | Pending |
| DASH-01 | Phase 8 | Pending |
| DASH-02 | Phase 8 | Pending |
| DASH-03 | Phase 8 | Pending |
| DASH-04 | Phase 8 | Pending |
| DASH-05 | Phase 8 | Pending |
| DASH-06 | Phase 8 | Pending |
| DBAS-01 | Phase 9 | Pending |
| DBAS-02 | Phase 9 | Pending |
| DBAS-03 | Phase 9 | Pending |
| WKFL-01 | Phase 10 | Pending |
| WKFL-02 | Phase 10 | Pending |
| WKFL-03 | Phase 10 | Pending |

**Coverage:**
- v1 requirements: 52 total
- Mapped to phases: 52
- Unmapped: 0

---
*Requirements defined: 2026-03-31*
*Last updated: 2026-03-31 after additions (standalone architecture, post-install mode, deterministic benchmarks, custom queries)*
