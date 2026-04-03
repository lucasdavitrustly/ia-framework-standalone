<!-- GSD:project-start source:PROJECT.md -->
## Project

**ia-framework**

A TypeScript monorepo that helps developers use AI to build features in existing large projects. It is a **standalone tool** — cloned and run independently from the target project. It provides a one-shot installer (`./install.sh`) that auto-detects the target project's stack, sets up local RAG via Qdrant in Docker, and integrates with OpenCode through MCP servers and auto-context injection. A monitoring dashboard tracks token usage, indexing status, and RAG quality benchmarks. GSD workflows run inside the target project directory, and all GSD-generated artifacts (.planning/, AGENTS.md) belong to the target project — not the framework.

**Core Value:** AI that actually understands the codebase — better context means better code output.

### Constraints

- **Language**: TypeScript — all components (installer logic, MCP servers, dashboard, benchmark runner)
- **Testing**: Vitest with TDD — tests written before implementation for all framework code (ecosystem-aligned, zero-config for TS monorepos)
- **Code Quality**: ESLint + Prettier + strict TypeScript + architectural rules (no circular deps, layer boundaries)
- **Infrastructure**: Docker required — Qdrant and dashboard run as containers
- **Interface**: OpenCode is the primary developer interface — framework provides tools, not UI for coding
- **Distribution**: Git repo — developers clone and run `./install.sh`
- **Repository**: Monorepo — all components co-located
- **Internal**: No public package registry, no auth system, no multi-tenancy
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Recommended Stack
### Runtime & Language
| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Node.js | ^22.0.0 (LTS) | Runtime | Vitest 4 requires ^20 or ^22+. Node 22 LTS gives modern APIs (native fetch, structuredClone, test runner fallback) with long-term support. | HIGH |
| TypeScript | ^5.9.0 | Language | Latest stable 5.x. TypeScript 6.0 just released but ecosystem deps (MCP SDK, Vitest, Hono) still target ^5.x. Wait for ecosystem adoption before upgrading. | HIGH |
| pnpm | ^10.x | Package manager | Best monorepo support (workspace protocol, strict dependency resolution, content-addressable storage). Used by Qdrant SDK, Zod, and Turborepo ecosystem. | HIGH |
### Monorepo Tooling
| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Turborepo | ^2.9.1 | Build orchestration | Rust-powered task runner with remote caching, dependency-aware task graph, and parallel execution. Industry standard for TypeScript monorepos. | HIGH |
| tsup | ^8.5.1 | Package bundling | Wraps esbuild for fast builds with DTS generation. Handles ESM+CJS dual output. Used by most modern TS libraries. | HIGH |
| tsx | ^4.21.0 | Dev TS execution | Runs TypeScript directly via esbuild transform. For scripts, dev servers, and CLI tools during development. | HIGH |
### Vector Database & RAG
| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Qdrant (Docker) | latest (v1.13+) | Vector storage | Mature, Docker-native, excellent filtering, payload storage. Purpose-built for RAG with HNSW indexing. Already a project decision. | HIGH |
| @qdrant/js-client-rest | ^1.17.0 | Qdrant client | Official REST client. Full TypeScript types, supports Node.js >=18, browser, and Deno. REST is simpler to debug than gRPC; gRPC only needed at scale we won't hit. | HIGH |
### MCP Server
| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| @modelcontextprotocol/sdk | ^1.29.0 | MCP server | Official Anthropic SDK. Provides `McpServer` class with tool/resource/prompt registration. StdioServerTransport for OpenCode integration. Actively maintained, weekly releases. | HIGH |
### AST Parsing
| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| web-tree-sitter | ^0.26.8 | AST parsing | WASM-based tree-sitter for Node.js. Language-agnostic incremental parser. Supports 100+ languages via grammar plugins. WASM avoids native compilation issues across platforms. | HIGH |
| tree-sitter-typescript | latest | TS/JS grammar | Official TypeScript grammar for tree-sitter. Covers TypeScript, TSX, JavaScript, JSX. | HIGH |
| tree-sitter-python | latest | Python grammar | For indexing Python codebases. Add more grammars per target project needs. | MEDIUM |
### Embedding & LLM Integration
| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| openai | ^6.33.0 | Cloud embeddings | Official OpenAI SDK. Also works with any OpenAI-compatible API (Azure, Together, local vLLM). Zero external dependencies. Provider-agnostic via base URL config. | HIGH |
| ollama | ^0.6.3 | Local embeddings | Official Ollama client. Run embedding models locally (nomic-embed-text, mxbai-embed-large). No API keys needed. Critical for air-gapped/private codebases. | HIGH |
### Dashboard API Server
| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| hono | ^4.12.9 | API framework | Ultrafast, Web Standards-based, excellent TypeScript types, built-in WebSocket support. ~14KB. MCP SDK already depends on it. One less dependency to manage. | HIGH |
| @hono/node-server | ^1.19.12 | Node.js adapter | Runs Hono on Node.js with native http module. Supports static file serving. | HIGH |
### Dashboard Frontend
| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| React | ^19.x | Dashboard UI | Massive ecosystem for charting and data display. React 19 is stable with server components, use hooks, and improved performance. Team familiarity likely. | HIGH |
| Recharts | ^3.8.1 | Charts/visualization | Best React charting library for benchmark trend visualization. Declarative API, composable, responsive. Built on D3 internals but React-native API. | HIGH |
| Vite | ^6.x | Frontend build | Standard React build tool. Fast HMR, ESM-native, TypeScript out of the box. Vitest is built on Vite, so config sharing is natural. | HIGH |
### Data Storage (Monitoring/Metrics)
| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| better-sqlite3 | ^12.8.0 | Metrics database | Synchronous SQLite for Node.js. Stores token usage, benchmark results, indexing status, project config. No extra Docker service needed. Perfect for single-user internal tools. | HIGH |
### Schema Validation
| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| zod | ^4.3.6 | Validation & types | TypeScript-first schema validation with static type inference. MCP SDK peer dependency (^3.25 \|\| ^4.0). Use Zod 4 for performance gains and smaller bundle. Validates configs, API payloads, CLI inputs. | HIGH |
### Testing
| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| vitest | ^4.1.2 | Test runner | Jest-compatible API (describe/test/expect) with native ESM, TypeScript, and monorepo workspace support. 10x faster than Jest for TS projects — no transform config needed. Used by MCP SDK, Qdrant client, Hono, Recharts, Zod, and every library in this stack. | HIGH |
| @vitest/coverage-v8 | ^4.x | Coverage | V8-based coverage — faster than Istanbul, no instrumentation needed. | HIGH |
### Code Quality
| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| eslint | ^9.x | Linting | Flat config format (eslint.config.js). Industry standard. | HIGH |
| typescript-eslint | ^8.x | TS linting rules | Type-aware linting for TypeScript. Handles strict type checking rules. | HIGH |
| prettier | ^3.x | Formatting | Opinionated formatter. No config debates. | HIGH |
### Infrastructure
| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Docker | latest | Container runtime | Runs Qdrant and dashboard. Required by project constraints. | HIGH |
| Docker Compose | v2 | Service orchestration | Defines multi-container setup (Qdrant, dashboard API, dashboard UI). Single `docker compose up`. | HIGH |
### Supporting Libraries
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| commander | ^13.x | CLI framework | Install script and CLI tools. Proven, typed, simple. |
| glob / tinyglobby | ^0.2.x | File discovery | Codebase scanning for indexing. Fast, modern glob implementation. |
| chokidar | ^4.x | File watching | Watch codebase for changes to trigger re-indexing. |
| winston or pino | latest | Logging | Structured logging for MCP server and indexer. Pino is faster; winston has more transports. Pick pino for performance. |
| p-queue | ^8.x | Concurrency control | Rate-limit embedding API calls. Prevent overwhelming cloud providers. |
| cosmiconfig | ^9.x | Config loading | Load `.ia-framework/project.json` and other configs. Handles JSON, YAML, JS configs. |
## Alternatives Considered
| Category | Recommended | Alternative | Why Not Alternative |
|----------|-------------|-------------|---------------------|
| **Test Runner** | Vitest 4 | Jest 29 | Jest requires ts-jest transforms, ESM workarounds, and slower execution. Every stack dependency uses Vitest. Zero-config for TypeScript. |
| **API Framework** | Hono | Express 5 | Express is heavier, weaker TypeScript types, no built-in WebSocket. MCP SDK already bundles Hono as dependency. |
| **API Framework** | Hono | Fastify | Fastify adds plugin complexity. Hono is simpler, equally fast, Web Standards-based. |
| **Package Manager** | pnpm | npm | npm's workspace support is weaker. No content-addressable storage. Slower installs. |
| **Package Manager** | pnpm | yarn | Berry/Classic confusion. pnpm is simpler and faster for monorepos. |
| **Package Manager** | pnpm | bun | Bun is fast but less mature. Edge cases with native WASM modules (tree-sitter). Risk for production tooling. |
| **Embedding** | Custom adapter | LangChain | LangChain adds 50+ transitive dependencies for what amounts to two HTTP calls. Massive version churn. Unnecessary abstraction layer. |
| **Embedding** | Custom adapter | LlamaIndex.TS | Same problem as LangChain — too heavy for two provider implementations. |
| **Vector DB Client** | REST client | gRPC client | REST is simpler to debug, sufficient for local single-user workloads. gRPC only matters at massive scale. |
| **Metrics DB** | better-sqlite3 | PostgreSQL | PostgreSQL requires an extra Docker container, migrations tooling, and connection management. SQLite is embedded, zero-config, perfect for single-user metrics. |
| **Metrics DB** | better-sqlite3 | Redis | Not relational. Can't easily query benchmark history trends. |
| **Frontend** | React 19 | Svelte | Would require a separate build pipeline and toolchain. React ecosystem has Recharts. |
| **Frontend** | React 19 | Hono JSX | Hono's built-in JSX is server-side focused. Dashboard needs client-side interactivity, state management, charting. |
| **AST Parser** | web-tree-sitter | @babel/parser | Babel only parses JS/TS. Tree-sitter is language-agnostic — add Python, Go, Rust grammars trivially. |
| **AST Parser** | web-tree-sitter | TypeScript Compiler API | Too slow for large codebases. Loads entire type system. Only TypeScript. |
| **Bundler** | tsup | tsc only | tsc doesn't bundle, doesn't handle ESM+CJS dual output cleanly. tsup wraps esbuild for speed. |
| **Bundler** | tsup | Rollup | Rollup requires more config. tsup provides sensible defaults for library bundling. |
## Monorepo Package Structure
## TypeScript Configuration
## Installation
# Core dependencies (per package — installed via pnpm workspace)
# packages/core
# packages/mcp-server
# packages/dashboard-api
# apps/dashboard
# packages/benchmark
# Root dev dependencies
## Docker Compose Setup
# docker-compose.yml
## Key Integration Points
### MCP SDK + Zod
### Qdrant + Embedding Provider
### web-tree-sitter + Language Grammars
## Version Compatibility Matrix
| Library | Node.js | TypeScript | Notes |
|---------|---------|------------|-------|
| @modelcontextprotocol/sdk | >=18 | ^5.5 | Peer dep on zod ^3.25 \|\| ^4.0 |
| @qdrant/js-client-rest | >=18.17 | >=4.7 | Uses undici ^6 |
| vitest | ^20 \|\| ^22 \|\| >=24 | ^5.5 | Requires vite ^6 \|\| ^7 \|\| ^8 |
| hono | >=16.9 | any | No native dep issues |
| web-tree-sitter | >=18 | any | WASM — no native compilation |
| better-sqlite3 | 20 \|\| 22-25 | any | Native module — prebuild-install |
| openai | any | any | Zero dependencies |
| ollama | any | ^5.3 | Minimal deps (whatwg-fetch) |
## Sources
- @modelcontextprotocol/sdk: https://www.npmjs.com/package/@modelcontextprotocol/sdk (v1.29.0)
- @qdrant/js-client-rest: https://www.npmjs.com/package/@qdrant/js-client-rest (v1.17.0)
- web-tree-sitter: https://www.npmjs.com/package/web-tree-sitter (v0.26.8)
- hono: https://www.npmjs.com/package/hono (v4.12.9)
- @hono/node-server: https://www.npmjs.com/package/@hono/node-server (v1.19.12)
- vitest: https://www.npmjs.com/package/vitest (v4.1.2)
- zod: https://www.npmjs.com/package/zod (v4.3.6)
- openai: https://www.npmjs.com/package/openai (v6.33.0)
- ollama: https://www.npmjs.com/package/ollama (v0.6.3)
- better-sqlite3: https://www.npmjs.com/package/better-sqlite3 (v12.8.0)
- turbo: https://www.npmjs.com/package/turbo (v2.9.1)
- typescript: https://www.npmjs.com/package/typescript (v6.0.2 available; recommend ^5.9 for compatibility)
- tsx: https://www.npmjs.com/package/tsx (v4.21.0)
- tsup: https://www.npmjs.com/package/tsup (v8.5.1)
- recharts: https://www.npmjs.com/package/recharts (v3.8.1)
- pnpm: https://www.npmjs.com/package/pnpm (v10.33.0)
- MCP SDK docs: Context7 /modelcontextprotocol/typescript-sdk (HIGH reputation, 346 snippets)
- Qdrant JS docs: Context7 /qdrant/qdrant-js (HIGH reputation, 98 snippets)
- Hono docs: Context7 /websites/hono_dev (HIGH reputation, 757 snippets)
- Turborepo docs: Context7 /vercel/turborepo (HIGH reputation, 1520 snippets)
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd:quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd:debug` for investigation and bug fixing
- `/gsd:execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

## GSD + RAG Integration

RAG tools guidance is injected into the target project's agent documentation
via `ia-framework agents inject`. See the target project's AGENTS.md/CLAUDE.md
for available tools and usage patterns. Use `ia-framework agents check` to
verify injection status.

<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd:profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
