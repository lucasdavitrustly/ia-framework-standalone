# Architecture

**Analysis Date:** 2026-04-02

**Scope:** `packages/benchmark` — RAG retrieval quality benchmarking system

## Pattern Overview

**Overall:** Domain-oriented library pattern with clean separation between query corpus, execution engine, and persistence. The benchmark package is a pure library consumed by two surfaces: the CLI (`packages/cli`) and the Dashboard API (`packages/dashboard-api`). It follows a strict layered architecture with types → logic → storage.

**Key Characteristics:**
- Pure library — no entry point, no CLI, no server; exports classes and functions
- Dependency injection via constructor arguments (SearchEngine, config)
- Synchronous SQLite persistence with transactional writes
- Zod-validated corpus input from JSON files
- Three aggregate metrics: Hit@K, MRR, avgLatencyMs
- No-RAG baseline mode via score threshold trick (>1.0 forces empty results)

## Layers

**Types Layer:**
- Purpose: Pure TypeScript interfaces with zero implementation
- Location: `packages/benchmark/src/types.ts`
- Contains: `BenchmarkQuery`, `QueryResult`, `ConfigSnapshot`, `BenchmarkRun`, `BenchmarkConfig`
- Depends on: Nothing
- Used by: All other modules in the package, CLI, Dashboard API, Dashboard frontend

**Corpus Layer:**
- Purpose: Load, validate, and scaffold benchmark query JSON files
- Location: `packages/benchmark/src/corpus.ts`
- Contains: `loadCorpus()`, `scaffoldExampleCorpus()`, `CorpusNotFoundError`, `BenchmarkQueriesFileSchema`
- Depends on: `zod`, `node:fs/promises`, Types layer
- Used by: CLI `benchmark run` subcommand

**Runner Layer:**
- Purpose: Execute benchmark queries against a search engine and compute metrics
- Location: `packages/benchmark/src/benchmark-runner.ts`
- Contains: `BenchmarkRunner` class with single `run()` method
- Depends on: `@ia-framework/retrieval` (for `RetrievalQuery`/`RetrievalResult` types only), Types layer
- Used by: CLI `benchmark run` subcommand

**Store Layer:**
- Purpose: Persist and retrieve benchmark runs in SQLite
- Location: `packages/benchmark/src/benchmark-store.ts`
- Contains: `BenchmarkStore` class with `saveRun()`, `getRunById()`, `listRuns()`, `close()`
- Depends on: `better-sqlite3`, Types layer
- Used by: CLI (all subcommands), Dashboard API benchmarks route

**Public API (barrel):**
- Purpose: Re-export all public types, classes, and functions
- Location: `packages/benchmark/src/index.ts`
- Exports: All types, `BenchmarkStore`, `BenchmarkRunner`, `loadCorpus`, `scaffoldExampleCorpus`, `CorpusNotFoundError`, `BenchmarkQueriesFileSchema`

## Data Flow

**Full Benchmark Run Lifecycle:**

1. **Invocation:** User runs `ia-framework benchmark run` (CLI) → `packages/cli/src/commands/benchmark.command.ts` `runSubcommand()`
2. **Config Loading:** CLI loads project config via `loadConfig(configPath)` from `@ia-framework/core`
3. **Corpus Loading:** CLI calls `loadCorpus(corpusPath)` to read + validate `benchmark-queries.json` via Zod. If file missing, auto-scaffolds example corpus and exits.
4. **Engine Construction:** CLI constructs `SearchEngine` from `@ia-framework/retrieval` using the project's configured embedding provider and Qdrant vector store
5. **Runner Execution:** `BenchmarkRunner.run(queries, configSnapshot)` iterates each `BenchmarkQuery` sequentially:
   - Calls `searchEngine.search({ text, limit: topK, scoreThreshold })` for each query
   - Measures wall-clock latency per query via `Date.now()` delta
   - Compares retrieved file paths against expected files to compute `hit`, `rank`, `reciprocalRank`
   - Aggregates: `hitAtK` = fraction of hits, `mrr` = mean of reciprocal ranks, `avgLatencyMs` = mean latency
   - Generates UUID `runId` and ISO timestamp
   - Sets `isBaseline = true` when `scoreThreshold > 1.0`
6. **Persistence:** CLI creates `BenchmarkStore` pointing to `{frameworkDir}/benchmarks.sqlite`, calls `store.saveRun(run)` which inserts run + all query results in a single SQLite transaction
7. **Output:** CLI prints formatted table with per-query results and aggregate summary to stdout

**Corpus File Format:**

The benchmark corpus is a JSON file (`benchmark-queries.json`) located in the framework directory (`{targetProject}/.ia-framework/`):

```json
{
  "queries": [
    {
      "id": "example-auth",
      "query": "authentication middleware",
      "expectedFiles": ["src/middleware/auth.ts"],
      "description": "Should find authentication middleware"
    }
  ]
}
```

Validated by `BenchmarkQueriesFileSchema` (Zod):
- `id`: non-empty string
- `query`: non-empty string
- `expectedFiles`: array of strings, minimum 1 item
- `description`: optional string

**No-RAG Baseline Flow:**

When `--baseline` flag is used (or `scoreThreshold > 1.0`):
1. `scoreThreshold` is set to `2.0` — impossible threshold for normalized similarity scores (0-1)
2. Search engine returns empty results for every query
3. All queries get `hit=false`, `rank=Infinity`, `reciprocalRank=0`
4. Run gets `hitAtK=0`, `mrr=0`, `isBaseline=true`
5. Stored normally — serves as comparison reference point

**Dashboard Data Flow:**

1. `packages/dashboard-api/src/routes/benchmarks.ts` exposes `GET /api/benchmarks` and `GET /api/benchmarks/:runId`
2. Route uses `BenchmarkStore` (injected via dependency) to read from the same SQLite database
3. `apps/dashboard/src/api/client.ts` `DashboardClient.getBenchmarks()` and `DashboardClient.getBenchmarkRun()` consume these endpoints

## Scoring System

**Hit@K (Hit Rate):**
- For each query: `hit = true` if ANY expected file appears in the top-K retrieved files
- Aggregate: `hitAtK = count(hit=true) / total_queries`
- Range: 0.0–1.0; higher is better
- Measures: Recall — "did we find at least one relevant file?"

**MRR (Mean Reciprocal Rank):**
- For each query: `rank` = 1-indexed position of first expected file in results; `Infinity` if not found
- `reciprocalRank = 1/rank` (or 0 if not found)
- Aggregate: `mrr = mean(reciprocalRank)` across all queries
- Range: 0.0–1.0; higher is better
- Measures: Precision — "how high did the relevant file rank?"

**avgLatencyMs:**
- Wall-clock time for each `searchEngine.search()` call
- Aggregate: arithmetic mean across all queries

## Key Abstractions

**BenchmarkRunner:**
- Purpose: Stateless executor that takes a search engine + config, runs queries, returns metrics
- Pattern: Constructor injection of search engine interface (duck typing: `{ search(q): Promise<RetrievalResult[]> }`)
- File: `packages/benchmark/src/benchmark-runner.ts`
- Stateless — one instance can run multiple `run()` calls

**BenchmarkStore:**
- Purpose: SQLite persistence layer with automatic schema creation
- Pattern: Active Record-ish — creates tables on construction, provides CRUD methods
- File: `packages/benchmark/src/benchmark-store.ts`
- Handles type mapping: `Infinity` → `1e308` sentinel for SQLite REAL column; `boolean` → 0/1 INTEGER; JSON arrays → serialized TEXT
- Uses `better-sqlite3` synchronous API with prepared statements
- Transaction wraps `saveRun()` to ensure atomicity of run + query results insertion

**Corpus Loader:**
- Purpose: File I/O + Zod validation for benchmark query definitions
- Pattern: Functional — two standalone async functions
- File: `packages/benchmark/src/corpus.ts`
- `scaffoldExampleCorpus()` uses `'wx'` file flag to prevent overwriting existing files

## Entry Points

**CLI (`ia-framework benchmark`):**
- Location: `packages/cli/src/commands/benchmark.command.ts`
- Subcommands:
  - `run` — Execute benchmark, save results, print table
  - `list` — Show recent runs in tabular format
  - `history` — ASCII chart of Hit@K trend across runs
  - `compare <runId1> <runId2>` — Side-by-side comparison with per-query breakdown and verdict

**Dashboard API:**
- Location: `packages/dashboard-api/src/routes/benchmarks.ts`
- Endpoints:
  - `GET /api/benchmarks?limit=N` → `{ runs: BenchmarkRun[] }`
  - `GET /api/benchmarks/:runId` → `BenchmarkRun` or `404`

**Dashboard Frontend:**
- Location: `apps/dashboard/src/api/client.ts`
- Methods: `DashboardClient.getBenchmarks(limit?)`, `DashboardClient.getBenchmarkRun(runId)`

## Database Schema

**File:** `{frameworkDir}/benchmarks.sqlite` (auto-created by `BenchmarkStore` constructor)

**Table: `benchmark_runs`:**
| Column | Type | Notes |
|--------|------|-------|
| `run_id` | TEXT PRIMARY KEY | UUID |
| `label` | TEXT | Nullable |
| `is_baseline` | INTEGER | 0 or 1 |
| `config_snapshot` | TEXT | JSON-serialized `ConfigSnapshot` |
| `hit_at_k` | REAL | 0.0–1.0 |
| `mrr` | REAL | 0.0–1.0 |
| `avg_latency_ms` | REAL | milliseconds |
| `timestamp` | TEXT | ISO 8601 |

**Table: `benchmark_query_results`:**
| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PRIMARY KEY | UUID |
| `run_id` | TEXT FK → benchmark_runs | |
| `query_id` | TEXT | From corpus `id` |
| `query` | TEXT | Natural language query text |
| `expected_files` | TEXT | JSON array |
| `retrieved_files` | TEXT | JSON array |
| `hit` | INTEGER | 0 or 1 |
| `rank` | REAL | 1-indexed; `1e308` sentinel for Infinity |
| `reciprocal_rank` | REAL | 0.0–1.0 |
| `latency_ms` | INTEGER | milliseconds |

**Indexes:**
- `idx_bqr_run_id` on `benchmark_query_results(run_id)` — join performance
- `idx_br_timestamp` on `benchmark_runs(timestamp)` — ordering for `listRuns()`

## Error Handling

**Strategy:** Custom error classes + Zod validation errors + CLI process.exit

**Patterns:**
- `CorpusNotFoundError` extends `Error` with `filePath` property for missing corpus files
- Zod `ZodError` thrown for malformed corpus JSON (schema validation)
- CLI catches all errors, logs to stderr with structured logger, and exits with code 1
- `scaffoldExampleCorpus()` uses `'wx'` flag — OS-level protection against file overwrite
- `BenchmarkStore.saveRun()` uses SQLite transaction — all-or-nothing for run + query results
- `rowToQueryResult()` restores `Infinity` from `1e308` sentinel (values ≥ `1e307` are treated as Infinity)

## Cross-Cutting Concerns

**Logging:** CLI subcommands use `createLogger('cli:benchmark:{subcommand}')` from `@ia-framework/core`. Structured logging via pino. Library code itself does not log.

**Validation:** Zod schema (`BenchmarkQueriesFileSchema`) validates corpus JSON on load. No runtime validation on runner inputs or store inputs (TypeScript type safety only).

**Configuration:** Project config loaded from `.ia-framework/project.json` via `@ia-framework/core` `loadConfig()`. Benchmark-specific config (`BenchmarkConfig`) built from CLI flags.

**ID Generation:** `crypto.randomUUID()` for run IDs and query result row IDs.

---

*Architecture analysis: 2026-04-02*
