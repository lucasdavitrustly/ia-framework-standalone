# ia-framework

A local RAG (Retrieval-Augmented Generation) framework that gives AI coding assistants deep understanding of your codebase. It indexes your project with AST-aware chunking, stores dual-vector embeddings in Qdrant, and serves context to [OpenCode](https://opencode.ai) through MCP tools — all running locally on your machine.

**Core idea:** Better context in, better code out.

## What It Does

```
Your Project                  ia-framework                    OpenCode
┌──────────────┐    index    ┌───────────────┐    MCP     ┌──────────────┐
│ TypeScript    │ ─────────► │ AST Parser    │ ────────── │ search_      │
│ Python       │            │ Embeddings    │  tools     │   codebase   │
│ Go / Rust    │            │ Qdrant        │            │ get_file     │
│ Java / ...   │            │ Dep Graph     │            │ get_deps     │
└──────────────┘            └───────────────┘            └──────────────┘
                                   │
                            ┌──────┴───────┐
                            │  Dashboard   │
                            │  :3000       │
                            └──────────────┘
```

1. **Indexes your codebase** — parses files with tree-sitter into function/class/interface-level chunks (not arbitrary text splits), then generates dual embeddings (text + code vectors) stored in Qdrant
2. **Serves context via MCP** — OpenCode calls `search_codebase`, `get_file`, and `get_dependencies` tools during conversations to pull in relevant code
3. **Expands results along the dependency graph** — search results include 1-2 hops of imported files so the AI sees the full picture
4. **Tracks everything** — token usage, retrieval quality, indexing status, all visible in a browser dashboard
5. **Benchmarks RAG quality** — measure Hit@K and MRR to prove the system actually helps and tune configurations

## Architecture

```
ia-framework/
├── packages/
│   ├── core/               # Shared types, config loader, Zod schemas, logger
│   ├── ast-parser/         # tree-sitter WASM parser (TS, Python, more)
│   ├── embedding/          # Provider interface + Ollama/OpenAI adapters
│   ├── vector-store/       # Qdrant client (dual named vectors)
│   ├── indexer/            # File walker, incremental indexing, dependency edges
│   ├── retrieval/          # Search engine, dependency graph, hop expansion
│   ├── mcp-server/         # MCP tools served via stdio transport
│   ├── observability/      # Token counter, metrics SQLite store
│   ├── benchmark/          # Hit@K, MRR, benchmark store, run comparison
│   ├── project-detector/   # Auto-detect language, framework, package manager
│   ├── db-context/         # PostgreSQL schema indexing
│   ├── dashboard-api/      # Hono REST API + serves React frontend
│   └── cli/                # Commander.js CLI (index, search, status, etc.)
├── apps/
│   └── dashboard/          # React 19 + Recharts + Tailwind monitoring UI
├── scripts/                # Installer helper scripts
├── install.sh              # One-shot installer
├── docker-compose.yml      # Qdrant + Dashboard containers
└── docker-compose.override.yml.example  # Dev overrides template (copied by install.sh)
```

**Stack:** TypeScript, pnpm workspaces, Turborepo, Vitest, Qdrant, tree-sitter (WASM), Hono, React 19, Zod, better-sqlite3.

## Prerequisites

The installer (`install.sh`) auto-detects and installs missing tools. If a **required** tool fails to install, the installer exits. **Optional** tools print a warning and continue.

| Tool | Version | Install method | Required | Notes |
|------|---------|----------------|----------|-------|
| **Docker** | Latest | macOS: `brew install --cask docker` / Linux: `apt-get install docker.io` or `dnf install docker` | **Yes** — hard fail | Runs Qdrant and the dashboard. On macOS, starts Docker Desktop and waits up to 60s for daemon. On Linux, enables + starts systemd service and adds user to `docker` group. |
| **Node.js** | >= 22.0.0 | macOS: `brew install node@22` / Linux: NodeSource `setup_22.x` script | **Yes** — hard fail | Upgrades existing Node.js if below v22. |
| **pnpm** | >= 10.0.0 | `npm install -g pnpm` | **Yes** — hard fail | Installed in Step 2 after Node.js is confirmed. |
| **Ollama** | Latest | macOS: `brew install ollama` / Linux: `ollama.com/install.sh` | **No** — soft fail | Also starts the Ollama service and pulls `nomic-embed-text` embedding model. If install or model pull fails, prints warning and continues. |
| **OpenCode** | Latest | `npm install -g @opencode-sh/opencode` | **No** — soft fail | AI coding assistant that consumes MCP tools. If install fails, prints warning and continues — you can install manually later. |

> If you skip Ollama, set `OPENAI_API_KEY` and change `embedding.provider` to `"openai"` in `project.json` for cloud embeddings.

## Quick Start (One Command)

```bash
# 1. Clone the framework
git clone <your-repo-url>/ia-framework.git
cd ia-framework

# 2. Run the installer
./install.sh
```

The installer will:

1. **Check and install prerequisites** — Docker and Node.js 22+ are required (installer exits if they fail). Ollama and OpenCode are optional (installer warns and continues if they fail).
2. Install **pnpm** if missing (`npm install -g pnpm`)
3. Build all 14 packages (`pnpm install && pnpm build`)
4. Prompt for your **target project path**, **auto-detect your project's tech stack** (languages, frameworks, package manager, test runner), and create `.ia-framework/project.json` with the detected profile
5. Start **Qdrant** (vector database) and the **monitoring dashboard** via Docker Compose
6. Configure **OpenCode's MCP server** to connect to ia-framework
7. **Inject RAG tool guidance** into your target project's `AGENTS.md` / `CLAUDE.md`
8. Run the **initial codebase indexing** (parses + embeds + stores in Qdrant)

After it completes:

- **Dashboard:** http://localhost:3000
- **Restart OpenCode** to load the MCP tools
- You're ready to go — OpenCode now has deep codebase understanding

## Manual Setup (Step by Step)

If you prefer to set things up manually or the installer doesn't fit your environment:

### Step 1: Install Dependencies and Build

```bash
git clone <your-repo-url>/ia-framework.git
cd ia-framework

# Install and build
pnpm install
pnpm build

# Verify everything works
pnpm test        # 218 tests across 13 packages
pnpm typecheck   # Type-check all packages
```

### Step 2: Start Qdrant

```bash
docker compose up -d qdrant
```

Qdrant will be available at `http://localhost:6333`. Data persists in a named Docker volume (`ia-framework-qdrant-data`).

### Step 3: Set Up Ollama (Local Embeddings)

```bash
# Install Ollama if you haven't: https://ollama.ai
ollama serve &          # Start Ollama in the background
ollama pull nomic-embed-text   # Download the embedding model
```

Or skip this and use OpenAI embeddings by setting `OPENAI_API_KEY` and updating the config (see Step 4).

### Step 4: Create the Configuration

Create `.ia-framework/project.json`:

```bash
mkdir -p .ia-framework
```

```json
{
  "targetProjectPath": "/absolute/path/to/your/project",
  "embedding": {
    "provider": "ollama",
    "model": "nomic-embed-text",
    "baseUrl": "http://localhost:11434",
    "dimensions": 768
  },
  "vectorStore": {
    "host": "localhost",
    "port": 6333,
    "collectionName": "codebase"
  },
  "indexing": {
    "includePatterns": [
      "**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx",
      "**/*.py", "**/*.go", "**/*.rs", "**/*.java"
    ],
    "excludePatterns": [
      "**/node_modules/**", "**/dist/**", "**/build/**",
      "**/.git/**", "**/coverage/**", "**/__pycache__/**"
    ],
    "respectGitignore": true
  }
}
```

<details>
<summary>Using OpenAI embeddings instead</summary>

```json
{
  "targetProjectPath": "/absolute/path/to/your/project",
  "embedding": {
    "provider": "openai",
    "model": "text-embedding-3-small",
    "apiKey": "sk-...",
    "dimensions": 1536
  },
  "vectorStore": {
    "host": "localhost",
    "port": 6333,
    "collectionName": "codebase"
  }
}
```

Or set the API key via environment variable: `export OPENAI_API_KEY=sk-...`

</details>

### Step 5: Index Your Codebase

```bash
node packages/cli/dist/bin.js index
```

This walks your project, parses files with tree-sitter into AST-aware chunks, generates embeddings, and stores them in Qdrant. It also builds a file-level dependency graph (`graph.sqlite`) for hop expansion.

Subsequent runs are incremental — only modified files (detected via `git diff`) are re-indexed.

### Step 6: Verify It Works

```bash
# Check status (Qdrant connection, chunk count, config)
node packages/cli/dist/bin.js status

# Search your codebase
node packages/cli/dist/bin.js search "authentication middleware"
node packages/cli/dist/bin.js search "database connection pool" --limit 5
```

### Step 7: Connect to OpenCode

Add the MCP server to OpenCode's config at `~/.config/opencode/config.json`:

```json
{
  "mcpServers": {
    "ia-framework": {
      "command": "node",
      "args": ["/path/to/ia-framework/packages/mcp-server/dist/bin.js"],
      "env": {
        "IA_FRAMEWORK_CONFIG": "/path/to/ia-framework/.ia-framework/project.json"
      }
    }
  }
}
```

Restart OpenCode. The following tools are now available to your AI assistant:

| MCP Tool | Description |
|----------|-------------|
| `search_codebase` | Semantic search with dependency graph expansion |
| `get_file` | Retrieve all indexed chunks for a specific file |
| `get_dependencies` | Get imports and exports for a file |
| `query_database` | Execute SQL against a configured PostgreSQL database |
| `index_database_schema` | Index database schema into Qdrant |

### Step 8: Start the Dashboard (Optional)

```bash
docker compose up -d dashboard
```

> **Note:** Docker Compose auto-loads `docker-compose.override.yml` if present. The installer copies `docker-compose.override.yml.example` (dev defaults) for you. Edit the override file locally to customize ports, log levels, or add services — it's gitignored.

Open http://localhost:3000 to see:

- **Overview** — Qdrant health, indexed chunks, token usage, benchmark scores
- **Config** — Detected project profile, current configuration
- **Token Usage** — Daily token consumption charts, per-query breakdown
- **Benchmarks** — Hit@K and MRR trends over time
- **Indexing** — Trigger re-indexing, view progress

### Step 9: Inject RAG Guidance (Optional)

This adds documentation to your target project telling AI assistants how to use the RAG tools:

```bash
# Auto-detects AGENTS.md or CLAUDE.md in your target project
node packages/cli/dist/bin.js agents inject

# Or target a specific file
node packages/cli/dist/bin.js agents inject --file /path/to/project/CLAUDE.md

# Check injection status
node packages/cli/dist/bin.js agents check
```

## CLI Reference

All commands accept `--config <path>` to override the default config location (`.ia-framework/project.json`).

```
ia-framework <command>

Commands:
  index                          Index target project codebase into Qdrant
    --force                      Re-index all files (skip incremental detection)
    --config <path>              Path to project.json

  search <query>                 Semantic search with dependency graph expansion
    --limit <n>                  Max results (default: 10)
    --threshold <n>              Min similarity score 0-1 (default: 0.5)
                                 Uses retrieval.expansionHops from config (0=off, 1=direct, 2=transitive)

  status                         Show config, Qdrant connection, chunk count

  benchmark run                  Run retrieval quality benchmarks (Hit@K, MRR)
    --top-k <n>                  Top-K results to evaluate (default: 10)
    --threshold <n>              Score threshold (default: 0.5)
    --baseline                   Run as no-RAG baseline for comparison
    --label <text>               Label for this run
    --corpus <path>              Path to benchmark queries JSON

  benchmark list                 List recent benchmark runs
  benchmark history              ASCII chart of Hit@K trend
  benchmark compare <id1> <id2>  Side-by-side comparison of two runs

  db configure                   Interactive PostgreSQL connection setup
  db connect                     Test database connection
  db index                       Index database schema into Qdrant
  db status                      Show database config and connection status

  agents inject                  Inject RAG guidance into target project docs
    --file <path>                Target file (overrides auto-detection)
  agents check                   Check if RAG guidance is present
```

## MCP Tools (Detailed)

### search_codebase

The primary tool. AI assistants call this to find relevant code for the task at hand.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `query` | string | required | Natural language search query |
| `limit` | number | 10 | Maximum number of results |
| `score_threshold` | number | 0.5 | Minimum similarity score (0-1) |
| `expand_hops` | number | 1 | Dependency graph expansion: 0=off, 1=direct imports, 2=transitive |

**Example response:**

```markdown
## Code results for: "authentication middleware"

### 1. src/auth/middleware.ts (validateToken) — score: 0.89 [both]
```typescript
export function validateToken(req: Request): AuthResult {
  const token = req.headers.get('Authorization')?.split(' ')[1];
  // ...
}
```

### 2. src/auth/types.ts (AuthResult) — score: 0.82 [text]  ← expanded via dependency graph
```typescript
export interface AuthResult {
  valid: boolean;
  userId?: string;
}
```
```

The `[both]`, `[text]`, `[code]` tags show which vector matched. Expanded results (from the dependency graph) appear alongside direct matches so the AI gets the full context.

### get_file

Retrieves all indexed chunks for a file in reading order.

| Parameter | Type | Description |
|-----------|------|-------------|
| `path` | string | Relative file path (e.g., `src/auth/middleware.ts`) |

### get_dependencies

Returns imports and exports for a file.

| Parameter | Type | Description |
|-----------|------|-------------|
| `path` | string | Relative file path |

### query_database

Executes SQL against a configured PostgreSQL database. Only available if `db.json` is configured via `ia-framework db configure`.

| Parameter | Type | Description |
|-----------|------|-------------|
| `sql` | string | SQL query to execute |

### index_database_schema

Triggers indexing of the PostgreSQL schema into Qdrant so `search_codebase` can find table/column information.

## Configuration

The main config file is `.ia-framework/project.json`:

```json
{
  "targetProjectPath": "/path/to/project",
  "embedding": {
    "provider": "ollama",        // "ollama" or "openai"
    "model": "nomic-embed-text", // Model name
    "baseUrl": "http://localhost:11434",
    "dimensions": 768
  },
  "vectorStore": {
    "host": "localhost",
    "port": 6333,
    "collectionName": "codebase"
  },
  "indexing": {
    "includePatterns": ["**/*.ts", "**/*.py"],
    "excludePatterns": ["**/node_modules/**"],
    "respectGitignore": true
  },
  "retrieval": {
    "mode": "mcp-only",     // "mcp-only", "auto-context" (v2), "combined" (v2)
    "expansionHops": 1,     // 0 = off, 1 = direct imports, 2 = transitive
    "autoContextTopK": 5    // Top results for auto-context (v2)
  }
}
```

### Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `IA_FRAMEWORK_CONFIG` | Path to `project.json` | `.ia-framework/project.json` |
| `IA_FRAMEWORK_DIR` | Path to `.ia-framework/` directory (for Docker) | — |
| `DASHBOARD_PORT` | Dashboard port | `3000` |
| `QDRANT_HTTP_PORT` | Qdrant HTTP port | `6333` |
| `QDRANT_GRPC_PORT` | Qdrant gRPC port | `6334` |
| `OPENAI_API_KEY` | OpenAI API key (if using cloud embeddings) | — |

Copy `.env.example` to `.env` and fill in values as needed. The installer (`install.sh`) generates `.env` automatically — manual setup only needs this for custom overrides.

## Benchmarking

Measure whether RAG actually helps by running retrieval benchmarks:

```bash
# Create a benchmark query corpus
# (scaffolded automatically on first run at .ia-framework/benchmark-queries.json)
node packages/cli/dist/bin.js benchmark run

# Run a no-RAG baseline for comparison
node packages/cli/dist/bin.js benchmark run --baseline

# Compare runs
node packages/cli/dist/bin.js benchmark list
node packages/cli/dist/bin.js benchmark compare <run-id-1> <run-id-2>

# View trend over time
node packages/cli/dist/bin.js benchmark history
```

The benchmark corpus is a JSON file with queries and expected files:

```json
[
  {
    "query": "authentication middleware",
    "expectedFiles": ["src/auth/middleware.ts", "src/auth/types.ts"]
  },
  {
    "query": "database connection pool",
    "expectedFiles": ["src/db/pool.ts"]
  }
]
```

Results are stored in `benchmarks.sqlite` with timestamps and config snapshots.

## Database Context (Optional)

If your project uses PostgreSQL, ia-framework can index the database schema as additional context:

```bash
# Interactive setup — prompts for host, port, database, user, password
node packages/cli/dist/bin.js db configure

# Test connection
node packages/cli/dist/bin.js db connect

# Index schema into Qdrant
node packages/cli/dist/bin.js db index

# Check status
node packages/cli/dist/bin.js db status
```

After indexing, `search_codebase` queries will also match table names, column types, and relationships. The `query_database` MCP tool lets the AI run SQL directly.

## Development

### Running Tests

```bash
pnpm test           # All 218 tests (Turborepo-cached)
pnpm typecheck      # Type-check all packages
pnpm build          # Build all 14 packages
pnpm lint           # ESLint + Prettier
```

### Project Structure

| Package | Tests | Purpose |
|---------|-------|---------|
| `@ia-framework/core` | 7 | Config loader, schemas, logger, shared types |
| `@ia-framework/ast-parser` | 15 | tree-sitter chunking (functions, classes, interfaces) |
| `@ia-framework/embedding` | 8 | Ollama + OpenAI embedding adapters |
| `@ia-framework/vector-store` | 8 | Qdrant dual-vector storage |
| `@ia-framework/indexer` | 17 | File walker, incremental indexing, context sources |
| `@ia-framework/retrieval` | 24 | Search engine, dependency graph, hop expansion |
| `@ia-framework/mcp-server` | 17 | 5 MCP tools via stdio transport |
| `@ia-framework/observability` | 27 | Token counting, metrics SQLite store |
| `@ia-framework/benchmark` | 19 | Hit@K, MRR, benchmark store, comparison |
| `@ia-framework/project-detector` | 19 | Language, framework, package manager detection |
| `@ia-framework/db-context` | 14 | PostgreSQL schema extraction |
| `@ia-framework/dashboard-api` | 20 | Hono REST API (8 endpoints) |
| `@ia-framework/cli` | 23 | Commander.js CLI (6 command groups) |
| `@ia-framework/dashboard` | — | React 19 monitoring UI |

### Adding a New Language

ia-framework uses tree-sitter WASM grammars. To add support for a new language:

1. Install the grammar: `pnpm add tree-sitter-<language> -F @ia-framework/ast-parser`
2. Add a grammar loader in `packages/ast-parser/src/`
3. Register chunk extraction rules for the language's node types
4. Add include patterns in your `project.json`

Currently supported: TypeScript, TSX, JavaScript, JSX, Python, Java.

## Troubleshooting

**MCP tools not appearing in OpenCode:**
1. Verify `packages/mcp-server/dist/bin.js` exists (`pnpm build` if missing)
2. Check `~/.config/opencode/config.json` has the correct paths
3. Restart OpenCode completely

**Search returns no results:**
1. Run `node packages/cli/dist/bin.js status` to check Qdrant connection and chunk count
2. Re-index: `node packages/cli/dist/bin.js index --force`
3. Lower the threshold: `--threshold 0.3`

**Qdrant not reachable:**
```bash
docker compose up -d qdrant
# Check health
curl http://localhost:6333/readyz
```

**Ollama embedding errors:**
```bash
ollama serve &                   # Ensure Ollama is running
ollama pull nomic-embed-text     # Ensure model is downloaded
curl http://localhost:11434/     # Check Ollama is responding
```

**Dashboard not loading:**
```bash
docker compose up -d dashboard
docker compose logs dashboard    # Check for errors
```

## License

Private / Internal use.
