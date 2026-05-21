# External Integrations

**Analysis Date:** 2026-05-21

## APIs & External Services

**AI/Embedding Providers:**

- OpenAI API - Cloud embeddings for codebase indexing
  - SDK/Client: Custom adapter in `packages/embedding`
  - Auth: `OPENAI_API_KEY` env var
- Ollama (local) - Local embedding models (nomic-embed-text, etc.)
  - SDK/Client: Custom adapter in `packages/embedding`
  - Auth: None (local service)
  - Base URL: `OLLAMA_BASE_URL` (default `http://localhost:11434`, overridden to `http://host.docker.internal:11434` in Docker)

**MCP Protocol:**

- OpenCode integration via Model Context Protocol
  - Implementation: `packages/mcp-server` using `@modelcontextprotocol/sdk`
  - Transport: StdioServerTransport
  - Binary: `ia-mcp-server` (defined in `packages/mcp-server/package.json`)

## Data Storage

**Vector Database:**

- Qdrant (Docker container)
  - Connection: `QDRANT_HTTP_PORT` (default 6333), `QDRANT_GRPC_PORT` (default 6334)
  - Client: `@qdrant/js-client-rest` ^1.13.0 via `packages/vector-store`
  - Container: `ia-framework-qdrant` with persistent volume `ia-framework-qdrant-data`
  - Used by: `packages/vector-store`, `packages/mcp-server`, `packages/cli`, `packages/dashboard-api`

**Relational Database (Target Project):**

- PostgreSQL - Target project database schema introspection
  - Client: `pg` ^8.13.0 via `packages/db-context`
  - Connection: Configured per target project (via `DB_HOST` override in Docker)
  - Purpose: Provides database schema context to AI tools

**Embedded Database (Metrics):**

- SQLite via `better-sqlite3` ^12.8.0
  - Used by: `packages/observability` (token usage), `packages/benchmark` (benchmark results), `packages/retrieval` (BM25 index)
  - Location: Within `.ia-framework/` data directory

**File Storage:**

- Local filesystem only
  - `.ia-framework/` directory stores project config, SQLite databases
  - Volume-mounted into Docker containers via `IA_FRAMEWORK_DIR`

**Caching:**

- None (no Redis/Memcached)

## Authentication & Identity

**Auth Provider:**

- None - Single-user local tool, no authentication system

## Monitoring & Observability

**Error Tracking:**

- None (no Sentry/external service)

**Logs:**

- Pino ^9.0.0 structured logging (`packages/core`)
- Dashboard API healthcheck at `/api/status`

**Metrics:**

- Custom SQLite-based token usage tracking (`packages/observability`)
- Benchmark results stored in SQLite (`packages/benchmark`)

## CI/CD & Deployment

**Hosting:**

- Local Docker Compose - All services run on developer machine

**CI Pipeline:**

- Not detected (no `.github/workflows`, no CI config files found)

## Environment Configuration

**Required env vars:**

- `IA_FRAMEWORK_DIR` - Path to `.ia-framework/` data directory (set by installer)

**Optional env vars:**

- `OPENAI_API_KEY` - For cloud embeddings
- `TARGET_PROJECT_PATH` - Target project location
- `DASHBOARD_PORT` - Dashboard port (default 3000)
- `QDRANT_HTTP_PORT` / `QDRANT_GRPC_PORT` - Qdrant ports
- `OLLAMA_BASE_URL` - Ollama host URL
- `DB_HOST` - PostgreSQL host override for Docker

**Secrets location:**

- `.env` file (gitignored)
- `.env.example` documents all variables

## Webhooks & Callbacks

**Incoming:**

- None detected

**Outgoing:**

- None detected

## Docker Services

**Defined in `docker-compose.yml`:**

| Service     | Image                                                                            | Ports                    | Purpose             |
| ----------- | -------------------------------------------------------------------------------- | ------------------------ | ------------------- |
| `qdrant`    | `qdrant/qdrant:latest`                                                           | 6333 (HTTP), 6334 (gRPC) | Vector storage      |
| `dashboard` | `ia-framework-dashboard:latest` (built from `packages/dashboard-api/Dockerfile`) | 3000                     | Monitoring API + UI |

**Networking:**

- Dashboard connects to Qdrant via Docker service name `qdrant`
- Dashboard reaches host services (Ollama, PostgreSQL) via `host.docker.internal`

---

_Integration audit: 2026-05-21_
