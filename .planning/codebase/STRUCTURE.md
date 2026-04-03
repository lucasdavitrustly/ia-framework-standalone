# Codebase Structure

**Analysis Date:** 2026-04-02

**Scope:** `packages/benchmark` — RAG retrieval quality benchmarking system and its integration points

## Directory Layout

```
packages/benchmark/
├── src/
│   ├── types.ts                  # Pure domain interfaces (no implementation)
│   ├── corpus.ts                 # Corpus loading, validation, scaffolding
│   ├── corpus.test.ts            # Tests for corpus module
│   ├── benchmark-runner.ts       # Query execution engine + metric computation
│   ├── benchmark-runner.test.ts  # Tests for runner
│   ├── benchmark-store.ts        # SQLite persistence (better-sqlite3)
│   ├── benchmark-store.test.ts   # Tests for store
│   └── index.ts                  # Barrel re-exports (public API)
├── dist/                         # Built output (tsup → ESM + DTS)
│   ├── index.js                  # Bundled ESM
│   ├── index.js.map              # Source map
│   └── index.d.ts                # Type declarations
├── package.json                  # @ia-framework/benchmark
├── tsconfig.json                 # Extends root tsconfig.base.json
└── tsup.config.ts                # Build config (ESM, DTS, sourcemap, node22)
```

## Integration Points (Other Packages)

```
packages/cli/src/commands/
└── benchmark.command.ts          # CLI commands: run, list, history, compare

packages/dashboard-api/src/
├── server.ts                     # Creates BenchmarkStore, passes to app
├── app.ts                        # Mounts benchmarks router at /api/benchmarks
└── routes/
    └── benchmarks.ts             # GET /api/benchmarks, GET /api/benchmarks/:runId

apps/dashboard/src/api/
└── client.ts                     # Frontend API client (getBenchmarks, getBenchmarkRun)
```

## Directory Purposes

**`packages/benchmark/src/`:**
- Purpose: Core benchmark library — types, logic, persistence
- Contains: TypeScript source files and co-located test files
- Key files:
  - `types.ts` — All domain interfaces
  - `benchmark-runner.ts` — Query execution and metric computation
  - `benchmark-store.ts` — SQLite read/write operations
  - `corpus.ts` — Corpus file I/O and Zod validation
  - `index.ts` — Public API barrel

**`packages/benchmark/dist/`:**
- Purpose: Build output consumed by other packages
- Contains: Bundled ESM JavaScript, source maps, TypeScript declarations
- Generated: Yes (by `tsup`)
- Committed: Yes (workspace dependency resolution)

## Key File Locations

**Entry Points:**
- `packages/benchmark/src/index.ts`: Library barrel — all public exports
- `packages/cli/src/commands/benchmark.command.ts`: CLI entry — `benchmarkCommand()` function

**Configuration:**
- `packages/benchmark/tsup.config.ts`: Build configuration (ESM-only, node22 target)
- `packages/benchmark/tsconfig.json`: TypeScript config (extends root)
- `packages/benchmark/package.json`: Package manifest with `@ia-framework/retrieval` workspace dependency

**Core Logic:**
- `packages/benchmark/src/benchmark-runner.ts`: Execution engine — iterates queries, calls search, computes metrics
- `packages/benchmark/src/benchmark-store.ts`: SQLite persistence — schema creation, transactional writes, queries
- `packages/benchmark/src/corpus.ts`: Corpus loading with Zod validation and file scaffolding

**Testing:**
- `packages/benchmark/src/corpus.test.ts`: 6 tests — load/validate/scaffold corpus files
- `packages/benchmark/src/benchmark-runner.test.ts`: 7 tests — hit/miss/rank/baseline/latency
- `packages/benchmark/src/benchmark-store.test.ts`: 6 tests — save/get/list/infinity-roundtrip/close

**API Routes:**
- `packages/dashboard-api/src/routes/benchmarks.ts`: Hono router exposing benchmark data

**Frontend Client:**
- `apps/dashboard/src/api/client.ts`: Typed fetch wrapper for benchmark endpoints

## Naming Conventions

**Files:**
- Domain modules: `kebab-case.ts` (e.g., `benchmark-runner.ts`, `benchmark-store.ts`)
- Test files: `{module-name}.test.ts` co-located with source (e.g., `benchmark-runner.test.ts`)
- Types-only files: `types.ts`
- Barrel exports: `index.ts`

**Directories:**
- Package names: `kebab-case` (e.g., `packages/benchmark`)
- Source code: always in `src/`

**Exports:**
- Classes: PascalCase (e.g., `BenchmarkRunner`, `BenchmarkStore`)
- Functions: camelCase (e.g., `loadCorpus`, `scaffoldExampleCorpus`)
- Interfaces: PascalCase (e.g., `BenchmarkQuery`, `QueryResult`)
- Error classes: PascalCase + `Error` suffix (e.g., `CorpusNotFoundError`)
- Zod schemas: PascalCase + `Schema` suffix (e.g., `BenchmarkQueriesFileSchema`)

## Where to Add New Code

**New Benchmark Metric:**
- Add type to `packages/benchmark/src/types.ts` (on `QueryResult` or `BenchmarkRun`)
- Compute in `packages/benchmark/src/benchmark-runner.ts` `run()` method
- Persist in `packages/benchmark/src/benchmark-store.ts` (add column, update insert/select)
- Display in `packages/cli/src/commands/benchmark.command.ts` print functions
- Test in `packages/benchmark/src/benchmark-runner.test.ts`

**New CLI Subcommand (e.g., `benchmark delete`):**
- Add function in `packages/cli/src/commands/benchmark.command.ts` following existing pattern
- Register in `benchmarkCommand()` at bottom of file via `benchmark.addCommand()`

**New Store Query (e.g., filter runs by config):**
- Add method to `BenchmarkStore` in `packages/benchmark/src/benchmark-store.ts`
- Add test in `packages/benchmark/src/benchmark-store.test.ts`
- Export through `packages/benchmark/src/index.ts` (already exported as class)

**New Dashboard Endpoint:**
- Add route in `packages/dashboard-api/src/routes/benchmarks.ts`
- Add client method in `apps/dashboard/src/api/client.ts`

**New Corpus Validation Rule:**
- Modify Zod schema in `packages/benchmark/src/corpus.ts` `BenchmarkQuerySchema`
- Add test case in `packages/benchmark/src/corpus.test.ts`

## Special Directories

**`dist/`:**
- Purpose: tsup build output (ESM + DTS + sourcemaps)
- Generated: Yes (`pnpm build` / `turbo build`)
- Committed: Yes (required for workspace cross-package resolution)

**`.turbo/`:**
- Purpose: Turborepo build cache and logs
- Generated: Yes
- Committed: No (in .gitignore)

**`node_modules/`:**
- Purpose: Package dependencies (pnpm workspace symlinks)
- Generated: Yes (`pnpm install`)
- Committed: No

## Data Files

**`{targetProject}/.ia-framework/benchmark-queries.json`:**
- Purpose: Benchmark corpus — user-defined queries with expected results
- Created by: `scaffoldExampleCorpus()` on first `benchmark run`
- Edited by: User (must customize for their codebase)
- Format: JSON validated by `BenchmarkQueriesFileSchema`

**`{targetProject}/.ia-framework/benchmarks.sqlite`:**
- Purpose: Persistent storage for all benchmark runs and query results
- Created by: `BenchmarkStore` constructor (auto-creates tables)
- Shared by: CLI (read/write), Dashboard API (read-only)

---

*Structure analysis: 2026-04-02*
