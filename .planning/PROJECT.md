# ia-framework

## What This Is

A TypeScript monorepo that helps developers use AI to build features in existing large projects. It is a **standalone tool** — cloned and run independently from the target project. It provides a one-shot installer (`./install.sh`) that auto-detects the target project's stack, sets up local RAG via Qdrant in Docker, and integrates with OpenCode through MCP servers and auto-context injection. A monitoring dashboard tracks token usage, indexing status, and RAG quality benchmarks. GSD workflows run inside the target project directory, and all GSD-generated artifacts (.planning/, AGENTS.md) belong to the target project — not the framework.

## Core Value

AI that actually understands the codebase — better context means better code output.

## Current Milestone: v1.1 — RAG Quality & Dashboard Evolution

**Goal:** Improve RAG retrieval quality (MRR > 0.7) through LLM-based chunking, parallel embedding, systematic strategy optimization, and dashboard analytics with interactive search.

**Target features:**

- LLM-based chunking as alternative indexing strategy (model-agnostic, local Ollama, spike first)
- Parallel/multi-threaded embedding for indexing speed
- Dashboard search area with per-search metrics, A/B comparison, and search history
- Full analytics suite in dashboard (chunk, embedding, retrieval stats)
- Systematic RAG tuning targeting MRR > 0.7
- All improvements flow through existing MCP tools — agents get better context automatically
- MCP search tools query both AST and LLM collections, results tagged by source

## Requirements

### Validated

<!-- Shipped in v1.0 and confirmed valuable. -->

- [x] One-shot installer (`./install.sh`) checks environment, installs missing tools, sets up Docker services — v1.0
- [x] Project profile auto-detection (language, framework, package manager, test runner, build/dev commands) — v1.0
- [x] Developer confirmation/correction of detected profile — v1.0
- [x] Qdrant in Docker for vector storage — v1.0
- [x] AST-aware codebase indexing with language-specific parsing strategies — v1.0
- [x] Provider-agnostic embedding support (cloud LLMs, local models via Ollama) — v1.0
- [x] Semantic search with dependency graph expansion for context retrieval — v1.0
- [x] MCP server for OpenCode — explicit RAG queries — v1.0
- [x] Configurable retrieval mode (MCP-only, auto-context, both) — v1.0
- [x] GSD workflows extended with RAG context at planning and execution steps — v1.0
- [x] Database connection (read-write) — developer provides location during install — v1.0
- [x] Monitoring dashboard (Docker) — token usage, indexing status, project profile view — v1.0
- [x] End-to-end benchmark system — retrieval precision metrics (Hit@K, MRR) — v1.0
- [x] Benchmark comparison across embedding models, chunking strategies, and retrieval modes — v1.0
- [x] Benchmark history visualization in dashboard with score trends — v1.0
- [x] Project config file (`.ia-framework/project.json`) synced to dashboard — v1.0
- [x] Hybrid BM25+dense search with RRF fusion — v1.0
- [x] 30-query benchmark corpus with balanced coverage — v1.0

### Active

<!-- v1.1 scope — building toward these. -->

- [ ] LLM-based chunking as alternative indexing strategy (model-agnostic, local Ollama)
- [ ] LLM generates prose summary per chunk before embedding (stored + prepended)
- [ ] Parallel/multi-threaded embedding for indexing speed
- [ ] Separate Qdrant collections per indexing strategy (AST vs LLM)
- [ ] CLI strategy selection: AST (tree-sitter) or LLM (Ollama) at index time
- [ ] CLI interactive Ollama model selection when configured model is missing
- [x] MCP search tools (`search_codebase`, `search_codebase_hybrid`) query both collections — Validated in Phase 15: multi-collection-search-mcp-integration
- [x] MCP search results tagged with source strategy (ast/llm) and unified ranking — Validated in Phase 15: multi-collection-search-mcp-integration
- [x] Dashboard search area: query input, ranked results with inline scores and match type — Validated in Phase 16: dashboard-search
- [x] Dashboard per-search metrics panel: tokens, latency, chunk count, score distribution — Validated in Phase 16: dashboard-search
- [x] Dashboard A/B strategy comparison: same query against AST vs LLM collections — Validated in Phase 16: dashboard-search
- [ ] Dashboard search history: persistent log with metrics, filterable, comparable
- [ ] Dashboard analytics suite: chunk stats, embedding stats, retrieval stats (aggregate)
- [ ] Better dashboard visualization: improved charts, filters, time ranges
- [ ] RAG quality target: MRR > 0.7 through systematic strategy optimization

### Out of Scope

- Auto-context injection mode — deferred to v2 (OpenCode lacks MCP Resources/Prompts support)
- Cloud LLM for chunking — deferred to v3 (v1.1 focuses on local Ollama only)
- Jira integration (watching board, updating status) — deferred to v2, v1 focuses on RAG quality
- Full TDD enforcement on target projects — deferred to v2, framework itself follows TDD
- Proactive Jira board watching and task suggestion — deferred to v2
- Multi-project support — one project first, generalize later
- OAuth/team features — internal tool, no auth needed
- Mobile interface — OpenCode (terminal) is the primary interface
- npm/binary distribution — git clone is sufficient for internal use

## Context

The problem: developers using AI to build features in large codebases get poor results because the AI lacks context about the project's architecture, patterns, and conventions. Developers compensate by manually feeding context, which is tedious and still produces code that doesn't fit the project's style.

This framework solves the context problem through local RAG — the codebase is indexed with AST-aware parsing, stored in Qdrant, and retrieved automatically when the developer prompts for features. The retrieval uses semantic search first, then expands to dependency graph to ensure the AI sees not just relevant code but also the types, interfaces, and utilities it depends on.

The framework is distributed as a git repo. Developers clone it anywhere and run `./install.sh`, which asks for the target project path, detects the project profile (language, framework, test runner, commands), sets up Qdrant in Docker, indexes the codebase, and configures OpenCode integration. The framework lives outside the target project — it points at codebases but never installs itself inside them. GSD workflows run in the target project's working directory, and all GSD artifacts (.planning/, AGENTS.md) are committed to the target project's repo.

The monitoring dashboard (also Docker) provides visibility into indexing health, token consumption, and — critically — RAG quality benchmarks. When developers change the embedding model or chunking strategy, they can run end-to-end benchmarks that measure whether AI output actually compiles and passes tests, then see the score trend over time.

**Target:** Internal tool for one specific large project. Built to be reusable but not generalized yet.

**Primary interface:** OpenCode — the framework provides infrastructure (RAG, MCP servers), OpenCode provides the AI interaction layer.

## Constraints

- **Language**: TypeScript — all components (installer logic, MCP servers, dashboard, benchmark runner)
- **Testing**: Vitest with TDD — tests written before implementation for all framework code (ecosystem-aligned, zero-config for TS monorepos)
- **TDD with Human Gate**: Test → Human Verification → Implementation for ALL work (features, fixes, hotfixes). No implementation begins until tests are reviewed and approved by the developer.
- **Git Workflow**: Branch from main → work on feature branch → PR → human merges. Never auto-merge PRs.
- **Code Quality**: ESLint + Prettier + strict TypeScript + architectural rules (no circular deps, layer boundaries)
- **README Sync**: README.md must be updated after any user-facing changes, especially CLI commands
- **CLAUDE.md Sync**: Any MCP tool/command change → update `agents inject` RAG_CONTENT → re-inject into target project's CLAUDE.md
- **Infrastructure**: Docker required — Qdrant and dashboard run as containers
- **Interface**: OpenCode is the primary developer interface — framework provides tools, not UI for coding
- **Distribution**: Git repo — developers clone and run `./install.sh`
- **Repository**: Monorepo — all components co-located
- **Internal**: No public package registry, no auth system, no multi-tenancy

## Key Decisions

| Decision                                                    | Rationale                                                                                                                                                           | Outcome                                        |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Qdrant for vector storage                                   | Mature, Docker-native, good TypeScript client, runs locally                                                                                                         | ✅ Validated — v1.0                            |
| Provider-agnostic embeddings                                | Let developers choose LLM/embedding provider (cloud or local)                                                                                                       | ✅ Validated — v1.0                            |
| Monorepo structure                                          | All components co-located, simpler dependency management                                                                                                            | ✅ Validated — v1.0                            |
| MCP + auto-context (configurable)                           | Both retrieval modes available, benchmarkable against each other                                                                                                    | ✅ Validated — v1.0 (auto-context deferred v2) |
| Clone anywhere + install script                             | No npm publish needed, simple distribution for internal tool                                                                                                        | ✅ Validated — v1.0                            |
| Standalone architecture                                     | Framework lives outside target project, GSD artifacts belong to target                                                                                              | ✅ Validated — v1.0                            |
| AST-aware + dependency graph                                | Better retrieval than generic text chunking — understands code structure                                                                                            | ✅ Validated — v1.0                            |
| Jest for testing                                            | Widely used, good TypeScript support, team familiarity                                                                                                              | ❌ Replaced — Vitest adopted                   |
| Vitest over Jest                                            | Ecosystem-aligned (all deps use Vitest), zero-config for TS monorepos, same API                                                                                     | ✅ Validated — v1.0                            |
| Dual-vector search                                          | Text + code embeddings per point — avoids missing ~40% of queries                                                                                                   | ✅ Validated — v1.0                            |
| Full code quality enforcement                               | Framework practices what it preaches — clean code standards                                                                                                         | ✅ Validated — v1.0                            |
| Dashboard for benchmarks                                    | Visual benchmark history more actionable than CLI output                                                                                                            | ✅ Validated — v1.0                            |
| LLM chunking model: llama3.2 (3.2B) not qwen2.5-coder (14B) | 14B model caused OOM/crashes on large files; 3.2B is 4-5x faster within latency budget                                                                              | ✅ Validated — Phase 12 spike                  |
| LLM chunking: opt-in enhancement, not AST replacement       | Mean latency ~24.6s/file → 205+ min for 500 files; AST remains the fast default path                                                                                | ✅ Validated — Phase 12 spike                  |
| clampedPow2 numCtx auto-sizing                              | Fixed 32K KV cache wastes VRAM on small files; dynamic sizing = 4-5x memory efficiency                                                                              | ✅ Validated — Phase 12 spike                  |
| DependencyGraph.getNeighborFiles sync/async mismatch        | DependencyGraph returns sync string[]; SearchEngineConfig expects async — wrapped with Promise.resolve() adapter in server.ts rather than modifying DependencyGraph | ✅ Validated — Phase 16: dashboard-search      |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):

1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):

1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---

_Last updated: 2026-04-14 — Phase 16 (dashboard-search) complete. Dashboard now has a full search page at /rag/search: SearchBar with collection selector (AST/LLM/both), ranked results with file paths, scores, and inline code previews, per-query MetricsPanel (latency, chunks scanned, score distribution chart), and A/B comparison layout for side-by-side AST vs LLM ranking. Backend adds POST /api/search and GET /api/search/collections routes wired into DI. Requirements DASH-07, DASH-08, DASH-09, DASH-10 validated. Next: Phase 17 (dashboard-search-history)._
