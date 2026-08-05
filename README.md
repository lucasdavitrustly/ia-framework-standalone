# ia-framework

A local RAG (Retrieval-Augmented Generation) framework that gives AI coding assistants deep understanding of your codebase. It indexes your project with AST-aware chunking and optional LLM enrichment, stores triple-vector embeddings in Qdrant (no raw code stored), and serves context to [OpenCode](https://opencode.ai) through 3 consolidated MCP tools — all running locally on your machine.

**Core idea:** Better context in, better code out.

## What It Does

```
Your Project                  ia-framework                    OpenCode
┌──────────────┐    index   ┌───────────────┐    MCP     ┌──────────────┐
│ TypeScript   │ ─────────► │ AST Parser    │ ────────── │ search_      │
│ Java / Proto │            │ LLM Enrich    │  3 tools   │   codebase   │
│ YAML / XML   │            │ Triple-Vector │            │ get_file     │
│ SQL / ...    │            │ Qdrant (lean) │            │ get_deps     │
└──────────────┘            └───────────────┘            └──────────────┘
                                   │
                            ┌──────┴───────┐
                            │  Dashboard   │
                            │  :3000       │
                            └──────────────┘
```

1. **Indexes your codebase** — parses files with tree-sitter into function/class/interface-level chunks, classifies each by stereotype (service, controller, repository, entity, etc.) and architectural layer, optionally enriches with LLM-generated metadata via Ollama, then embeds into 3 named vectors (semantic, signature, sparse) stored in Qdrant with lean payloads (no raw code — content is read from the filesystem at retrieval time)
2. **Serves context via MCP** — OpenCode calls `search_codebase`, `get_file`, and `get_dependencies` tools during conversations to pull in relevant code with metadata filters for precise retrieval
3. **Auto-classifies queries** — routes keyword/symbol queries directly to BM25 sparse search, semantic queries to dense vectors, and hybrid queries to RRF fusion — all through a single `search_codebase` tool
4. **Expands results along the dependency graph** — search results include 0-2 hops of imported files so the AI sees the full picture; interface searches automatically surface implementations
5. **Session-level caching** — embedding cache, get_file dedup, and search dedup reduce redundant work by 70-90% per repeated call within a session
6. **Tracks everything** — token usage, retrieval quality, indexing status, all visible in a browser dashboard
7. **Benchmarks RAG quality** — measure Hit@K and MRR to prove the system actually helps and tune configurations

## Architecture

```
ia-framework/
├── packages/
│   ├── core/               # Shared types (Stereotype, ArchLayer, ModuleInfo), config, Zod schemas
│   ├── ast-parser/         # tree-sitter WASM parser (TS, Java, Proto, YAML, XML, SQL)
│   │                       #   + stereotype/archLayer classifier + module resolver
│   ├── embedding/          # Provider interface + Ollama/OpenAI adapters + CachingProvider
│   ├── vector-store/       # Qdrant client (3 named vectors: semantic, signature, sparse)
│   ├── indexer/            # Unified pipeline: parse → classify → enrich → embed → store
│   │                       #   + LLM enrichment (Ollama, concurrent, cached)
│   ├── retrieval/          # Search engine, query classifier, dependency graph, hop expansion
│   ├── mcp-server/         # 3 MCP tools + session dedup caches (served via stdio)
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

### Indexing Pipeline (Unified)

Every file goes through one pipeline — no strategy flag needed:

1. **Parse** — tree-sitter AST extracts function/class/interface chunks with boundaries
2. **Classify** — heuristic detection assigns `stereotype` (service, controller, repository, entity, dto, test, ...) and `archLayer` (presentation, service, domain, persistence, infrastructure)
3. **Enrich** (optional) — Ollama LLM generates business-context descriptions, relationship tags, and API signatures per chunk. Gracefully degrades if Ollama is unavailable. Use `--skip-enrichment` to bypass.
4. **Embed** — 3 vectors per chunk:
   - `semantic` (dense, 768d+) — embeds LLM-enriched description or structured prose fallback
   - `signature` (dense, 768d+) — embeds the chunk's API signature/header
   - `sparse` (BM25/IDF) — full-text keyword index for exact term matching
5. **Store** — lean Qdrant payloads with metadata only (no raw code). Content is read from the filesystem at retrieval time.

### Retrieval Pipeline

Queries are auto-classified and routed:

- **Keyword queries** (camelCase, dot.notation, `"quoted"`) → BM25 sparse search
- **Semantic queries** → dense vector search on `semantic` + `signature` vectors
- **Hybrid** → both branches fused with Reciprocal Rank Fusion (RRF)

Results are expanded along the dependency graph (0-2 hops). Interface results automatically surface their implementations. Test files are excluded by default (re-included when query has test intent).

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
| **SpecKit**  | Latest    | `uv tool install specify-cli` (requires Python 3.11+ and uv)                                     | **No** — soft fail  | Enables `/speckit.*` slash commands in OpenCode for spec-driven development. The installer checks Python 3.11+ → uv → specify CLI, with version selection. Skips gracefully if any step fails.                                                                        |

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

1. **Check and install prerequisites** — Docker and Node.js 22+ are required (installer exits if they fail). Ollama, OpenCode, and SpecKit are optional (installer warns and continues if they fail).
2. Install **pnpm** if missing (`npm install -g pnpm`)
3. Build all 14 packages (`pnpm install && pnpm build`)
4. **Install `ia-framework` as a global CLI tool** — runs `npm link` inside `packages/cli` so `ia-framework` is available from anywhere in your terminal. If linking fails, the CLI is still usable via `node /path/to/ia-framework/packages/cli/dist/bin.js`.
5. **Select an embedding model** — shows your locally available Ollama models (with `[embed]` hints for known embedding models), lets you pick one or enter a custom name, and auto-pulls it if needed
6. Prompt for your **target project path**, **auto-detect your project's tech stack** (languages, frameworks, package manager, test runner), and create `.ia-framework/project.json` with the detected profile
7. Start **Qdrant** (vector database) and the **monitoring dashboard** via Docker Compose
8. **Configure MCPs (Step 5.1)** — detects your installed IDE(s) and lets you pick which MCPs to install (ia-framework, Context7, Sequential Thinking by default; PostgreSQL and Atlassian opt-in). Selecting **PostgreSQL** prompts for the DB connection and writes `.ia-framework/db.json` (creating the folder if missing).
9. **Install skills** into the selected IDE(s)
10. **Inject RAG tool guidance** into your designated target(s)' `AGENTS.md` / `CLAUDE.md` (opt-in via `injectAgents` / `agentInjectionTargets`; if none is set yet, the installer prompts you to choose and saves the choice)

After it completes:

- **Dashboard:** http://localhost:3000
- **Restart OpenCode** to load the MCP tools
- **Verify the CLI:** `ia-framework hello` — prints available commands and confirms the install is working
- **Start indexing** by running `ia-framework index` in your terminal

> Indexing is intentionally not run during install — your codebase may be large and you may want to configure include/exclude patterns first. Start it when you're ready.

## Recent Improvements (v2.0 — AST + LLM RAG Optimization)

### Current Architecture (spec 008)

- **Unified indexing pipeline** — Single AST-first pass with optional LLM enrichment replaces the old `--strategy ast|llm` toggle. Every file is parsed, classified, optionally enriched, and embedded through one pipeline.
- **Triple-vector storage** — 3 named vectors per chunk (semantic, signature, sparse) replace the old dual-vector (text + code) scheme. Enables automatic query routing without separate tools.
- **Lean Qdrant payloads** — No raw code stored in the vector database. Content is read from the filesystem at retrieval time, keeping the index lightweight and avoiding stale content.
- **Stereotype + archLayer classification** — Every chunk is classified by role (service, controller, repository, entity, dto, test, ...) and layer (presentation, service, domain, persistence, infrastructure) for metadata filtering.
- **10 supported formats** — TypeScript, TSX, JavaScript, JSX, Java, Proto, YAML, XML, SQL, plus any-file-as-module fallback.
- **3 consolidated MCP tools** — `search_codebase`, `get_file`, `get_dependencies` replace the old 6+ tool surface. Metadata filters, line-range queries, BFS depth traversal built in.
- **Session-level caching** — `CachingEmbeddingProvider` (LRU-100), `get_file` dedup (mtime-validated), `search_codebase` dedup (hash-keyed). Saves 70-90% tokens on repeated calls.
- **Token-efficient `get_file`** — Optional `startLine`/`endLine` and `name` filters reduce response size by 70-80% per call.
- **Test class exclusion** — Test files excluded from search by default; re-included when query has test intent.
- **Interface implementation expansion** — Searching for an interface automatically surfaces its implementations.
- **Query auto-classification** — Keyword/symbol queries route to BM25, semantic queries to dense vectors, with confidence-based early exit.

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
pnpm test        # 280+ tests across 23 packages
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
    "baseUrl": "http://localhost:11434"
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
      "**/*.java",
      "**/*.proto",
      "**/*.yaml",
      "**/*.yml",
      "**/*.xml",
      "**/*.sql"
    ],
    "excludePatterns": [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/.git/**",
      "**/coverage/**"
    ],
    "respectGitignore": true,
    "enrichment": {
      "model": "qwen3:8b",
      "concurrency": 3,
      "skipOnFailure": true
    }
  }
}
```

> See [Configuration](#configuration) for multi-repo setup, OpenAI embeddings, retrieval tuning, and the full reference.

### Step 6: Index Your Codebase

```bash
ia-framework index
```

This walks your project through the unified pipeline: parses files with tree-sitter into AST-aware chunks, classifies each by stereotype/archLayer, optionally enriches with LLM metadata (requires Ollama), generates triple-vector embeddings, and stores lean payloads in Qdrant. It also builds a file-level dependency graph (`graph.sqlite`) for hop expansion.

Use `--skip-enrichment` to skip the LLM enrichment step (faster, works without Ollama).

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

Add the MCP server to OpenCode's config at `~/.config/opencode/opencode.jsonc` (or `opencode.json` for older versions):

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "ia-framework": {
      "type": "local",
      "command": ["node", "/path/to/ia-framework/packages/mcp-server/dist/bin.js"],
      "environment": {
        "IA_FRAMEWORK_CONFIG": "/path/to/ia-framework/.ia-framework/project.json"
      },
      "enabled": true
    }
  }
}
```

Restart OpenCode. The following tools are now available to your AI assistant:

| MCP Tool                | Description                                                                                          |
| ----------------------- | ---------------------------------------------------------------------------------------------------- |
| `search_codebase`       | Semantic + keyword search with auto-classification, metadata filters, and dependency graph expansion |
| `get_file`              | Retrieve file content with optional line-range or function-name filtering                            |
| `get_dependencies`      | Get imports/exports for a file or BFS module dependency traversal                                    |
| `query_database`        | Execute SQL against a configured PostgreSQL database                                                 |
| `index_database_schema` | Index database schema into Qdrant for search                                                         |

### Step 8.1: Trustly LLM Gateway (Amazon Bedrock)

The installer automatically configures the **Trustly-Claude** provider with Amazon Bedrock models. If you ran `./install.sh`, this is already done. To configure manually:

**Available Models:**

| Model ID | Display Name |
|----------|-------------|
| `bedrock-claude-sonnet-4-6` | Claude Sonnet 4.6 (Trustly Bedrock) |
| `bedrock-claude-opus-4-8` | Claude Opus 4.8 (Trustly Bedrock) |
| `bedrock-claude-haiku-4-5` | Claude Haiku 4.5 (Trustly Bedrock) |

**Gateway URL:** `https://gateway.prd.devtools.trustly.cloud`

**Manual Configuration** — add this to `~/.config/opencode/opencode.jsonc`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "Trustly-Claude": {
      "options": {
        "baseURL": "https://gateway.prd.devtools.trustly.cloud",
        "apiKey": "YOUR_TRUSTLY_API_TOKEN"
      },
      "models": {
        "bedrock-claude-sonnet-4-6": { "name": "Claude Sonnet 4.6 (Trustly Bedrock)" },
        "bedrock-claude-opus-4-8": { "name": "Claude Opus 4.8 (Trustly Bedrock)" },
        "bedrock-claude-haiku-4-5": { "name": "Claude Haiku 4.5 (Trustly Bedrock)" }
      }
    }
  }
}
```

**Obtaining an API Token:**
- Contact the DevTools team or check your organization's internal documentation for the Trustly LLM Gateway token.
- The token is passed as `apiKey` in the provider options.
- An empty string is valid during setup — OpenCode will report an auth error until a real token is set.

> **Note:** The installer writes configuration to both `opencode.jsonc` (primary) and `opencode.json` (backward compatibility). If you edit manually, update `opencode.jsonc` — it takes precedence.

### OpenCode JSONC Configuration

OpenCode supports two configuration file formats:

| File | Format | Purpose |
|------|--------|---------|
| `~/.config/opencode/opencode.jsonc` | JSON with Comments | **Primary** — newer OpenCode versions read this file |
| `~/.config/opencode/opencode.json` | Standard JSON | **Legacy** — maintained for backward compatibility |

The ia-framework installer writes to **both** files automatically (dual-write). When editing manually, prefer `opencode.jsonc` — it supports `//` comments for documentation and is the canonical source for newer OpenCode versions.

The `$schema` field (`https://opencode.ai/config.json`) provides editor autocompletion and validation.

Top-level keys: `$schema`, `provider`, `mcp`, `permission`, `plugin`.

### Step 9: Start the Dashboard (Optional)

```bash
docker compose up -d dashboard
```

> **Note:** Docker Compose auto-loads `docker-compose.override.yml` if present. The installer copies `docker-compose.override.yml.example` (dev defaults) for you. Edit the override file locally to customize ports, log levels, or add services — it's gitignored.

Open http://localhost:3000 to see:

- **Overview** — Qdrant health, indexed chunks, token usage, benchmark scores, database status — includes a **"Start Indexing"** button to trigger the initial (or a fresh) index run
- **Config** — Detected project profile, current configuration (live-synced via file watcher)
- **Token Usage** — Daily token consumption charts, per-query breakdown
- **Benchmarks** — Hit@K and MRR trends over time
- **Indexing** — Trigger re-indexing, view progress
- **Search** — Interactive codebase search with metadata filters (stereotype, archLayer, module), source-tagged results, latency metrics, score distribution charts
- **Search History** — Auto-persisted search log with filtering (date, query text, min score) and replay/diff for before/after comparison
- **Analytics** — MRR and latency trends, score distribution histograms, token breakdown charts (indexing vs query)

### Step 10: Inject RAG Guidance (Optional)

This adds documentation to your designated target(s) telling AI assistants how to use the RAG tools (plus Context7 and Sequential Thinking). Targets are opt-in — set `injectAgents: true` on the repos you want and/or list non-indexed paths in `agentInjectionTargets` (see [Agent Docs Injection](#agent-docs-injection)):

```bash
# Injects/refreshes all designated targets (repos flagged injectAgents + agentInjectionTargets)
ia-framework agents inject

# Or force a specific file (bypasses target resolution)
ia-framework agents inject --file /path/to/project/CLAUDE.md

# Check injection status across all targets
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
ia-framework init [options]
  --config <path>    Path to project.json
  --enrichment-model <model>  Ollama model for LLM enrichment (e.g. llama3.2:latest)
  --enrichment-url <url>      Ollama URL for enrichment (default: http://localhost:11434)
```

Auto-detect your target project's tech stack (language, framework, package manager, test runner, build commands). Presents an interactive confirmation and saves the detected profile to `project.json`.

```bash
ia-framework index [options]
  --skip-enrichment  Skip LLM enrichment step (faster, works without Ollama)
  --force            Re-index all files (skip incremental detection)
  --model <name>     Override embedding model for this run (auto-pulls if not installed,
                     auto-discovers dimensions, detects collection mismatches)
  --config <path>    Path to project.json
```

Indexes your target project into Qdrant via the unified pipeline: AST parsing → stereotype classification → optional LLM enrichment → triple-vector embedding → lean storage. Subsequent runs are incremental — only files changed since the last indexed git commit are re-processed. Use `--force` to re-index everything.

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

Semantic search with auto-classification and dependency graph expansion. Keyword queries route to BM25, semantic queries to dense vectors. Results include 0–2 hops of imported files based on `retrieval.expansionHops` in config (0=off, 1=direct imports, 2=transitive).

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

```bash
ia-framework benchmark init-corpus [options]
  --corpus <path>    Output path for corpus file (default: .ia-framework/benchmark-queries.json)
  --model <name>     Completion model (default: llama3.2 via local Ollama at localhost:11434)
  --force            Overwrite existing corpus without backup prompt
  --config <path>    Path to project.json
```

Generates a 30-query benchmark corpus using an LLM to write natural language queries and expected files tailored to your project. Defaults to a local Ollama LLM (`llama3.2`); pass `--model` to use a different model or provider. If Ollama is unreachable, the command prints setup instructions and exits. Backs up any existing corpus automatically before overwriting. Prevents accidentally targeting the ia-framework repo itself.

```bash
ia-framework benchmark clean [options]
  --config <path>    Path to project.json
```

Deletes all benchmark runs from `benchmarks.sqlite`. Useful for resetting accumulated results after a major re-index or config change. The corpus file (`benchmark-queries.json`) is not affected.

---

### Database Commands

Only available after running `ia-framework db configure`. See [Database Context](#database-context-optional) for setup.

```bash
ia-framework db configure [options]
  --config <path>    Path to project.json
```

Interactive prompt for PostgreSQL connection details (host, port, database, user, password, SSL). Creates the `.ia-framework/` folder if it does not exist and saves to `.ia-framework/db.json`. Also run automatically by `install.sh` when the PostgreSQL MCP is selected.

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

### Prompt Versioning Commands

```bash
ia-framework prompt bump [options]
  --config <path>    Path to project.json
```

Increments the prompt version counter, invalidating the LLM enrichment cache. Use this after modifying the enrichment prompt to force re-enrichment on the next `index` run.

```bash
ia-framework prompt compare <v1> <v2> [options]
  --config <path>    Path to project.json
```

Compares two prompt versions by running a full re-index and benchmark for each, then showing the MRR delta between them. Use to validate that prompt changes improve retrieval quality.

---

### Agent Documentation Commands

```bash
ia-framework agents inject [options]
  --file <path>      Target file (overrides auto-detection)
  --config <path>    Path to project.json
```

Injects RAG tool guidance into the agent documentation (`AGENTS.md` or `CLAUDE.md`) of every **designated** injection target — repos flagged with `injectAgents: true`, any paths in `agentInjectionTargets` (non-indexed locations are supported), or the legacy single `targetProjectPath`. Auto-detects the file per target; use `--file` to force a single explicit path. Idempotent — safe to run multiple times (refreshes the managed block in place). When no target is designated, it modifies nothing and reports "no injection target configured". Prints a per-target summary (injected / refreshed / created / skipped / failed). See [Agent Docs Injection](#agent-docs-injection) for how to designate targets.

```bash
ia-framework agents check [options]
  --config <path>    Path to project.json
```

Checks whether RAG guidance has been injected, reporting per designated injection target which ones already contain the managed block.

## MCP Tools (Detailed)

> These tools are automatically documented in your target project's `AGENTS.md` or `CLAUDE.md` when you run `ia-framework agents inject`. AI assistants in that project will find usage guidance there.

### search_codebase

The primary tool. AI assistants call this to find relevant code for the task at hand. Queries are auto-classified (semantic/keyword/existence/aggregation) and routed to the optimal search path. Top-5 results include live file content read from disk; results 6-10 are metadata-only to reduce token usage.

| Parameter         | Type    | Default  | Description                                                                                 |
| ----------------- | ------- | -------- | ------------------------------------------------------------------------------------------- |
| `query`           | string  | required | Natural language search query                                                               |
| `limit`           | number  | 10       | Maximum number of results                                                                   |
| `score_threshold` | number  | 0.5      | Minimum similarity score (0-1). Set to 0 to disable filtering.                              |
| `expand_hops`     | number  | 2        | Dependency graph expansion: 0=off, 1=direct imports, 2=transitive (default)                 |
| `fallback`        | boolean | true     | Enable zero-result fallback with suggestions. Set false for raw empty results.              |
| `use_template`    | boolean | true     | Enable prompt template injection for detected query intents. Set false to disable.          |
| `repo`            | string  | —        | Filter results to a specific repo by name. Omit to search all repos.                        |
| `stereotype`      | string  | —        | Filter by stereotype (e.g. 'service', 'repository', 'controller', 'entity', 'dto')          |
| `archLayer`       | string  | —        | Filter by layer (e.g. 'presentation', 'service', 'domain', 'persistence', 'infrastructure') |
| `module`          | string  | —        | Filter by module name (maps to moduleInfo.module in Qdrant payload)                         |
| `language`        | string  | —        | Filter by programming language (e.g. 'java', 'typescript', 'python')                        |

**Token-conscious patterns:**

```
# Narrow search with metadata filters — fewer irrelevant results
search_codebase(query="entry creation", stereotype="service", module="entry-api")

# Disable expansion when you only need the exact match
search_codebase(query="EntryService.create", expand_hops=0)
```

### get_file

Retrieves file content with optional filtering. Reads live content from the filesystem; falls back to stored Qdrant metadata if the file is inaccessible. Returns chunk-level metadata (imports, exports, dependency edges, stereotype, archLayer).

Session dedup: second identical call returns a short "Content unchanged" message (~15 tokens) if file mtime hasn't changed.

| Parameter   | Type   | Default  | Description                                                                              |
| ----------- | ------ | -------- | ---------------------------------------------------------------------------------------- |
| `path`      | string | required | Relative file path (e.g., `src/auth/middleware.ts`). Supports `repo:path` prefix syntax. |
| `startLine` | number | —        | Start line (1-indexed). When provided with endLine, returns only that range.             |
| `endLine`   | number | —        | End line (1-indexed). When provided with startLine, returns only that range.             |
| `name`      | string | —        | Filter to chunks matching this function/class name (case-insensitive).                   |

**Token-conscious patterns:**

```
# After search_codebase returns "Entry.java:166-231 (create)", get just that range:
get_file(path="src/Entry.java", startLine=166, endLine=231)

# Or get by function name (uses indexed chunk metadata):
get_file(path="src/Entry.java", name="create")
```

### get_dependencies

Returns imports and exports for a file or module. Provide either `path` (file-level lookup) or `module` (module-level with BFS traversal). Returns full `dependencyEdges` for graph navigation.

| Parameter | Type   | Default | Description                                                              |
| --------- | ------ | ------- | ------------------------------------------------------------------------ |
| `path`    | string | —       | Relative file path. Mutually exclusive with `module`.                    |
| `module`  | string | —       | Module name (maps to moduleInfo.module). Mutually exclusive with `path`. |
| `depth`   | number | 1       | BFS traversal depth for module queries (default: 1, max: 3).             |

### query_database

Executes SQL against a configured PostgreSQL database. Only available if `db.json` is configured via `ia-framework db configure`.

| Parameter | Type   | Description          |
| --------- | ------ | -------------------- |
| `sql`     | string | SQL query to execute |

### index_database_schema

Triggers indexing of the PostgreSQL schema into Qdrant so `search_codebase` can find table/column information. No parameters required.

## Extending with MCP Servers

ia-framework's MCP server provides codebase search tools, but OpenCode (and other IDEs) support multiple MCP servers simultaneously. The installer configures MCPs from **descriptors** under `mcps/*/mcp.json` — during `install.sh` Step 5.1 you pick which IDE(s) and which MCP(s) to install, and the installer writes the correct entries into each IDE's config.

### Bundled MCP Descriptors

Each folder under `mcps/` is a descriptor the installer can offer:

| MCP (id)                                        | Default   | Purpose                 | Command form                                                       |
| ----------------------------------------------- | --------- | ----------------------- | ------------------------------------------------------------------ |
| **ia-framework** (`ia-framework`)               | ✅ yes    | Codebase RAG            | Local `mcp-server` binary (`requires_build`)                       |
| **Context7** (`context7`)                       | ✅ yes    | Documentation retrieval | `npx -y @upstash/context7-mcp@latest`                              |
| **Sequential Thinking** (`sequential-thinking`) | ✅ yes    | Structured reasoning    | `npx -y @modelcontextprotocol/server-sequential-thinking`          |
| **PostgreSQL** (`postgres`)                     | ❌ opt-in | Database context        | `npx -y @modelcontextprotocol/server-postgres <DSN>`               |
| **Atlassian** (`atlassian`)                     | ❌ opt-in | Jira + Confluence       | `npx -y mcp-remote@latest https://mcp.atlassian.com/v1/mcp/authv2` |

> Descriptors in the repo contain **placeholders only** — never real credentials. The PostgreSQL descriptor ships with a `{{POSTGRES_CONNECTION_STRING}}` token that the installer substitutes at install time.

### PostgreSQL: db.json bootstrap

When you select the **PostgreSQL** MCP during install, the installer:

1. Prompts for connection details (host, port, database, user, password, SSL).
2. Creates the `.ia-framework/` folder if it does not exist.
3. Writes `.ia-framework/db.json` (via `ia-framework db configure`) — this is the single source of truth for the connection, also used by the ia-framework `query_database` / `index_database_schema` tools.
4. Builds a connection string from those values and substitutes it into the PostgreSQL MCP command written to your IDE config.

Re-running the installer with an existing `db.json` prompts to keep or overwrite (default: keep). In non-interactive/CI runs the prompt is skipped so the installer never hangs.

The resulting OpenCode entry looks like (placeholders shown — your real values are written locally only):

```json
{
  "mcp": {
    "postgres": {
      "type": "local",
      "command": [
        "npx",
        "-y",
        "@modelcontextprotocol/server-postgres",
        "postgresql://USER:PASSWORD@HOST:5432/DB"
      ],
      "enabled": true
    }
  }
}
```

### Atlassian (Jira + Confluence)

The **Atlassian** MCP uses the hosted remote endpoint via `mcp-remote`; authentication is interactive (OAuth on first use), so no tokens are stored in config:

```json
{
  "mcp": {
    "atlassian": {
      "type": "local",
      "command": ["npx", "-y", "mcp-remote@latest", "https://mcp.atlassian.com/v1/mcp/authv2"],
      "enabled": true
    }
  }
}
```

> This replaces the previous standalone Jira MCP. The `jira-feed` skill now depends on the `atlassian` MCP.

### Manually configuring MCP servers

You can also edit OpenCode's config directly at `~/.config/opencode/opencode.jsonc` (or `opencode.json` for older versions). Each server runs as a separate process and its tools become available alongside ia-framework's tools:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "ia-framework": {
      "type": "local",
      "command": ["node", "/path/to/ia-framework/packages/mcp-server/dist/bin.js"],
      "environment": {
        "IA_FRAMEWORK_CONFIG": "/path/to/ia-framework/.ia-framework/project.json"
      },
      "enabled": true
    },
    "context7": {
      "type": "local",
      "command": ["npx", "-y", "@upstash/context7-mcp@latest"],
      "enabled": true
    },
    "sequential-thinking": {
      "type": "local",
      "command": ["npx", "-y", "@modelcontextprotocol/server-sequential-thinking"],
      "enabled": true
    }
  }
}
```

> **Note:** ia-framework also includes PostgreSQL support via the `db-context` package (`db configure`, `db index`, `query_database` MCP tool). The `postgres` MCP above is the general-purpose Postgres tool that complements ia-framework's schema-indexed approach — both read the same `.ia-framework/db.json` connection you set up during install.

### Pluggable Architecture

The MCP protocol is standardized, so any MCP-compatible server works with OpenCode. Common additions:

- **Redis** — cache inspection and key-value context
- **RabbitMQ** — queue status and message routing context
- **GitHub** — issue and PR context
- **Filesystem** — direct file access outside the indexed project

Each server you add gives the AI assistant more context to work with. ia-framework's codebase search + other MCP servers = comprehensive project understanding.

## Configuration

The main config file is `.ia-framework/project.json`. Two formats are supported: **single-repo** (legacy) and **multi-repo**.

> **Note:** The `.opencode/` directory contains per-user OpenCode configuration (slash commands, skills, agents). It is not tracked in git — each developer's local copy is independent.

### Single-Repo (Minimal)

The simplest configuration — one project, local Ollama embeddings, no enrichment:

```json
{
  "targetProjectPath": "/absolute/path/to/your/project",
  "embedding": {
    "provider": "ollama",
    "model": "nomic-embed-text",
    "baseUrl": "http://localhost:11434"
  },
  "vectorStore": {
    "host": "localhost",
    "port": 6333,
    "collectionName": "my-project"
  }
}
```

> **Note:** `dimensions` is auto-detected from the model — you never need to specify it manually.

### Single-Repo with LLM Enrichment

Adds Ollama-powered metadata enrichment for richer semantic search. The enrichment model generates business-context descriptions and relationship tags per chunk:

```json
{
  "targetProjectPath": "/absolute/path/to/your/project",
  "embedding": {
    "provider": "ollama",
    "model": "nomic-embed-text",
    "baseUrl": "http://localhost:11434"
  },
  "vectorStore": {
    "host": "localhost",
    "port": 6333,
    "collectionName": "my-project"
  },
  "indexing": {
    "includePatterns": ["**/*.ts", "**/*.java", "**/*.proto", "**/*.yaml", "**/*.xml", "**/*.sql"],
    "excludePatterns": ["**/node_modules/**", "**/dist/**", "**/build/**"],
    "respectGitignore": true,
    "maxChunkLines": 200,
    "enrichment": {
      "provider": "ollama",
      "model": "qwen3:8b",
      "baseUrl": "http://localhost:11434",
      "numCtx": 32768,
      "concurrency": 3,
      "retryAttempts": 2,
      "skipOnFailure": true
    }
  },
  "retrieval": {
    "expansionHops": 2,
    "earlyExitConfidence": 0.8
  }
}
```

**Enrichment config fields:**

| Field           | Default                    | Description                                                        |
| --------------- | -------------------------- | ------------------------------------------------------------------ |
| `provider`      | `"ollama"`                 | Only `"ollama"` supported currently                                |
| `model`         | `"qwen3:8b"`               | Any Ollama completion model (not embedding — this generates text)  |
| `baseUrl`       | `"http://localhost:11434"` | Ollama API URL                                                     |
| `numCtx`        | `32768`                    | Context window size in tokens                                      |
| `concurrency`   | `3`                        | Max concurrent Ollama requests                                     |
| `retryAttempts` | `2`                        | Retry count on Ollama failure (0-10)                               |
| `skipOnFailure` | `true`                     | If true, indexing continues without enrichment when Ollama is down |

> **Tip:** Use `--skip-enrichment` on the CLI to bypass enrichment for faster re-indexing without changing the config.

### Multi-Repo

Index multiple repositories into a single Qdrant collection. Each repo gets a logical name for filtering in search:

```json
{
  "repos": [
    {
      "path": "../backend-api",
      "name": "backend-api"
    },
    {
      "path": "../frontend-app",
      "name": "frontend-app"
    },
    {
      "path": "../shared-libs",
      "name": "shared-libs",
      "provides": ["@company/auth", "@company/utils"]
    }
  ],
  "embedding": {
    "provider": "ollama",
    "model": "nomic-embed-text",
    "baseUrl": "http://localhost:11434"
  },
  "vectorStore": {
    "host": "localhost",
    "port": 6333,
    "collectionName": "my-platform"
  },
  "indexing": {
    "includePatterns": ["**/*.ts", "**/*.java"],
    "excludePatterns": ["**/node_modules/**", "**/dist/**"],
    "enrichment": {
      "model": "qwen3:8b",
      "concurrency": 4
    }
  }
}
```

**Multi-repo fields:**

| Field              | Required | Description                                                                                                                |
| ------------------ | -------- | -------------------------------------------------------------------------------------------------------------------------- |
| `repos[].path`     | Yes      | Path to the repository (resolved relative to config file directory)                                                        |
| `repos[].name`     | No       | Logical name (auto-derived from `basename(path)` in kebab-case if omitted). Must be lowercase kebab-case.                  |
| `repos[].provides` | No       | Package names this repo provides (for cross-repo symbol resolution). Auto-detected from `package.json` or pnpm workspaces. |
| `repos[].profile`  | No       | Per-repo profile override. Auto-detected if not specified.                                                                 |
| `repos[].injectAgents` | No   | `true` marks this repo as an **agent-docs injection target** (see [Agent Docs Injection](#agent-docs-injection)). Defaults to `false`; absent means not a target (opt-in only).                    |

> **Note:** `targetProjectPath` and `repos` are mutually exclusive — use one or the other, not both.

After indexing, use the `repo` filter in searches to scope results:

```
search_codebase(query="payment processing", repo="backend-api")
get_file(path="backend-api:src/payments/service.ts")
```

### OpenAI Embeddings

Use cloud embeddings instead of local Ollama:

```json
{
  "targetProjectPath": "/path/to/project",
  "embedding": {
    "provider": "openai",
    "model": "text-embedding-3-small",
    "apiKey": "sk-..."
  },
  "vectorStore": {
    "host": "localhost",
    "port": 6333,
    "collectionName": "my-project"
  }
}
```

Or set the API key via environment variable: `export OPENAI_API_KEY=sk-...`

### Agent Docs Injection

**What it is:** ia-framework can write a managed block of guidance into a project's
agent documentation file (`AGENTS.md`, or `CLAUDE.md` if that's what the project
uses). This block tells AI assistants working in that project how to use the
codebase RAG tools (`search_codebase`, `get_file`, `get_dependencies`) and when to
reach for **Context7** (up-to-date library/framework docs) and **Sequential
Thinking** (structured multi-step reasoning). It also instructs assistants on how
to create **database migrations** following the standardized Flyway naming
convention (e.g. `V9.999.9.N__descriptive_name.sql`). The block is delimited by
`<!-- ia-framework:rag-start -->` / `<!-- ia-framework:rag-end -->` markers, so
re-running injection **refreshes it in place** — it never duplicates content.

**Injection is opt-in per repo.** Injection does not happen implicitly. You choose
targets in `project.json`; nothing is modified unless you designate it.

#### Choosing which repos get the guidance (`injectAgents`)

Set `injectAgents: true` on each `repos[]` entry you want injected. Repos without
the flag (the default) are left untouched:

```json
{
  "repos": [
    { "path": "../backend-api", "name": "backend-api", "injectAgents": true },
    { "path": "../frontend-app", "name": "frontend-app", "injectAgents": true },
    { "path": "../shared-libs", "name": "shared-libs" }
  ],
  "embedding": { "provider": "ollama", "model": "nomic-embed-text" },
  "vectorStore": { "host": "localhost", "port": 6333, "collectionName": "my-platform" }
}
```

Here `backend-api` and `frontend-app` get their `AGENTS.md` created/updated;
`shared-libs` does not.

#### Injecting into a folder/repo that is NOT indexed (`agentInjectionTargets`)

Sometimes the place your agents read guidance from is **not** one of the indexed
repos — e.g. a workspace/umbrella root that aggregates several sub-repos, a docs
folder, or a sibling project you only want the guidance in. List those paths in the
optional top-level `agentInjectionTargets` array. These locations are
**injection-only — they are never indexed** and are resolved relative to the config
file directory:

```json
{
  "repos": [
    { "path": "../backend-api", "name": "backend-api", "injectAgents": true }
  ],
  "agentInjectionTargets": [
    "..",                     // the monorepo/workspace root (not indexed)
    "../ops-runbooks"         // a sibling folder that isn't part of the index
  ],
  "embedding": { "provider": "ollama", "model": "nomic-embed-text" },
  "vectorStore": { "host": "localhost", "port": 6333, "collectionName": "my-platform" }
}
```

The full set of injection targets is: flagged `repos[]` **plus**
`agentInjectionTargets` (plus the legacy `targetProjectPath` when that format is
used). Injecting into a non-indexed target never triggers indexing and never
modifies your indexed repos.

**How a non-indexed target is handled:**

- **Path resolution** — each `agentInjectionTargets` entry is resolved to an
  absolute path **relative to the `project.json` directory** (so `..`, `../foo`,
  and absolute paths all work).
- **Doc file per target** — the same precedence applies as for repos: an existing
  `AGENTS.md` is used, else an existing `CLAUDE.md`, else a new `AGENTS.md` is
  created at that path.
- **De-duplication** — if an `agentInjectionTargets` entry points at the same
  location as a flagged repo, it's injected **once** (the indexed repo wins).
- **No indexing, no side effects** — these paths are marked injection-only, so the
  indexer never touches them and no indexed repo is modified as a result.
- **Reported like any target** — it appears in the per-target summary as
  `created`/`refreshed`/`failed` (a missing/inaccessible path is `failed`, and the
  run continues with the rest).

**One-off injection (no config edit):** to inject into a single arbitrary file
without adding it to `project.json`, use `--file` — it bypasses target resolution
entirely:

```bash
ia-framework agents inject --file /path/to/anywhere/AGENTS.md
```

> **Installer note:** the `install.sh` fallback prompt only lets you pick from
> repos listed in `repos[]`. To inject into a location that isn't a listed repo,
> add it to `agentInjectionTargets` in `project.json` (or use `--file` for a
> one-off), then run `ia-framework agents inject`.

#### Behavior summary

| Situation | What happens |
| --------- | ------------ |
| One or more repos have `injectAgents: true` (and/or `agentInjectionTargets` set) | Each designated target's `AGENTS.md`/`CLAUDE.md` is created or refreshed. |
| No repo is flagged and no extra targets set | The `agents inject` command modifies nothing and reports "no injection target configured". During `install.sh`, you're prompted to pick targets (choice is saved back to `project.json`). |
| Legacy `targetProjectPath` config | That single target is injected as before (implicitly opted-in). |
| An `agentInjectionTargets` path (not in `repos[]`) | Injected/refreshed at that path; never indexed; indexed repos unaffected. |
| An `agentInjectionTargets` path equal to a flagged repo | De-duplicated — injected once. |
| Target has both `AGENTS.md` and `CLAUDE.md` | Existing `AGENTS.md` wins; otherwise `CLAUDE.md`; otherwise a new `AGENTS.md` is created. |
| A target path is missing/inaccessible | That target is reported as `failed`; remaining targets still process. |

Run it with:

```bash
ia-framework agents inject     # inject/refresh all designated targets
ia-framework agents check      # report which targets already have the guidance
```

See [Agent Documentation Commands](#agent-documentation-commands) for the full CLI.



All fields with their defaults:

```jsonc
{
  // --- Project target (pick one) ---
  "targetProjectPath": "/path/to/project", // Single-repo
  // OR
  "repos": [
    {
      "path": "...", // Repo path (resolved relative to this config file)
      "name": "...", // Optional logical name (kebab-case; auto-derived from basename)
      "provides": [], // Optional package names for cross-repo symbol resolution
      "injectAgents": false, // Optional — true = inject agent docs here (default false, opt-in)
    },
  ], // Multi-repo

  // --- Extra agent-docs injection targets (optional, injection-only, NEVER indexed) ---
  "agentInjectionTargets": [
    "..", // e.g. workspace/umbrella root or any folder not in repos[]
  ],

  // --- Embedding (required) ---
  "embedding": {
    "provider": "ollama", // "ollama" or "openai"
    "model": "nomic-embed-text", // Model name (dimensions auto-detected)
    "baseUrl": "http://localhost:11434", // Provider API URL
    "apiKey": "", // Required for OpenAI only
    "dimensions": 768, // Optional — auto-detected from model
  },

  // --- Vector store (required) ---
  "vectorStore": {
    "host": "localhost",
    "port": 6333,
    "collectionName": "codebase",
    "apiKey": "", // Optional — for Qdrant Cloud
  },

  // --- Indexing (optional) ---
  "indexing": {
    "includePatterns": ["**/*.ts", "**/*.java"], // Glob patterns to index (empty = language defaults)
    "excludePatterns": ["**/node_modules/**"], // Globs to skip
    "maxChunkLines": 200, // Max lines per chunk before splitting
    "respectGitignore": true, // Skip files ignored by .gitignore
    "embeddingConcurrency": 3, // Parallel embedding calls (Ollama: 3, OpenAI: 10)
    "embeddingBatchSize": 50, // Chunks per embedding API call (1-200)
    "enrichment": {
      // Optional LLM enrichment (Ollama-generated metadata per chunk)
      "provider": "ollama", // Only "ollama" supported
      "model": "qwen3:8b", // Ollama completion model (generates text, not embeddings)
      "baseUrl": "http://localhost:11434", // Ollama API URL
      "numCtx": 32768, // Context window size (tokens)
      "concurrency": 3, // Max concurrent enrichment requests
      "retryAttempts": 2, // Retries on Ollama failure (0-10)
      "skipOnFailure": true, // Continue indexing if Ollama is down
      "excludeLanguages": [], // Languages to skip enrichment for (still embedded)
      "excludeStereotypes": [], // Stereotypes to skip (e.g. ["test", "dto"])
      "excludeExtensions": [], // File extensions to skip (e.g. [".sql", ".xml"])
      "minEnrichmentLines": 1, // Skip enrichment for chunks smaller than this
      "maxBatchChunks": 50, // Max chunks per enrichment batch (1-50)
      "charsPerToken": 4, // Token estimation ratio (1-10) for batch budgeting
      "tokenBudgetRatio": 0.5, // Fraction of numCtx used for input (0.2-0.7)
      "outputTokensPerChunk": 300, // Reserved output tokens per chunk (50-1000)
    },
  },


  // --- Retrieval tuning (optional) ---
  "retrieval": {
    "mode": "mcp-only", // "mcp-only" | "auto-context" | "combined"
    "expansionHops": 2, // 0=off, 1=direct imports, 2=transitive
    "earlyExitConfidence": 0.8, // Keyword early exit threshold (0-1)
    "keywordPrefetchMultiplier": 3, // BM25 prefetch multiplier (1-10)
    "semanticPrefetchMultiplier": 3, // Dense prefetch multiplier (1-10)
    "rrfK": 60, // RRF constant (1-200)
    "rrfScoreThreshold": 0.015, // Min RRF score to include (0-1)
    "scoreThreshold": 0.5, // Default min relevance score
    "maxTokensPerCall": 40000, // Soft token budget per search call
    "reranking": {
      "enabled": true,
      "topK": 10,
      "prefetchMultiplier": 3,
    },
    "multiHop": {
      "enabled": true,
      "maxSymbols": 5,
      "expandMethodCalls": true,
      "expandHierarchy": true,
    },
    "classificationRules": {
      "symbolPatterns": ["[A-Z][a-z]+[A-Z]"], // camelCase detection
      "lookupVerbs": ["find", "get", "show"],
      "maxKeywordWords": 4,
    },
  },

  // --- Auto-detected project profile (optional, populated by `ia-framework init`) ---
  "profile": {
    "languages": ["typescript", "java"],
    "frameworks": ["express", "spring-boot"],
    "packageManager": "pnpm",
    "testRunner": "vitest",
    "buildCommand": "pnpm build",
    "devCommand": "pnpm dev",
  },
}
```

### Indexing Tuning

The `indexing` block controls **what** gets indexed and **how fast/accurately** the
pipeline runs. Defaults are sensible for most projects; tune these when indexing is
too slow, too token-heavy, or when enrichment quality needs adjusting.

**Scope — what gets indexed:**

| Field | Default | When to change |
| ----- | ------- | -------------- |
| `includePatterns` | language defaults | Add globs to widen coverage, or narrow to a subset (e.g. `["src/**/*.ts"]`) to skip generated/vendor code. |
| `excludePatterns` | `node_modules`, `dist`, `build`, `.git`, `coverage` | Add heavy or irrelevant paths (fixtures, snapshots, migrations) to shrink the index and speed up runs. |
| `respectGitignore` | `true` | Set `false` only if you must index gitignored files. |
| `maxChunkLines` | unset (natural AST boundaries) | Cap very large functions/classes so chunks stay embed-friendly; smaller = more, tighter chunks. |

**Embedding throughput:**

| Field | Default | Effect |
| ----- | ------- | ------ |
| `embeddingConcurrency` | Ollama `3` / OpenAI `10` | Higher = faster embedding but more load on Ollama/your quota. Lower if Ollama is timing out. |
| `embeddingBatchSize` | `50` (1-200) | Chunks per embedding call. Larger batches reduce round-trips; too large can hit provider limits. |

**Enrichment quality vs. cost** (the LLM step — the most expensive part; skip with `--skip-enrichment`):

| Field | Default | Effect |
| ----- | ------- | ------ |
| `concurrency` | `3` | Parallel Ollama enrichment requests. Raise for speed if your GPU/host can handle it. |
| `numCtx` | `32768` | Model context window. Larger fits more chunks per batch but uses more memory. |
| `maxBatchChunks` | `50` (1-50) | Upper bound on chunks batched into one enrichment call. |
| `tokenBudgetRatio` | `0.5` (0.2-0.7) | Fraction of `numCtx` reserved for input; the rest is output headroom. |
| `outputTokensPerChunk` | `300` (50-1000) | Reserved output budget per chunk — raise for richer descriptions. |
| `charsPerToken` | `4` (1-10) | Token-estimation ratio used for batch packing. |
| `minEnrichmentLines` | `1` | Skip enrichment for tiny chunks below this line count (still embedded). |
| `excludeLanguages` / `excludeStereotypes` / `excludeExtensions` | `[]` | Skip enrichment for whole languages, roles (e.g. `test`, `dto`), or extensions to save time — those chunks are still embedded, just without LLM metadata. |
| `retryAttempts` | `2` (0-10) | Retries per chunk when Ollama fails. |
| `skipOnFailure` | `true` | Keep indexing (structured fallback) if Ollama is unavailable, instead of aborting. |

> **Fast path:** for the quickest possible index, run `ia-framework index
> --skip-enrichment` — it skips the LLM step entirely and still produces
> triple-vector embeddings and the dependency graph. Add enrichment later with a
> plain `ia-framework index` (incremental — only changed files re-process).

For retrieval-side tuning (`retrieval` block: `expansionHops`, RRF, reranking,
multi-hop), see the annotated reference above.

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

# Reset all stored runs (e.g. after a major re-index)
ia-framework benchmark clean
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

The corpus can be bootstrapped with `benchmark init-corpus`, which uses a local Ollama LLM to draft queries from sampled chunks. Treat the output as a starting point — review each query and expected file list to ensure they reflect real developer intent before using for metrics. The corpus still requires human judgment to be meaningful.

## Database Context (Optional)

If your project uses PostgreSQL, ia-framework can index the database schema as additional context.

**During install:** selecting the **PostgreSQL** MCP in `install.sh` (Step 5.1) prompts for the connection and writes `.ia-framework/db.json` automatically — creating the `.ia-framework/` folder if it does not exist yet. See [PostgreSQL: db.json bootstrap](#postgresql-dbjson-bootstrap).

**Manually / after install** you can configure and index the schema with the CLI:

```bash
# Interactive setup — prompts for host, port, database, user, password, SSL.
# Creates the .ia-framework/ folder if missing and writes db.json.
ia-framework db configure

# Test connection
ia-framework db connect

# Index schema into Qdrant
ia-framework db index

# Check status
ia-framework db status
```

`ia-framework db configure` writes `.ia-framework/db.json` with the shape
`{ host, port, database, user, password, ssl }`. This single file is read by the
CLI and by the `query_database` / `index_database_schema` MCP tools, and is used
to build the connection string for the `postgres` MCP.

After indexing, `search_codebase` queries will also match table names, column types, and relationships. The `query_database` MCP tool lets the AI run SQL directly.

## SpecKit (Spec-Driven Development)

ia-framework integrates with [GitHub SpecKit](https://github.com/github/spec-kit) for spec-driven development workflows. Once the `specify` CLI is installed (via `install.sh` or manually), OpenCode gains `/speckit.*` slash commands for structured feature development:

| Command              | Purpose                                               |
| -------------------- | ----------------------------------------------------- |
| `/speckit.specify`   | Create a feature specification from a description     |
| `/speckit.clarify`   | Resolve ambiguities in the spec via guided questions  |
| `/speckit.plan`      | Generate implementation plan with research and design |
| `/speckit.tasks`     | Break the plan into executable task list              |
| `/speckit.implement` | Execute tasks phase-by-phase                          |
| `/speckit.checklist` | Generate quality checklists for validation            |
| `/speckit.analyze`   | Analyze implementation against spec                   |

### Manual SpecKit Installation

If you skipped SpecKit during `install.sh`:

```bash
# Install uv (Python package manager)
curl -LsSf https://astral.sh/uv/install.sh | sh

# Install specify CLI
uv tool install specify-cli --from git+https://github.com/github/spec-kit.git@v0.9.0
```

The `.specify/` directory in the repo contains project-local SpecKit configuration (templates, extensions, memory). It's committed to git and shared across the team.

## Development

### Running Tests

```bash
pnpm test           # All 280+ tests (Turborepo-cached)
pnpm typecheck      # Type-check all packages
pnpm build          # Build all 14 packages
pnpm lint           # ESLint + Prettier
```

### Project Structure

| Package                          | Tests | Purpose                                                              |
| -------------------------------- | ----- | -------------------------------------------------------------------- |
| `@ia-framework/core`             | 7     | Config loader, schemas, logger, shared types (Stereotype, ArchLayer) |
| `@ia-framework/ast-parser`       | 40+   | tree-sitter chunking, stereotype classifier, module resolver         |
| `@ia-framework/embedding`        | 12    | Ollama + OpenAI adapters + CachingEmbeddingProvider                  |
| `@ia-framework/vector-store`     | 8     | Qdrant triple-vector storage (semantic, signature, sparse)           |
| `@ia-framework/indexer`          | 20+   | Unified pipeline, LLM enrichment, file walker, incremental indexing  |
| `@ia-framework/retrieval`        | 24    | Search engine, query classifier, dependency graph, hop expansion     |
| `@ia-framework/mcp-server`       | 25+   | 3 MCP tools + session dedup caches via stdio transport               |
| `@ia-framework/observability`    | 27    | Token counting, metrics SQLite store                                 |
| `@ia-framework/benchmark`        | 19    | Hit@K, MRR, benchmark store, comparison                              |
| `@ia-framework/project-detector` | 19    | Language, framework, package manager detection                       |
| `@ia-framework/db-context`       | 14    | PostgreSQL schema extraction                                         |
| `@ia-framework/dashboard-api`    | 20    | Hono REST API (8 endpoints)                                          |
| `@ia-framework/cli`              | 23    | Commander.js CLI (6 command groups)                                  |
| `@ia-framework/dashboard`        | —     | React 19 monitoring UI                                               |

### Adding a New Language

ia-framework uses tree-sitter WASM grammars for full AST parsing, plus lightweight regex/indentation parsers for config formats. To add support for a new language:

1. Install the grammar: `pnpm add tree-sitter-<language> -F @ia-framework/ast-parser`
2. Add a parser in `packages/ast-parser/src/parsers/`
3. Register chunk extraction rules for the language's node types
4. Add the extension mapping to `LANGUAGE_MAP` in `packages/ast-parser/src/chunker.ts`
5. Add include patterns in your `project.json`

Currently supported:

| Language/Format | Extensions                    | Parser Technology                       |
| --------------- | ----------------------------- | --------------------------------------- |
| TypeScript      | `.ts`, `.tsx`                 | tree-sitter (full AST)                  |
| JavaScript      | `.js`, `.jsx`, `.mjs`, `.cjs` | tree-sitter (full AST)                  |
| Java            | `.java`                       | tree-sitter (full AST)                  |
| Proto           | `.proto`                      | Regex-based (message/service/enum)      |
| YAML            | `.yaml`, `.yml`               | Indentation-based (top-level keys)      |
| XML             | `.xml`                        | Regex/line-based (Spring/Maven targets) |
| SQL             | `.sql`                        | Whole-file (Flyway migration)           |

Any file with an unrecognized extension is indexed as a single `module` chunk containing the full file content.

## Troubleshooting

**MCP tools not appearing in OpenCode:**

1. Verify `packages/mcp-server/dist/bin.js` exists (`pnpm build` if missing)
2. Check `~/.config/opencode/opencode.json` has the correct paths
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
