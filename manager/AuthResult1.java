2. src/auth/types.ts (AuthResult) — score: 0.82 [text] ← expanded via dependency graph
export interface AuthResult {
  valid: boolean;
  userId?: string;
}

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

Add MCP servers to OpenCode's config at `~/.config/opencode/opencode.json`. Each server runs as a separate process and its tools become available alongside ia-framework's tools.

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
```

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