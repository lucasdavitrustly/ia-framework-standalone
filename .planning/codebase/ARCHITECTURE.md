# Architecture

**Analysis Date:** 2026-05-21

## Pattern Overview

**Overall:** Modular monorepo with layered package architecture

**Key Characteristics:**

- Packages organized by domain responsibility with clear dependency direction
- MCP server as the primary AI-facing interface, backed by retrieval engine
- CLI as the primary developer-facing interface for setup and indexing
- Strategy pattern for chunking (AST vs LLM), factory pattern for embeddings
- Multi-collection search with fusion ranking (RRF, MMR, BM25 reranking)

## Layers

**Core (`packages/core`):**

- Purpose: Shared types, config loading, logging, and utility functions
- Location: `packages/core/src/`
- Contains: `ProjectConfig` schema/loader, `Logger`, type definitions, Maven parser, query intelligence helpers
- Depends on: Nothing (leaf dependency)
- Used by: All other packages

**AST Parser (`packages/ast-parser`):**

- Purpose: Parse source code into semantic chunks using tree-sitter
- Location: `packages/ast-parser/src/`
- Contains: Chunker, splitter, call extractor, language-specific parsers
- Depends on: `@ia-framework/core` (types only)
- Used by: `packages/indexer`

**Embedding (`packages/embedding`):**

- Purpose: Generate vector embeddings from text via pluggable providers
- Location: `packages/embedding/src/`
- Contains: Provider interface, factory, provider implementations (OpenAI, Ollama)
- Depends on: `@ia-framework/core`
- Used by: `packages/indexer`, `packages/mcp-server`

**Vector Store (`packages/vector-store`):**

- Purpose: Abstract Qdrant interactions (upsert, search, collection management)
- Location: `packages/vector-store/src/`
- Contains: `VectorStore` interface, `QdrantVectorStore` implementation
- Depends on: `@ia-framework/core`
- Used by: `packages/indexer`, `packages/retrieval`

**Retrieval (`packages/retrieval`):**

- Purpose: Search orchestration — query expansion, multi-collection search, reranking
- Location: `packages/retrieval/src/`
- Contains: `SearchEngine`, `MultiCollectionSearchEngine`, `DependencyGraph`, MMR, RRF, BM25 reranker, elbow detection, multi-hop expansion
- Depends on: `@ia-framework/core`, `@ia-framework/embedding`, `@ia-framework/vector-store`
- Used by: `packages/mcp-server`, `packages/cli`, `packages/dashboard-api`

**Indexer (`packages/indexer`):**

- Purpose: Pipeline that scans a target project, chunks code, generates embeddings, upserts to Qdrant
- Location: `packages/indexer/src/`
- Contains: `IndexingPipeline`, chunking strategies (AST, LLM), file walker, incremental indexing, concept generator
- Depends on: `@ia-framework/core`, `@ia-framework/ast-parser`, `@ia-framework/embedding`, `@ia-framework/vector-store`, `@ia-framework/retrieval`
- Used by: `packages/cli`, `packages/dashboard-api`

**MCP Server (`packages/mcp-server`):**

- Purpose: Model Context Protocol server exposing retrieval tools to AI coding assistants
- Location: `packages/mcp-server/src/`
- Contains: Tool registrations (search_codebase, search_codebase_hybrid, get_file, get_dependencies, get_module_dependencies, query_database, index_database_schema, benchmark_preflight), query classification, prompt templates
- Depends on: `@ia-framework/core`, `@ia-framework/retrieval`, `@ia-framework/embedding`, `@ia-framework/vector-store`, `@ia-framework/observability`, `@ia-framework/db-context`
- Used by: OpenCode (external consumer via stdio transport)

**CLI (`packages/cli`):**

- Purpose: Developer-facing command-line interface for setup, indexing, benchmarking
- Location: `packages/cli/src/`
- Contains: Commands (init, index, index-stop, search, status, benchmark, db, agents, prompt)
- Depends on: Most packages (wires everything together)
- Used by: Developers directly

**Observability (`packages/observability`):**

- Purpose: Token counting, metrics storage (SQLite), session tracking
- Location: `packages/observability/src/`
- Contains: `MetricsStore`, `TokenCounter`, session helpers
- Depends on: `@ia-framework/core`
- Used by: `packages/mcp-server`, `packages/dashboard-api`

**Dashboard API (`packages/dashboard-api`):**

- Purpose: Hono HTTP server serving metrics, benchmark results, search history, indexing status
- Location: `packages/dashboard-api/src/`
- Contains: Routes (status, metrics, benchmarks, indexing, search, analytics, tuning, config, db), config watcher, search history store
- Depends on: `@ia-framework/core`, `@ia-framework/observability`, `@ia-framework/indexer`, `@ia-framework/retrieval`
- Used by: Dashboard frontend

**Dashboard Frontend (`apps/dashboard`):**

- Purpose: React SPA for monitoring token usage, indexing status, benchmarks, search testing
- Location: `apps/dashboard/src/`
- Contains: Pages, components (analytics, search, tuning), API client
- Depends on: Dashboard API (HTTP)
- Used by: Developers (browser)

**Project Detector (`packages/project-detector`):**

- Purpose: Auto-detect target project stack (language, framework, build tools)
- Location: `packages/project-detector/src/`
- Contains: Detector engine, language-specific detectors, confirmer, persister
- Depends on: `@ia-framework/core`
- Used by: `packages/cli` (init command)

**DB Context (`packages/db-context`):**

- Purpose: Connect to target project's PostgreSQL, query schema, index to Qdrant
- Location: `packages/db-context/src/`
- Contains: Config loader, `PostgresSource`, types
- Depends on: `@ia-framework/core`
- Used by: `packages/mcp-server`, `packages/cli`

**Benchmark (`packages/benchmark`):**

- Purpose: RAG quality evaluation — run retrieval queries, score results
- Location: `packages/benchmark/src/`
- Contains: Benchmark runner, test corpus format, scoring
- Depends on: `@ia-framework/core`, `@ia-framework/retrieval`
- Used by: `packages/cli`

## Data Flow

**Indexing Flow:**

1. CLI `index` command loads config from `.ia-framework/project.json`
2. `IndexingPipeline` walks target project files using glob patterns
3. AST parser (or LLM strategy) chunks each file into semantic code blocks
4. Embedding provider generates vectors for each chunk
5. Chunks with vectors upserted to Qdrant collection(s)
6. Dependency graph edges stored in `.ia-framework/graph.sqlite`

**Query Flow (MCP):**

1. AI assistant calls MCP tool (e.g., `search_codebase`) via stdio
2. MCP server receives request, classifies query complexity
3. `MultiCollectionSearchEngine` queries all active collections (AST, LLM)
4. Per-collection: embed query → Qdrant vector search → score filtering
5. Results merged via RRF, reranked with MMR for diversity
6. Dependency graph expands results to include related files (1-2 hops)
7. Elbow detection truncates low-relevance tail
8. Prompt template injected if query matches known intent
9. Formatted results returned to AI assistant

**State Management:**

- Project config: `.ia-framework/project.json` (JSON, loaded by `@ia-framework/core`)
- Metrics/history: `.ia-framework/metrics.sqlite` (SQLite via better-sqlite3)
- Dependency graph: `.ia-framework/graph.sqlite` (SQLite via better-sqlite3)
- Vector data: Qdrant Docker container (persistent volume `qdrant_data`)
- Indexing state: `.ia-framework/last-commit` (git SHA for incremental)

## Key Abstractions

**SearchEngine:**

- Purpose: Single-collection vector search with embedding, filtering, and expansion
- Examples: `packages/retrieval/src/search-engine.ts`
- Pattern: Adapter over VectorStore + EmbeddingProvider with search intelligence

**MultiCollectionSearchEngine:**

- Purpose: Aggregates multiple SearchEngines (AST + LLM collections), merges via RRF
- Examples: `packages/retrieval/src/multi-collection-search-engine.ts`
- Pattern: Composite pattern — implements same interface as SearchEngine

**ChunkingStrategy:**

- Purpose: Pluggable code chunking — AST-based or LLM-based
- Examples: `packages/indexer/src/strategies/ast-strategy.ts`, `packages/indexer/src/strategies/llm-strategy.ts`
- Pattern: Strategy pattern with shared interface `packages/indexer/src/strategies/types.ts`

**EmbeddingProvider:**

- Purpose: Pluggable embedding generation (OpenAI, Ollama)
- Examples: `packages/embedding/src/providers/`
- Pattern: Factory pattern via `packages/embedding/src/factory.ts`

**MCP Tool Registration:**

- Purpose: Each tool is a self-contained module registering on McpServer
- Examples: `packages/mcp-server/src/tools/search-codebase.ts`
- Pattern: Each tool exports a `registerXxxTool(server, engine, options)` function

## Entry Points

**CLI Binary:**

- Location: `packages/cli/src/bin.ts`
- Triggers: Developer runs `ia-framework <command>`
- Responsibilities: Parse args, wire dependencies, execute command

**MCP Server Binary:**

- Location: `packages/mcp-server/src/bin.ts`
- Triggers: OpenCode spawns as stdio MCP server
- Responsibilities: Load config, create SearchEngine(s), connect stdio transport

**Dashboard API Server:**

- Location: `packages/dashboard-api/src/server.ts`
- Triggers: Docker container start or `pnpm dev`
- Responsibilities: Start Hono HTTP server, serve API routes + static dashboard

**Install Script:**

- Location: `install.sh`
- Triggers: First-time setup by developer
- Responsibilities: Bootstrap framework in target project

## Error Handling

**Strategy:** Fail-fast with structured logging; graceful degradation for optional features

**Patterns:**

- Config loading throws `ConfigNotFoundError` if missing
- MCP server exits with error if no Qdrant collections exist
- Optional features (dependency graph, LLM collection, DB context) log and skip if unavailable
- CLI commands use try/catch with user-friendly error messages

## Cross-Cutting Concerns

**Logging:** `packages/core/src/logger/` — structured logger (pino-style) via `createLogger(name)`
**Validation:** Zod schemas in `packages/core/src/config/schema.ts` for all config
**Authentication:** None (single-user local tool); Qdrant API key optional for remote deployments

---

_Architecture analysis: 2026-05-21_
