# ia-framework

## What This Is

A TypeScript monorepo that helps developers use AI to build features in existing large projects. It provides a one-shot installer (`./install.sh`) that auto-detects the target project's stack, sets up local RAG via Qdrant in Docker, and integrates with OpenCode through MCP servers and auto-context injection. A monitoring dashboard tracks token usage, indexing status, and RAG quality benchmarks. The framework extends GSD workflows so AI-guided feature development automatically leverages codebase context.

## Core Value

AI that actually understands the codebase — better context means better code output.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] One-shot installer (`./install.sh`) checks environment, installs missing tools, sets up Docker services
- [ ] Project profile auto-detection (language, framework, package manager, test runner, build/dev commands, project structure)
- [ ] Developer confirmation/correction of detected profile
- [ ] Qdrant in Docker for vector storage
- [ ] AST-aware codebase indexing with language-specific parsing strategies
- [ ] Provider-agnostic embedding support (cloud LLMs, local models via Ollama)
- [ ] Semantic search with dependency graph expansion for context retrieval
- [ ] MCP server for OpenCode — explicit RAG queries
- [ ] Auto-context injection mode — relevant codebase context prepended to prompts automatically
- [ ] Configurable retrieval mode (MCP-only, auto-context, both) — benchmarkable
- [ ] Extend GSD workflows with RAG context at planning and execution steps
- [ ] Database connection (read-write) — developer provides location during install
- [ ] Monitoring dashboard (Docker) — token usage, indexing status, project profile view
- [ ] End-to-end benchmark system — run coding tasks, measure compile/test pass rate
- [ ] Benchmark comparison across embedding models, chunking strategies, and retrieval modes
- [ ] Benchmark history visualization in dashboard with score trends
- [ ] Project config file (`.ia-framework/project.json`) synced to dashboard

### Out of Scope

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

The framework is distributed as a git repo. Developers clone it anywhere and run `./install.sh`, which detects their project profile (language, framework, test runner, commands), sets up Qdrant in Docker, indexes the codebase, and configures OpenCode integration.

The monitoring dashboard (also Docker) provides visibility into indexing health, token consumption, and — critically — RAG quality benchmarks. When developers change the embedding model or chunking strategy, they can run end-to-end benchmarks that measure whether AI output actually compiles and passes tests, then see the score trend over time.

**Target:** Internal tool for one specific large project. Built to be reusable but not generalized yet.

**Primary interface:** OpenCode — the framework provides infrastructure (RAG, MCP servers), OpenCode provides the AI interaction layer.

## Constraints

- **Language**: TypeScript — all components (installer logic, MCP servers, dashboard, benchmark runner)
- **Testing**: Jest with TDD — tests written before implementation for all framework code
- **Code Quality**: ESLint + Prettier + strict TypeScript + architectural rules (no circular deps, layer boundaries)
- **Infrastructure**: Docker required — Qdrant and dashboard run as containers
- **Interface**: OpenCode is the primary developer interface — framework provides tools, not UI for coding
- **Distribution**: Git repo — developers clone and run `./install.sh`
- **Repository**: Monorepo — all components co-located
- **Internal**: No public package registry, no auth system, no multi-tenancy

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Qdrant for vector storage | Mature, Docker-native, good TypeScript client, runs locally | — Pending |
| Provider-agnostic embeddings | Let developers choose LLM/embedding provider (cloud or local) | — Pending |
| Monorepo structure | All components co-located, simpler dependency management | — Pending |
| MCP + auto-context (configurable) | Both retrieval modes available, benchmarkable against each other | — Pending |
| Clone anywhere + install script | No npm publish needed, simple distribution for internal tool | — Pending |
| AST-aware + dependency graph | Better retrieval than generic text chunking — understands code structure | — Pending |
| Jest for testing | Widely used, good TypeScript support, team familiarity | — Pending |
| Full code quality enforcement | Framework practices what it preaches — clean code standards | — Pending |
| Dashboard for benchmarks | Visual benchmark history more actionable than CLI output | — Pending |

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
*Last updated: 2026-03-31 after initialization*
