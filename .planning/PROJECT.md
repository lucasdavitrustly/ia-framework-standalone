# ia-framework

## What This Is

A TypeScript monorepo that helps developers use AI to build features in existing large projects. It is a **standalone tool** — cloned and run independently from the target project. It provides a one-shot installer (`./install.sh`) that auto-detects the target project's stack, sets up local RAG via Qdrant in Docker, and integrates with OpenCode through MCP servers and auto-context injection. A monitoring dashboard tracks token usage, indexing status, and RAG quality benchmarks. GSD workflows run inside the target project directory, and all GSD-generated artifacts (.planning/, AGENTS.md) belong to the target project — not the framework.

## Core Value

AI that actually understands the codebase — better context means better code output.

## Current State: Phase 37 complete (2026-05-15)

**Latest:** Phase 37 — Query complexity classifier routes queries as keyword/semantic, integrated into MCP search handlers.

**What shipped (v1.4, 2026-04-30):**

- Relevance threshold with configurable score filtering and empty-result signaling
- Hierarchy-aware chunking — class inheritance/decorator metadata in AST chunks
- Query intent classification with MMR reranking and query-type-aware λ
- Adaptive retrieval depth — zero-result fallback chain (semantic → hybrid → BM25 keyword)
- Adaptive decorator chunking — decorators/annotations preserved with their annotated elements
- Dynamic retrieval cost cap — 6000-token soft budget with 70/30 split for hierarchy expansion

**Status:** 35 phases, 86 plans shipped across 5 milestones (v1.0–v1.4). 29,703 LOC TypeScript.

## Previous Milestones

**v1.3 — RAG Quality Improvements (SHIPPED 2026-04-29):** Java AST-aware chunking, zero-result fallback search, Maven multi-module dependency graph, RAG-to-action prompt templates, hallucination penalty calibration, benchmark model lock enforcement.

**v1.2 — Tuning & Observability (SHIPPED 2026-04-29):** Mode-aware score filtering, reproducible MRR baseline, prompt version tracking, LLM chunking prompt engineering, chunk quality scoring, dashboard Tuning page.

**v1.1 — LLM Chunking (SHIPPED):** LLM-based chunking strategy via Ollama, parallel embedding, multi-collection search, dashboard search/history/analytics pages.

**v1.0 — MVP (SHIPPED):** Full RAG pipeline, installer, MCP server, dashboard, benchmark system.

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
- [x] LLM-based chunking as alternative indexing strategy via Ollama — v1.1
- [x] LLM generates prose summary per chunk before embedding — v1.1
- [x] Parallel/multi-threaded embedding for indexing speed — v1.1
- [x] Separate Qdrant collections per indexing strategy (AST vs LLM) — v1.1
- [x] CLI strategy selection and interactive Ollama model management — v1.1
- [x] MCP search tools query both AST and LLM collections with RRF merging — v1.1
- [x] Dashboard search page with A/B comparison, per-query metrics — v1.1
- [x] Dashboard search history with replay, filtering, comparison — v1.1
- [x] Dashboard analytics suite: strategy comparison, quality trends, token breakdowns — v1.1
- [x] Mode-aware score filtering (RRF/hybrid use rank-based ~0.0 threshold, not cosine 0.3) — v1.2
- [x] Reproducible MRR baseline with 3-run averaging and stddev reporting — v1.2
- [x] Prompt version tracking with hash-based cache keys and `ia-framework prompt bump` CLI — v1.2
- [x] Chunk overlap/gap detection auto-wired into LLM chunking pipeline — v1.2
- [x] LLM chunking prompt with few-shot examples, class grouping rules, 5-line minimum — v1.2
- [x] Chunk summary quality scoring (0-100 heuristic stored as Qdrant metadata) — v1.2
- [x] `ia-framework prompt compare` CLI for side-by-side MRR delta across prompt versions — v1.2
- [x] Dashboard Tuning page: ChunkInspector, PromptVersionChart, Score Distribution histogram — v1.2
- [x] Java AST-aware chunking at class/method boundaries with class preamble context — v1.3
- [x] Zero-result fallback search: semantic → hybrid → BM25 keyword chain with suggestions — v1.3
- [x] Maven multi-module dependency graph with `get_module_dependencies` MCP tool — v1.3
- [x] RAG-to-action prompt templates for impact/change-analysis query patterns — v1.3
- [x] Hallucination Check dimension in benchmark judge (penalizes fabricated entities) — v1.3
- [x] Benchmark model lock enforcement with `--strict-model` and `validate-models` CLI — v1.3
- [x] Relevance threshold with configurable score filtering and empty-result signaling — v1.4
- [x] Hierarchy-aware chunking for class trees with inheritance/decorator metadata — v1.4
- [x] Query intent classification with MMR reranking and query-type-aware λ — v1.4
- [x] Adaptive retrieval depth via semantic → hybrid → BM25 fallback chain — v1.4
- [x] Adaptive decorator chunking — decorators/annotations co-chunked with annotated elements — v1.4
- [x] Dynamic retrieval cost cap — 6000-token soft budget with 70/30 hierarchy/direct split — v1.4

### Active

<!-- v1.5 scope — to be defined in next milestone planning -->

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

This framework solves the context problem through local RAG — the codebase is indexed with AST-aware parsing (TypeScript, Python, Java), stored in Qdrant, and retrieved automatically when the developer prompts for features. The retrieval uses semantic search first, then expands to dependency graph, and now includes zero-result fallback (semantic → hybrid → BM25 keyword chain) and RAG-to-action prompt templates for impact analysis queries.

The framework is distributed as a git repo. Developers clone it anywhere and run `./install.sh`, which asks for the target project path, detects the project profile (language, framework, test runner, commands), sets up Qdrant in Docker, indexes the codebase, and configures OpenCode integration. The framework lives outside the target project — it points at codebases but never installs itself inside them. GSD workflows run in the target project's working directory, and all GSD artifacts (.planning/, AGENTS.md) are committed to the target project's repo.

The monitoring dashboard (also Docker) provides visibility into indexing health, token consumption, and RAG quality benchmarks. v1.2 added a dedicated Tuning page with ChunkInspector, score distribution histograms, and prompt version comparison charts. The benchmark system now supports model lock enforcement (`--strict-model`) to prevent contaminated benchmark results.

**Current state (v1.4 complete):** 35 phases, 86 plans shipped across 5 milestones. 29,703 LOC TypeScript. Retrieval stack now includes: relevance threshold filtering, hierarchy-aware chunking, query intent classification (MMR + query-type λ), adaptive fallback depth, decorator-aware chunking, and per-call token budget cap.

**Target:** Internal tool for one specific large project (Java/Spring Boot payment gateway). Built to be reusable but not generalized yet.

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
| Mode-aware score thresholds (P0 fix)                        | RRF/hybrid return rank-based scores (0.01-0.03) — applying cosine threshold 0.3 silently dropped ALL results; fixed with mode-specific defaults (0.0 for RRF)       | ✅ Validated — Phase 19                        |
| Prompt version in cache key                                 | hash:model format couldn't distinguish prompt changes; extended to hash:model:version to enable controlled A/B experiments                                          | ✅ Validated — Phase 19                        |
| Few-shot examples via configurable file loader              | Hardcoded examples in prompt string = uneditable; separate JSON file loaded at runtime = user-configurable without forking                                          | ✅ Validated — Phase 20                        |
| Java class preamble in each method chunk                    | Method chunks without class context are meaningless in isolation; prepending package+imports+class signature makes each chunk self-contained                        | ✅ Validated — Phase 22                        |
| Semantic → hybrid → BM25 fallback chain                     | Zero results from semantic = confusing blank response; cascading fallback with keyword suggestions degrades gracefully                                              | ✅ Validated — Phase 23                        |
| fast-xml-parser for POM parsing                             | DOMParser unavailable in Node.js; fast-xml-parser is zero-dependency, handles Maven namespace quirks                                                                | ✅ Validated — Phase 24                        |
| Hallucination Check as 0/5 binary dimension                 | Partial credit for hallucinations muddies the signal; binary zero for any fabricated entity makes the penalty unambiguous                                           | ✅ Validated — Phase 26                        |
| Model lock enforcement as opt-in `--strict-model` flag      | Always-abort would break iterative workflows; opt-in flag serves CI use case without disrupting normal development                                                  | ✅ Validated — Phase 27                        |
| MMR λ tuned by query type                                   | Broad/exploratory queries need diversity (low λ), navigational/specific queries need precision (high λ); classifier routes automatically                            | ✅ Validated — Phase 28                        |
| Synonym expansion for zero-result path                      | Users query for concepts not in codebase; expanding to related terms surfaces real indexed content rather than empty results                                        | ✅ Validated — Phase 29                        |
| Decorator chunks co-located with annotated element          | Decorators in isolation are meaningless; fusing @Controller + method into single chunk preserves semantic unit for retrieval                                        | ✅ Validated — Phase 30                        |
| 6000-token default cap with 70/30 budget split              | Unbounded retrieval wastes LLM context; 70% to direct results, 30% to hierarchy expansion prevents hierarchy expansion from crowding out primary results            | ✅ Validated — Phase 31                        |

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

_Last updated: 2026-05-15 after Phase 37 completion_
