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

1. **Indexes your codebase** — parses files with tree-sitter into function/class/interface-level chunks (not arbitrary text splits), splits oversized constructs with signature-preserving context, then generates dual embeddings (text + code vectors) stored in Qdrant
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

| Tool         | Version   | Install method                                                                                   | Required            | Notes                                                                                                                                                                                                                                                                 |
| ------------ | --------- | ------------------------------------------------------------------------------------------------ | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Docker**   | Latest    | macOS: `brew install --cask docker` / Linux: `apt-get install docker.io` or `dnf install docker` | **Yes** — hard fail | Runs Qdrant and the dashboard. On macOS, starts Docker Desktop and waits up to 60s for daemon. On Linux, enables + starts systemd service and adds user to `docker` group.                                                                                            |
| **Node.js**  | >= 22.0.0 | macOS: `brew install node@22` / Linux: NodeSource `setup_22.x` script                            | **Yes** — hard fail | Upgrades existing Node.js if below v22.                                                                                                                                                                                                                               |
| **pnpm**     | >= 10.0.0 | `npm install -g pnpm`                                                                            | **Yes** — hard fail | Installed in Step 2 after Node.js is confirmed.                                                                                                                                                                                                                       |
| **Ollama**   | Latest    | macOS: `brew install ollama` / Linux: `ollama.com/install.sh`                                    | **No** — soft fail  | Also starts the Ollama service and presents an interactive model selection menu (see [Embedding Models](#embedding-models)). If install or model pull fails, prints warning and continues. Browse available models at [ollama.com/search](https://ollama.com/search). |
| **OpenCode** | Latest    | `npm install -g @opencode-sh/opencode`                                                           | **No** — soft fail  | AI coding assistant that consumes MCP tools. If install fails, prints warning and continues — you can install manually later.                                                                                                                                         |

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
4. **Install `ia-framework` as a global CLI tool** — runs `npm link` inside `packages/cli` so `ia-framework` is available from anywhere in your terminal. If linking fails, the CLI is still usable via `node /path/to/ia-framework/packages/cli/dist/bin.js`.
5. **Select an embedding model** — shows your locally available Ollama models (with `[embed]` hints for known embedding models), lets you pick one or enter a custom name, and auto-pulls it if needed
6. Prompt for your **target project path**, **auto-detect your project's tech stack** (languages, frameworks, package manager, test runner), and create `.ia-framework/project.json` with the detected profile
7. Start **Qdrant** (vector database) and the **monitoring dashboard** via Docker Compose
8. Configure **OpenCode's MCP server** to connect to ia-framework
9. **Inject RAG tool guidance** into your target project's `AGENTS.md` / `CLAUDE.md`

After it completes:

- **Dashboard:** http://localhost:3000
- **Restart OpenCode** to load the MCP tools
- **Verify the CLI:** `ia-framework hello` — prints available commands and confirms the install is working
- **Start indexing** by running `ia-framework index` in your terminal

> Indexing is intentionally not run during install — your codebase may be large and you may want to configure include/exclude patterns first. Start it when you're ready.

## Recent Improvements

- **Graceful indexing stop** — `ia-framework index-stop` signals a running index job to halt cleanly after the current batch. The dashboard Stop button does the same.
- **Dashboard live updates** — The dashboard polls for progress every 2 seconds and automatically reflects CLI-triggered indexing — no manual refresh needed.
- **Multi-schema PostgreSQL indexing** — `db index` supports databases with multiple schemas.
- **Embedding model switching** — Switch models at any time with `--model`; dimension discovery and collection migration are handled automatically.
- **Qwen3 embedding support** — `qwen3-embedding:0.6b`, `1.7b`, and `4b` variants are recognized with correct dimensions (1024d, 2048d, 2560d).
- **32KB+ file support** — tree-sitter upgrade removes the previous file size limit for large source files.

---

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

### Step 2: Install the CLI Globally

```bash
cd packages/cli
npm link
cd ../..

# Verify
ia-framework hello
```

This makes `ia-framework` available as a global command. If `npm link` fails due to permissions, you can run the CLI directly:

```bash
node /path/to/ia-framework/packages/cli/dist/bin.js <command>
# Or set an alias in your shell profile:
alias ia-framework="node /path/to/ia-framework/packages/cli/dist/bin.js"
```

### Step 3: Start Qdrant

```bash
docker compose up -d qdrant
```

Qdrant will be available at `http://localhost:6333`. Data persists in a named Docker volume (`ia-framework-qdrant-data`).

### Step 4: Set Up Ollama (Local Embeddings)

```bash
# Install Ollama if you haven't: https://ollama.ai
ollama serve &          # Start Ollama in the background
ollama pull nomic-embed-text   # Download an embedding model (or any model you prefer)
```

> **Tip:** Browse all available models at [ollama.com/search](https://ollama.com/search). Popular embedding models include `nomic-embed-text` (768d), `mxbai-embed-large` (1024d), `all-minilm` (384d), and `qwen3-embedding` (0.6b→1024d, 1.7b→2048d, 4b→2560d).

You can skip specifying a model in the config — the `index` command will present an interactive model selection if none is configured (see [Embedding Models](#embedding-models)).

Or skip Ollama entirely and use OpenAI embeddings by setting `OPENAI_API_KEY` and updating the config (see Step 5).

### Step 5: Create the Configuration

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
      "**/*.ts",
      "**/*.tsx",
      "**/*.js",
      "**/*.jsx",
      "**/*.py",
      "**/*.go",
      "**/*.rs",
      "**/*.java"
    ],
    "excludePatterns": [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/.git/**",
      "**/coverage/**",
      "**/__pycache__/**"
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

### Step 6: Index Your Codebase

```bash
ia-framework index
```

This walks your project, parses files with tree-sitter into AST-aware chunks, generates embeddings, and stores them in Qdrant. It also builds a file-level dependency graph (`graph.sqlite`) for hop expansion.

Subsequent runs are incremental — only modified files (detected via `git diff`) are re-indexed.

### Step 7: Verify It Works

```bash
# Check status (Qdrant connection, chunk count, config)
ia-framework status

# Search your codebase
ia-framework search "authentication middleware"
ia-framework search "database connection pool" --limit 5
```

### Step 8: Connect to OpenCode

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

| MCP Tool                | Description                                          |
| ----------------------- | ---------------------------------------------------- |
| `search_codebase`       | Semantic search with dependency graph expansion      |
| `get_file`              | Retrieve all indexed chunks for a specific file      |
| `get_dependencies`      | Get imports and exports for a file                   |
| `query_database`        | Execute SQL against a configured PostgreSQL database |
| `index_database_schema` | Index database schema into Qdrant                    |

### Step 9: Start the Dashboard (Optional)

```bash
docker compose up -d dashboard
```

> **Note:** Docker Compose auto-loads `docker-compose.override.yml` if present. The installer copies `docker-compose.override.yml.example` (dev defaults) for you. Edit the override file locally to customize ports, log levels, or add services — it's gitignored.

Open http://localhost:3000 to see:

- **Overview** — Qdrant health, indexed chunks, token usage, benchmark scores — includes a **"Start Indexing"** button to trigger the initial (or a fresh) index run
- **Config** — Detected project profile, current configuration
- **Token Usage** — Daily token consumption charts, per-query breakdown
- **Benchmarks** — Hit@K and MRR trends over time
- **Indexing** — Trigger re-indexing, view progress

### Step 10: Inject RAG Guidance (Optional)

This adds documentation to your target project telling AI assistants how to use the RAG tools:

```bash
# Auto-detects AGENTS.md or CLAUDE.md in your target project
ia-framework agents inject

# Or target a specific file
ia-framework agents inject --file /path/to/project/CLAUDE.md

# Check injection status
ia-framework agents check
```

## CLI Reference

All commands accept `--config <path>` to override the default config location (`.ia-framework/project.json`). The config path can also be set via the `IA_FRAMEWORK_CONFIG` environment variable.

### Core Commands

```bash
ia-framework hello
```

Verify the CLI is installed and working. Prints available commands and the dashboard URL. Run this after install to confirm everything is set up.

```bash
ia-framework index [options]
  --force            Re-index all files (skip incremental detection)
  --model <name>     Override embedding model for this run (auto-pulls if not installed,
                     auto-discovers dimensions, detects collection mismatches)
  --config <path>    Path to project.json
```

Indexes your target project into Qdrant using AST-aware chunking. Subsequent runs are incremental — only files changed since the last indexed git commit are re-processed. Use `--force` to re-index everything.

```bash
ia-framework index-stop [options]
  --config <path>    Path to project.json
```

Request graceful cancellation of a running index job. The indexer finishes its current batch then stops. The dashboard Stop button does the same thing.

```bash
ia-framework search <query> [options]
  --limit <n>        Max results (default: 10)
  --threshold <n>    Min similarity score 0–1 (default: 0.5)
  --config <path>    Path to project.json

# Examples
ia-framework search "authentication middleware"
ia-framework search "database connection pool" --limit 5 --threshold 0.7
```

Semantic search with dependency graph expansion. Results include 1–2 hops of imported files based on `retrieval.expansionHops` in config (0=off, 1=direct imports, 2=transitive).

```bash
ia-framework status [options]
  --config <path>    Path to project.json
```

Shows current config, Qdrant connection status, indexed chunk count, last indexed git commit, and token usage summary.

---

### Benchmark Commands

```bash
ia-framework benchmark run [options]
  --top-k <n>        Results to retrieve per query (default: 10)
  --threshold <n>    Score threshold 0–1 (default: 0.5)
  --baseline         Run as no-RAG baseline (sets threshold > 1.0 so nothing matches)
  --label <text>     Human-readable label for this run
  --corpus <path>    Path to benchmark-queries.json (default: .ia-framework/benchmark-queries.json)
  --config <path>    Path to project.json
```

Runs retrieval benchmarks against the indexed codebase. On first run, auto-scaffolds an example corpus at `.ia-framework/benchmark-queries.json` — edit it to match your project, then re-run.

```bash
ia-framework benchmark list [options]
  --config <path>    Path to project.json
```

Lists recent benchmark runs with ID, label, date, Hit@K, and MRR scores.

```bash
ia-framework benchmark history [options]
  --config <path>    Path to project.json
```

Renders an ASCII chart of Hit@K scores over time to show retrieval quality trends.

```bash
ia-framework benchmark compare <run-id-1> <run-id-2> [options]
  --config <path>    Path to project.json
```

Side-by-side comparison of two benchmark runs. Use IDs from `benchmark list`.

---

### Database Commands

Only available after running `ia-framework db configure`. See [Database Context](#database-context-optional) for setup.

```bash
ia-framework db configure [options]
  --config <path>    Path to project.json
```

Interactive prompt for PostgreSQL connection details (host, port, database, user, password, SSL). Saves to `.ia-framework/db.json`.

```bash
ia-framework db connect [options]
  --config <path>    Path to project.json
```

Tests the database connection configured in `db.json` and prints a success or error message.

```bash
ia-framework db index [options]
  --config <path>    Path to project.json
```

Indexes the PostgreSQL schema (tables, columns, types, relationships) into Qdrant. Supports multiple schemas. After this, `search_codebase` results will include database schema matches.

```bash
ia-framework db status [options]
  --config <path>    Path to project.json
```

Shows the database configuration from `db.json` and current connection status.

---

### Agent Documentation Commands

```bash
ia-framework agents inject [options]
  --file <path>      Target file (overrides auto-detection)
  --config <path>    Path to project.json
```

Injects RAG tool guidance into your target project's `AGENTS.md` or `CLAUDE.md`. Auto-detects the file; use `--file` to target a specific path. Idempotent — safe to run multiple times.

```bash
ia-framework agents check [options]
  --config <path>    Path to project.json
```

Checks whether RAG guidance has been injected into the target project's agent documentation.

## MCP Tools (Detailed)

> These tools are automatically documented in your target project's `AGENTS.md` or `CLAUDE.md` when you run `ia-framework agents inject`. AI assistants in that project will find usage guidance there.

### search_codebase

The primary tool. AI assistants call this to find relevant code for the task at hand.

| Parameter         | Type   | Default  | Description                                                       |
| ----------------- | ------ | -------- | ----------------------------------------------------------------- |
| `query`           | string | required | Natural language search query                                     |
| `limit`           | number | 10       | Maximum number of results                                         |
| `score_threshold` | number | 0.5      | Minimum similarity score (0-1)                                    |
| `expand_hops`     | number | 1        | Dependency graph expansion: 0=off, 1=direct imports, 2=transitive |

**Example response:**

````markdown
## Code results for: "authentication middleware"

### 1. src/auth/middleware.ts (validateToken) — score: 0.89 [both]

```typescript
export function validateToken(req: Request): AuthResult {
  const token = req.headers.get('Authorization')?.split(' ')[1];
  // ...
}
```
````

### 2. src/auth/types.ts (AuthResult) — score: 0.82 [text] ← expanded via dependency graph

```typescript
export interface AuthResult {
  valid: boolean;
  userId?: string;
}
```

````

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

## Extending with MCP Servers

ia-framework's MCP server provides codebase search tools, but OpenCode supports multiple MCP servers simultaneously. You can plug in additional MCP servers to give your AI assistant broader context — database schemas, documentation, structured reasoning, message queues, and more.

### Recommended MCP Integrations

These MCP servers work well alongside ia-framework:

| MCP Server | Purpose | What it adds |
|------------|---------|--------------|
| **[Context7](https://github.com/upstash/context7)** | Documentation retrieval | Up-to-date docs for any library — no more hallucinated APIs |
| **[Sequential Thinking](https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking)** | Structured reasoning | Multi-step problem decomposition for complex tasks |
| **PostgreSQL** (built-in) | Database context | Schema-aware SQL queries via ia-framework's `query_database` and `index_database_schema` tools |

### Configuring Additional MCP Servers

Add MCP servers to OpenCode's config at `~/.config/opencode/config.json`. Each server runs as a separate process and its tools become available alongside ia-framework's tools.

**Example — adding Context7 and Sequential Thinking alongside ia-framework:**

```json
{
  "mcpServers": {
    "ia-framework": {
      "command": "node",
      "args": ["/path/to/ia-framework/packages/mcp-server/dist/bin.js"],
      "env": {
        "IA_FRAMEWORK_CONFIG": "/path/to/ia-framework/.ia-framework/project.json"
      }
    },
    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp"]
    },
    "sequential-thinking": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-sequential-thinking"]
    }
  }
}
````

**Example — adding a PostgreSQL MCP server for direct database access:**

```json
{
  "mcpServers": {
    "postgres": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres"],
      "env": {
        "POSTGRES_CONNECTION_STRING": "postgresql://user:pass@localhost:5432/mydb"
      }
    }
  }
}
```

> **Note:** ia-framework already includes PostgreSQL support via the `db-context` package (`db configure`, `db index`, `query_database` MCP tool). A separate Postgres MCP server is only needed if you want the general-purpose MCP Postgres tools in addition to ia-framework's schema-indexed approach.

### Pluggable Architecture

The MCP protocol is standardized, so any MCP-compatible server works with OpenCode. Common additions:

- **Redis** — cache inspection and key-value context
- **RabbitMQ** — queue status and message routing context
- **GitHub** — issue and PR context
- **Filesystem** — direct file access outside the indexed project

Each server you add gives the AI assistant more context to work with. ia-framework's codebase search + other MCP servers = comprehensive project understanding.

## Configuration

The main config file is `.ia-framework/project.json`:

```json
{
  "targetProjectPath": "/path/to/project",
  "embedding": {
    "provider": "ollama", // "ollama" or "openai"
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
    "respectGitignore": true,
    "maxChunkLines": 200
  },
  "retrieval": {
    "mode": "mcp-only", // "mcp-only", "auto-context" (v2), "combined" (v2)
    "expansionHops": 1, // 0 = off, 1 = direct imports, 2 = transitive
    "autoContextTopK": 5 // Top results for auto-context (v2)
  }
}
```

### Environment Variables

| Variable              | Purpose                                         | Default                      |
| --------------------- | ----------------------------------------------- | ---------------------------- |
| `IA_FRAMEWORK_CONFIG` | Path to `project.json`                          | `.ia-framework/project.json` |
| `IA_FRAMEWORK_DIR`    | Path to `.ia-framework/` directory (for Docker) | —                            |
| `DASHBOARD_PORT`      | Dashboard port                                  | `3000`                       |
| `QDRANT_HTTP_PORT`    | Qdrant HTTP port                                | `6333`                       |
| `QDRANT_GRPC_PORT`    | Qdrant gRPC port                                | `6334`                       |
| `OPENAI_API_KEY`      | OpenAI API key (if using cloud embeddings)      | —                            |

Copy `.env.example` to `.env` and fill in values as needed. The installer (`install.sh`) generates `.env` automatically — manual setup only needs this for custom overrides.

## Embedding Models

ia-framework supports any Ollama embedding model. You can switch models at any time — the framework handles dimension discovery and collection migration automatically.

### Selecting a Model

**During install:** The installer shows an interactive menu of your locally available Ollama models. Known embedding models are marked with `[embed]` hints. You can also enter a custom model name, which will be auto-pulled.

```
  Select an embedding model:
    1. nomic-embed-text:latest [embed]
    2. mxbai-embed-large:latest [embed]
    3. qwen3-embedding:0.6b [embed]
    4. qwen3-embedding:1.7b [embed]
    5. qwen3-embedding:4b [embed]
    6. llama3:latest
    7. Enter a custom model name
  Select [1]:
```

**At index time:** Use the `--model` flag to switch models:

```bash
# Switch to a different embedding model
ia-framework index --model mxbai-embed-large

# Use any Ollama model — auto-pulls if not installed locally
ia-framework index --model nomic-embed-text
```

If no model is configured in `project.json` and no `--model` flag is given, the `index` command presents the same interactive selection menu.

> **Browse models:** [ollama.com/search](https://ollama.com/search) — search for embedding models to find one that fits your use case.

### Dimension Discovery

When you select a model, ia-framework automatically discovers its embedding dimensions using a 3-tier strategy:

| Priority | Method                 | How it works                                                                                                                                                                                      |
| -------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1        | **Known model map**    | Instant lookup for popular models (`nomic-embed-text`→768, `mxbai-embed-large`→1024, `all-minilm`→384, `qwen3-embedding:0.6b`→1024, `qwen3-embedding:1.7b`→2048, `qwen3-embedding:4b`→2560, etc.) |
| 2        | **Ollama `/api/show`** | Queries the model metadata for `embedding_length` — works for any model with published dimensions                                                                                                 |
| 3        | **Embed probe**        | Sends a test string to `/api/embed` and measures the returned vector length — universal fallback                                                                                                  |

This means you never need to manually specify `dimensions` in `project.json` — it's always auto-detected.

### Model Mismatch Detection

When you switch to a different embedding model, existing vectors in Qdrant become incompatible (different models produce different-dimensional vectors). The `index` command detects this automatically:

```
  ⚠ Embedding model mismatch detected!
    Previous model: nomic-embed-text (768d vectors)
    New model:      mxbai-embed-large (1024d vectors)
    Existing vectors are incompatible with the new model.

  Delete existing collection and re-index? (y/N):
```

If you confirm, the old collection is deleted and a full re-index runs with the new model. If you decline, no changes are made.

## Benchmarking

Measure whether RAG actually helps by running retrieval benchmarks:

```bash
# Create a benchmark query corpus
# (scaffolded automatically on first run at .ia-framework/benchmark-queries.json)
ia-framework benchmark run

# Run a no-RAG baseline for comparison
ia-framework benchmark run --baseline

# Compare runs
ia-framework benchmark list
ia-framework benchmark compare <run-id-1> <run-id-2>

# View trend over time
ia-framework benchmark history
```

The benchmark corpus is a JSON file with queries and expected files:

```json
{
  "queries": [
    {
      "id": "auth-middleware",
      "query": "authentication middleware",
      "expectedFiles": ["src/auth/middleware.ts", "src/auth/types.ts"]
    },
    {
      "id": "db-pool",
      "query": "database connection pool",
      "expectedFiles": ["src/db/pool.ts"]
    }
  ]
}
```

Results are stored in `benchmarks.sqlite` with timestamps and config snapshots. See [Benchmark Corpus](#benchmark-corpus) for a complete guide on writing effective queries.

## Benchmark Corpus

The benchmark corpus defines what "correct retrieval" means for your project — a set of natural language queries paired with the files that should appear in results.

### Auto-Scaffolding

On the first `benchmark run`, if no corpus file exists, the CLI auto-creates an example at `.ia-framework/benchmark-queries.json` and exits without running. Edit this file to match your codebase, then re-run.

### File Format

The corpus is a JSON file with a `queries` array. Each entry has:

| Field           | Required | Description                                                          |
| --------------- | -------- | -------------------------------------------------------------------- |
| `id`            | Yes      | Unique identifier (e.g. `"user-service"`)                            |
| `query`         | Yes      | Natural language search text — what a developer would type           |
| `expectedFiles` | Yes      | Array of relative file paths that _should_ appear in results (min 1) |
| `description`   | No       | Human-readable note about what this query tests                      |

Validated by Zod on load — malformed files produce clear error messages.

### Example

```json
{
  "queries": [
    {
      "id": "db-connection",
      "query": "database connection pool setup",
      "expectedFiles": ["src/db/pool.ts", "src/db/connection.ts"],
      "description": "Should find database connection and pooling logic"
    },
    {
      "id": "error-handling",
      "query": "global error handler middleware",
      "expectedFiles": ["src/middleware/error-handler.ts"]
    },
    {
      "id": "user-model",
      "query": "user data model schema definition",
      "expectedFiles": ["src/models/user.ts"]
    },
    {
      "id": "api-routes",
      "query": "REST API route registration",
      "expectedFiles": ["src/routes/index.ts", "src/routes/users.ts"]
    }
  ]
}
```

### Writing Effective Queries

- **Diverse coverage** — spread queries across different areas of the codebase (auth, config, models, routes, utils)
- **Realistic phrasing** — use how a developer would actually search (`"how do we handle auth"` rather than exact function names)
- **Correct expectedFiles** — these are the ground truth; if the expected file is wrong, the metric is meaningless
- **Sufficient volume** — 3 queries gives noisy metrics; aim for 15–30 for stable signal

### Limitations

The corpus is fully manual. There is no automatic generation from the codebase — you need to know your project well enough to write queries and their expected answers. This is intentional: the corpus defines what "correct retrieval" means for _your_ project, which requires human judgment.

## Database Context (Optional)

If your project uses PostgreSQL, ia-framework can index the database schema as additional context:

```bash
# Interactive setup — prompts for host, port, database, user, password
ia-framework db configure

# Test connection
ia-framework db connect

# Index schema into Qdrant
ia-framework db index

# Check status
ia-framework db status
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

| Package                          | Tests | Purpose                                             |
| -------------------------------- | ----- | --------------------------------------------------- |
| `@ia-framework/core`             | 7     | Config loader, schemas, logger, shared types        |
| `@ia-framework/ast-parser`       | 31    | tree-sitter chunking with oversized chunk splitting |
| `@ia-framework/embedding`        | 8     | Ollama + OpenAI embedding adapters                  |
| `@ia-framework/vector-store`     | 8     | Qdrant dual-vector storage                          |
| `@ia-framework/indexer`          | 17    | File walker, incremental indexing, context sources  |
| `@ia-framework/retrieval`        | 24    | Search engine, dependency graph, hop expansion      |
| `@ia-framework/mcp-server`       | 17    | 5 MCP tools via stdio transport                     |
| `@ia-framework/observability`    | 27    | Token counting, metrics SQLite store                |
| `@ia-framework/benchmark`        | 19    | Hit@K, MRR, benchmark store, comparison             |
| `@ia-framework/project-detector` | 19    | Language, framework, package manager detection      |
| `@ia-framework/db-context`       | 14    | PostgreSQL schema extraction                        |
| `@ia-framework/dashboard-api`    | 20    | Hono REST API (8 endpoints)                         |
| `@ia-framework/cli`              | 23    | Commander.js CLI (6 command groups)                 |
| `@ia-framework/dashboard`        | —     | React 19 monitoring UI                              |

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

1. Run `ia-framework status` to check Qdrant connection and chunk count
2. Re-index: `ia-framework index --force`
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

**Switched models and search quality dropped:**

```bash
# The old vectors are incompatible with the new model — re-index to fix
ia-framework index --model <your-new-model> --force
```

If you see "Embedding model mismatch detected" during indexing, confirm the collection delete to start fresh with the new model.

**Dashboard not loading:**

```bash
docker compose up -d dashboard
docker compose logs dashboard    # Check for errors
```

**Stopping a long-running index:**

```bash
# From another terminal — signals the indexer to stop after the current batch
ia-framework index-stop

# Or click the Stop button in the dashboard at http://localhost:3000
```

**Dashboard not updating during CLI indexing:**

The dashboard polls for progress every 2 seconds and should update automatically when `ia-framework index` is running. If it's not updating:

1. Check that `.ia-framework/indexing-progress.json` exists and is being written during indexing
2. Confirm the dashboard container is running: `docker compose ps`
3. Hard-refresh the browser (Cmd+Shift+R / Ctrl+Shift+R)

**Qdrant host resolution errors:**

The CLI resolves Qdrant via `localhost` (or the `QDRANT_HOST` env var). The dashboard container uses the `qdrant` Docker service name. Both are correct by design — set `QDRANT_HOST=localhost` if running the CLI in an environment where `localhost` doesn't resolve to the Qdrant port.

```bash
# Override Qdrant host for the CLI
QDRANT_HOST=127.0.0.1 ia-framework status
```

## License

Private / Internal use.
