# Project Research Summary

**Project:** ia-framework
**Domain:** AI-assisted development framework with local RAG for code
**Researched:** 2026-03-31
**Confidence:** HIGH

## Executive Summary

ia-framework is a **pipeline-oriented RAG system** for code that indexes codebases using AST parsing, stores embeddings in Qdrant, and delivers context to AI coding assistants (OpenCode/Crush) via the MCP protocol. The competitive landscape (Cursor, Continue, Aider, Cody) has converged on codebase awareness as the core value proposition, with MCP becoming the standard extensibility protocol. The industry-proven approach is: parse code with tree-sitter for language-agnostic AST extraction, chunk at semantic boundaries (functions, classes, types), embed with provider-agnostic adapters, store in a vector database, and deliver context through MCP tool calls. ia-framework differentiates by making this pipeline **measurable** (end-to-end benchmarks), **observable** (monitoring dashboard), and **configurable** (A/B testable retrieval modes).

The recommended approach is a TypeScript monorepo (Turborepo + pnpm) with ~10 focused packages, building bottom-up from core types through the indexing pipeline, then retrieval, then MCP integration. The stack is mature and well-documented: every library choice is at HIGH confidence with verified npm versions. The key architectural insight is to build the indexing pipeline with AST-aware chunking and **dual-vector storage** (text description + raw code vectors per chunk) from day one — research shows single-vector approaches miss ~40% of queries depending on whether the developer phrases queries as natural language or code. Use Qdrant's named vector support for this. A thin `EmbeddingProvider` interface with OpenAI and Ollama implementations replaces heavyweight frameworks like LangChain.

The primary risks are: (1) naive chunking that destroys retrieval quality — mitigated by AST-aware parsing with tree-sitter from the first implementation, (2) stale indexes after code changes — mitigated by incremental re-indexing using git diff, (3) MCP server crashes silently degrading the developer experience — mitigated by circuit breakers, graceful degradation, and health checks, and (4) auto-context injection adding irrelevant noise — mitigated by shipping MCP-only mode first and deferring auto-context until benchmarking proves its value.

## Key Findings

### Recommended Stack

The stack is fully resolved at HIGH confidence. All versions verified against npm registry on 2026-03-31. The key constraint is Node.js 22 LTS (driven by Vitest 4's requirements). TypeScript 5.9 is recommended over the newly released 6.0 — the ecosystem hasn't adopted TS 6 yet.

**Core technologies:**
- **Node.js 22 LTS + TypeScript 5.9 + pnpm 10**: Modern runtime with strict types and best-in-class monorepo support
- **Turborepo 2.9 + tsup 8.5**: Rust-powered build orchestration with fast ESM bundling
- **Qdrant (Docker) + @qdrant/js-client-rest 1.17**: Purpose-built vector storage with excellent filtering and named vector support
- **@modelcontextprotocol/sdk 1.29**: Official MCP server SDK, stdio transport, Zod-based tool schemas
- **web-tree-sitter 0.26**: WASM-based language-agnostic AST parsing, avoids native compilation issues across platforms
- **openai 6.33 + ollama 0.6**: Provider-agnostic embedding via custom adapter interface (NOT LangChain)
- **Hono 4.12 + @hono/node-server**: Ultrafast API framework for dashboard backend — already an MCP SDK dependency
- **React 19 + Recharts 3.8 + Vite 6**: Dashboard frontend with charting for benchmark trends
- **better-sqlite3 12.8**: Embedded metrics database — zero-config, no extra Docker container
- **Zod 4.3**: MCP SDK peer dependency, validates configs and API payloads
- **Vitest 4.1**: Recommended over Jest — identical API, zero-config TypeScript support, used by every library in the stack

**Notable recommendation:** Update the Jest constraint from PROJECT.md to Vitest. The authoring experience is identical (`describe`/`test`/`expect`/`vi.mock`), but Vitest eliminates the need for ts-jest transforms, ESM workarounds, and babel configuration.

### Expected Features

Research across five major competitor tools reveals clear tiers of feature importance.

**Must have (table stakes):**
- Codebase indexing with AST-aware chunking — every competitor provides codebase awareness
- Semantic search / context retrieval — the core value proposition
- MCP server integration — industry standard protocol, Continue deprecated built-in RAG in favor of MCP
- Provider-agnostic embedding (OpenAI + Ollama) — developers demand provider choice
- One-shot installation with auto-detection — friction kills adoption
- Project profile auto-detection — developers don't want manual configuration
- Git-aware operations — respect .gitignore, track changes for incremental re-indexing

**Should have (differentiators):**
- AST-aware chunking (tree-sitter) — most tools use naive text splitting
- Dependency graph expansion on retrieval — no competitor does this
- End-to-end benchmark system (compile + test pass rate) — only Aider benchmarks, and only LLM capability not RAG quality
- Monitoring dashboard (indexing status, token usage, RAG quality) — no competitor has this
- Configurable retrieval modes (MCP-only / auto-context / both) — A/B testable, novel
- Benchmark history with trend visualization — iterative optimization over time

**Defer (v2+):**
- Auto-context injection — ship MCP-only first; auto-context adds complexity and risk of noise injection
- GSD workflow integration — build RAG quality first, integrate with workflows later
- Database schema indexing — useful but secondary to code context
- Dependency graph expansion — start with basic semantic search, add as measured improvement

### Architecture Approach

The system is a pipeline-oriented architecture with three runtime modes (batch indexing, interactive MCP, monitoring dashboard) sharing core libraries but running as separate processes. The monorepo contains ~10 packages organized by bounded responsibility (core, ast-parser, embedding, vector-store, indexer, rag, metrics) plus 3 apps (mcp-server, dashboard, cli). Components communicate in-process where possible, with HTTP only for external services (Qdrant, embedding APIs).

**Major components:**
1. **core** — Shared types, config loader (Zod schemas), structured logging
2. **ast-parser** — Tree-sitter WASM abstraction with per-language parser strategies and AST-aware chunk generation
3. **embedding** — Strategy pattern: `EmbeddingProvider` interface with OpenAI and Ollama implementations
4. **vector-store** — Repository pattern: `VectorStore` interface wrapping Qdrant REST client
5. **indexer** — Pipeline pattern: file walk → AST parse → metadata enrich → embed → upsert (each stage independently testable)
6. **rag** — Retrieval engine: embed query → semantic search → (optional) dependency expand → re-rank → context assembly
7. **mcp-server** — Stateless MCP server (stdio transport): registers tools, delegates to RAG engine
8. **metrics** — SQLite-backed storage for token usage and benchmark results
9. **dashboard** — Hono API + React SPA: read-only views of indexing status, token usage, benchmark trends
10. **installer** — Bash bootstrap + TypeScript orchestration: prereq checks, Docker setup, project detection

### Critical Pitfalls

1. **Naive text chunking destroys retrieval quality** — Use tree-sitter AST parsing from the first implementation. Chunk at function/class/type boundaries, never at arbitrary byte offsets. This is the #1 determinant of RAG quality and cannot be fixed incrementally.

2. **Single embedding model misses ~40% of queries** — Use dual-vector collections in Qdrant (text description + raw code). NLP models miss code-to-code queries; code models miss natural language queries. Qdrant's named vector support enables this at no architectural cost. Must be designed into the collection schema from the start.

3. **Embedding model mismatch silently degrades results** — Lock collections to a specific model config. Store model name + version in metadata. Force full re-indexing when the model changes. Validate dimensions before upsert.

4. **Auto-context injection with wrong context is worse than no context** — Ship MCP-only mode as default. Add auto-context later with relevance thresholds. Benchmark MCP-only vs auto-context to find the sweet spot. Never auto-inject below a minimum similarity score.

5. **MCP server crashes silently kill the developer workflow** — Wrap all Qdrant calls with timeout + retry + circuit breaker. Return empty results with error messages on failure, never crash. Log to stderr and to file. Health-check Qdrant on startup and periodically.

## Implications for Roadmap

Based on research, suggested phase structure (7 phases):

### Phase 1: Foundation & Infrastructure
**Rationale:** Everything depends on the monorepo structure, shared types, config system, and Docker infrastructure. This is Level 0-1 in the architecture build order.
**Delivers:** Working monorepo with Turborepo + pnpm, shared TypeScript config, core types package, Docker Compose with Qdrant running, project detection skeleton, Zod config schemas.
**Addresses:** Configurable settings, Git-aware operations (gitignore), project auto-detection (skeleton)
**Avoids:** Installer failures (#9) — establish prereq checks and Docker volume setup early

### Phase 2: Indexing Pipeline
**Rationale:** Cannot retrieve without an index. The indexing pipeline is the foundational differentiator — its quality determines everything downstream. Must get AST-aware chunking and dual-vector storage right from the start.
**Delivers:** Tree-sitter AST parsing, embedding provider abstraction (OpenAI + Ollama), dual-vector Qdrant collection, indexing pipeline with progress reporting. Run `ia-framework index` and the codebase is indexed.
**Addresses:** Codebase indexing, AST-aware chunking, provider-agnostic embedding
**Avoids:** Naive text chunking (#1), single embedding model (#2), embedding model mismatch (#3), Ollama slow indexing (#10)

### Phase 3: Retrieval & MCP Server
**Rationale:** Semantic search + MCP integration is the shortest path to proving value. Once indexing works, developers need to use it through OpenCode. MCP-only mode first.
**Delivers:** RAG engine with semantic search, MCP server with `search_codebase` and `index_status` tools, OpenCode integration via stdio transport. Developer can ask "find the authentication handler" and get relevant code.
**Addresses:** Semantic search / context retrieval, MCP server integration, configurable retrieval (MCP-only mode)
**Avoids:** MCP server crashes (#6), bad MCP tool schema (#13), auto-context noise (#4 — deferred)

### Phase 4: Installation & CLI
**Rationale:** With the core pipeline working, create the frictionless first-run experience. The installer depends on project detection and Docker setup (Phase 1) and validates by running indexing (Phase 2).
**Delivers:** `./install.sh` with prereq checks, project auto-detection with developer confirmation, CLI commands (`index`, `status`, `search`), idempotent setup.
**Addresses:** Easy one-shot installation, project profile auto-detection, developer confirmation UX
**Avoids:** Installer assumes too much (#9) — pre-flight checks, fail fast, test on macOS/Ubuntu/WSL2

### Phase 5: Benchmarking & Metrics
**Rationale:** Must measure before optimizing. With retrieval working, benchmarks prove RAG value and enable comparison across embedding models and chunking strategies. Required before tuning auto-context or dependency expansion.
**Delivers:** Benchmark runner (coding tasks → AI generates code → compile → test → score), metrics storage (SQLite), token usage tracking, CLI benchmark comparison output. Can compare: "does voyage-code-3 outperform nomic-embed-text on my codebase?"
**Addresses:** End-to-end benchmark system, benchmark history storage, token usage tracking
**Avoids:** Benchmarks measuring wrong thing (#8) — end-to-end compile+test, not just retrieval precision. Include no-RAG baseline.

### Phase 6: Monitoring Dashboard
**Rationale:** All data sources (Qdrant stats, SQLite metrics, benchmark results) must exist before the dashboard can display them. This is a visibility/polish layer.
**Delivers:** Docker-containerized web app: indexing status, token usage charts (Recharts), benchmark trend visualization, project profile view. All read-only.
**Addresses:** Monitoring dashboard, benchmark history visualization
**Avoids:** Dashboard becomes maintenance burden (#14) — read-only v1, minimal feature set, optional component

### Phase 7: Advanced Retrieval & Integration
**Rationale:** With measurement infrastructure in place, add advanced features and verify they improve benchmarks. Each feature (auto-context, dependency expansion) must prove its value empirically.
**Delivers:** Auto-context injection with relevance thresholds, dependency graph expansion (1-hop with token budget cap), configurable retrieval modes, GSD workflow integration.
**Addresses:** Auto-context injection, dependency graph expansion, configurable retrieval modes, GSD workflow integration
**Avoids:** Auto-context noise (#4) — benchmark before enabling by default. Dependency graph explosion (#7) — hard depth limit, token budget, barrel file detection.

### Phase Ordering Rationale

- **Phases 1→2→3 are strictly sequential**: can't retrieve without an index, can't index without infrastructure
- **Phase 4 (installer) comes after Phase 3**: installer validates the full pipeline works end-to-end, not just infrastructure
- **Phase 5 (benchmarks) before Phase 7 (advanced features)**: measurement must exist before optimization — the research unanimously agrees on "measure first"
- **Phase 6 (dashboard) before Phase 7**: developers need visibility into the system before tweaking retrieval modes
- **Phase 7 last**: auto-context and dependency expansion are refinements that require benchmarks to validate, not prerequisites

### Research Flags

**Phases likely needing deeper research during planning:**
- **Phase 2 (Indexing):** Dual-vector collection schema design needs Qdrant-specific research. Tree-sitter grammar loading and WASM initialization patterns need validation with actual codebase sizes. Batch embedding strategies differ significantly between OpenAI and Ollama.
- **Phase 5 (Benchmarking):** End-to-end benchmark task design (what coding tasks? how to measure compile+test automatically?) is novel — no competitor does this well. Aider's methodology (Exercism exercises) is a reference but tests LLM capability, not RAG quality.
- **Phase 7 (Advanced Retrieval):** Auto-context injection mechanism depends on OpenCode's extensibility (MCP prompt templates? middleware hooks?). Dependency graph expansion algorithms need experimentation.

**Phases with standard patterns (skip research-phase):**
- **Phase 1 (Foundation):** Turborepo + pnpm monorepo setup is extremely well-documented (1520 code snippets on Context7). Docker Compose for Qdrant is standard.
- **Phase 3 (MCP Server):** MCP SDK has excellent documentation (346 code snippets on Context7, HIGH confidence). Tool registration pattern is straightforward.
- **Phase 4 (Installer):** Standard CLI tooling patterns (commander, environment detection). Well-understood problem space.
- **Phase 6 (Dashboard):** Standard React + Recharts patterns. Hono API is well-documented (757 snippets on Context7).

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All versions verified against npm on 2026-03-31. Compatibility matrix validated. Every library at HIGH confidence except Python tree-sitter grammar (MEDIUM). |
| Features | HIGH | Based on analysis of 5 major competitor tools (Cursor, Continue, Aider, Cody, OpenCode) with official documentation. Clear consensus on table stakes vs differentiators. |
| Architecture | HIGH | MCP SDK, Qdrant client, and Turborepo patterns confirmed via Context7 with HIGH reputation sources. Data flows are well-defined. |
| Pitfalls | HIGH | 9 critical + 5 moderate pitfalls documented with specific prevention strategies. Sources include Qdrant's own code search tutorial and MCP specification. |

**Overall confidence: HIGH**

All four research areas are backed by official documentation, verified library versions, and established patterns. The domain (RAG for code) is well-explored by multiple tools, giving strong signal on what works.

### Gaps to Address

- **Dual-vector vs single-vector tradeoff**: PITFALLS research strongly recommends dual vectors, but the architecture doesn't detail the collection schema. Needs concrete schema design during Phase 2 planning.
- **Hono vs Fastify conflict**: STACK recommends Hono (already an MCP SDK dependency), ARCHITECTURE mentions Fastify for dashboard. **Resolution: Use Hono** — fewer dependencies, consistent with stack.
- **web-tree-sitter vs native tree-sitter**: STACK recommends WASM (cross-platform), ARCHITECTURE briefly mentions native for speed. **Resolution: Use web-tree-sitter (WASM)** — avoids native compilation issues, consistent with STACK recommendation.
- **Auto-context injection mechanism**: How to intercept prompts in OpenCode is unclear. Three options identified (MCP prompt templates, middleware hooks, wrapper script) but none validated. Defer research to Phase 7.
- **Benchmark task corpus**: What coding tasks to use for end-to-end benchmarks is unresolved. Aider uses Exercism exercises for LLM benchmarks, but RAG-quality benchmarks need tasks from the target project. Needs research during Phase 5 planning.
- **Incremental re-indexing granularity**: Agreed as important but the exact mechanism (git hooks? file watcher? manual command?) needs implementation-phase decision. Fast full re-index (<2 min) is acceptable for v1.

## Sources

### Primary (HIGH confidence)
- Context7 `/modelcontextprotocol/typescript-sdk` — MCP server setup, tool registration, transport (346 snippets)
- Context7 `/qdrant/qdrant-js` — Qdrant client API, collection management (98 snippets)
- Context7 `/websites/qdrant_tech` — Qdrant RAG patterns, code search tutorial, optimization (5682 snippets)
- Context7 `/vercel/turborepo` — Monorepo setup, pipeline config (1520 snippets)
- Context7 `/websites/hono_dev` — Hono API patterns, Node.js adapter (757 snippets)
- MCP specification: https://modelcontextprotocol.io/docs/concepts/architecture
- Qdrant code search tutorial: https://qdrant.tech/documentation/tutorials-search-engineering/code-search/
- Qdrant retrieval quality: https://qdrant.tech/documentation/tutorials-search-engineering/retrieval-quality/
- Aider repo map architecture: https://aider.chat/docs/repomap.html
- Continue custom RAG guide: https://docs.continue.dev/guides/custom-code-rag
- Cody context architecture: https://sourcegraph.com/docs/cody/core-concepts/context

### Secondary (MEDIUM confidence)
- Tree-sitter documentation (Context7) — grammar loading, error recovery patterns
- Qdrant embedding model migration tutorial — model switching workflow
- Aider benchmark methodology (https://aider.chat/docs/leaderboards/) — reference for benchmark design

### Tertiary (needs validation)
- Auto-context injection mechanism via OpenCode — no confirmed extensibility API
- Benchmark task design for RAG quality measurement — novel approach, no established methodology

---
*Research completed: 2026-03-31*
*Ready for roadmap: yes*
