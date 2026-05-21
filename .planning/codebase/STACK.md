# Technology Stack

**Analysis Date:** 2026-05-21

## Languages

**Primary:**

- TypeScript ^5.9.0 - All packages and apps (strict mode, ES2022 target)

**Secondary:**

- Shell (Bash) - `install.sh` installer script

## Runtime

**Environment:**

- Node.js >=22.0.0 (LTS)

**Package Manager:**

- pnpm >=10.0.0 (declared via `packageManager` field)
- Lockfile: `pnpm-lock.yaml` present

## Frameworks

**Core:**

- Hono ^4.12.9 - Dashboard API server (`packages/dashboard-api`)
- React ^19.0.0 - Dashboard frontend (`apps/dashboard`)
- MCP SDK ^1.29.0 - Model Context Protocol server (`packages/mcp-server`)

**Testing:**

- Vitest ^4.1.2 - All packages

**Build/Dev:**

- Turborepo ^2.9.1 - Monorepo task orchestration (`turbo.json`)
- tsup ^8.5.1 - Package bundling (all packages)
- Vite ^6.0.0 - Dashboard frontend build (`apps/dashboard`)
- tsx ^4.21.0 - Dev-time TypeScript execution

## Key Dependencies

**Critical:**

- `@modelcontextprotocol/sdk` ^1.29.0 - MCP server implementation (`packages/mcp-server`)
- `@qdrant/js-client-rest` ^1.13.0 - Vector database client (`packages/vector-store`, `packages/mcp-server`, `packages/cli`, `packages/dashboard-api`)
- `better-sqlite3` ^12.8.0 - Metrics/benchmark storage (`packages/observability`, `packages/retrieval`, `packages/benchmark`, `packages/dashboard-api`)
- `zod` ^4.3.6 - Schema validation (`packages/core`, `packages/mcp-server`, `packages/benchmark`, `packages/db-context`)

**Infrastructure:**

- `tree-sitter` ^0.22.4 + `tree-sitter-typescript` ^0.23.2 + `tree-sitter-java` ^0.23.5 - AST parsing (`packages/ast-parser`)
- `pg` ^8.13.0 - PostgreSQL client for target project DB context (`packages/db-context`)
- `p-queue` ^9.1.2 - Concurrency control for indexing (`packages/indexer`)
- `chokidar` ^4.0.0 - File watching (`packages/dashboard-api`)
- `commander` ^13.0.0 - CLI framework (`packages/cli`)
- `pino` ^9.0.0 - Structured logging (`packages/core`)
- `tinyglobby` ^0.2.10 - File discovery (`packages/indexer`, `packages/cli`)
- `ignore` ^6.0.2 - Gitignore-style filtering (`packages/indexer`)
- `fast-xml-parser` ^5.7.2 - XML parsing (`packages/core`)

**Frontend:**

- `react-router-dom` ^7.2.0 - Routing (`apps/dashboard`)
- `recharts` ^3.8.1 - Charts/visualization (`apps/dashboard`)
- `tailwindcss` ^4.0.0 - Styling (`apps/dashboard`)

## Monorepo Structure

**Workspace packages (`packages/`):**
| Package | Purpose |
|---------|---------|
| `@ia-framework/core` | Shared types, config, logging |
| `@ia-framework/ast-parser` | Tree-sitter AST parsing |
| `@ia-framework/embedding` | Embedding provider abstraction |
| `@ia-framework/vector-store` | Qdrant client wrapper |
| `@ia-framework/retrieval` | RAG retrieval logic |
| `@ia-framework/indexer` | Codebase indexing pipeline |
| `@ia-framework/mcp-server` | MCP server for AI tools |
| `@ia-framework/cli` | CLI entry point (`ia-framework` binary) |
| `@ia-framework/dashboard-api` | Hono API server |
| `@ia-framework/observability` | Token usage/metrics tracking |
| `@ia-framework/benchmark` | RAG quality benchmarks |
| `@ia-framework/project-detector` | Target project stack detection |
| `@ia-framework/db-context` | PostgreSQL schema introspection |

**Apps (`apps/`):**
| App | Purpose |
|-----|---------|
| `@ia-framework/dashboard` | React monitoring UI |

## Configuration

**TypeScript:**

- Base config: `tsconfig.base.json` (ES2022, NodeNext modules, strict + exactOptionalPropertyTypes + noUncheckedIndexedAccess)
- Each package extends base

**Environment:**

- `.env.example` documents available vars
- `IA_FRAMEWORK_DIR` - Path to framework data directory
- `OPENAI_API_KEY` - Optional cloud embeddings
- `TARGET_PROJECT_PATH` - Target project location
- `DASHBOARD_PORT` - Default 3000
- `QDRANT_HTTP_PORT` / `QDRANT_GRPC_PORT` - Default 6333/6334

**Build:**

- `turbo.json` - Task graph (build → typecheck/test depend on ^build)
- Each package uses `tsup` with outputs to `dist/`

## Platform Requirements

**Development:**

- Node.js >=22.0.0
- pnpm >=10.0.0
- Docker (for Qdrant and dashboard containers)

**Production:**

- Docker Compose v2 (runs Qdrant + dashboard)
- Qdrant container (latest/v1.13+)
- Optional: Ollama on host for local embeddings

---

_Stack analysis: 2026-05-21_
