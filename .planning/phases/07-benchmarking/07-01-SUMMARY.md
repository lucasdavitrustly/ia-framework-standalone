---
phase: "07-benchmarking"
plan: "01"
subsystem: benchmark
tags: [benchmark, sqlite, tdd, metrics, retrieval-quality]
dependency_graph:
  requires: [packages/retrieval, packages/core]
  provides: [packages/benchmark]
  affects: [packages/cli]
tech_stack:
  added: [better-sqlite3, "@ia-framework/benchmark"]
  patterns: [tdd-red-green, sqlite-synchronous-api, exactOptionalPropertyTypes-fix]
key_files:
  created:
    - packages/benchmark/package.json
    - packages/benchmark/tsup.config.ts
    - packages/benchmark/tsconfig.json
    - packages/benchmark/src/types.ts
    - packages/benchmark/src/benchmark-store.ts
    - packages/benchmark/src/benchmark-store.test.ts
    - packages/benchmark/src/benchmark-runner.ts
    - packages/benchmark/src/benchmark-runner.test.ts
    - packages/benchmark/src/index.ts
  modified:
    - pnpm-lock.yaml
decisions:
  - "Infinity stored as 1e308 in SQLite REAL column and restored via rank >= 1e307 sentinel check"
  - "exactOptionalPropertyTypes requires conditional assignment for optional label field (not spread with undefined)"
  - "noUncheckedIndexedAccess requires non-null assertions (!) for array index access in tests"
metrics:
  duration: "6 min"
  completed: "2026-04-01"
  tasks_completed: 1
  files_created: 9
---

# Phase 7 Plan 01: packages/benchmark — Types, BenchmarkStore, BenchmarkRunner Summary

**One-liner:** SQLite-backed BenchmarkStore and BenchmarkRunner measuring Hit@K + MRR + latency against mocked SearchEngine.

## What Was Built

Created the `@ia-framework/benchmark` package from scratch with complete TDD lifecycle:

### Package Scaffold
- `package.json` with `better-sqlite3` + `@ia-framework/retrieval` workspace dependencies
- `tsup.config.ts` mirroring observability package pattern
- `tsconfig.json` extending root `tsconfig.base.json`

### Domain Types (`src/types.ts`)
- `BenchmarkQuery` — query ID, text, expectedFiles[], optional description
- `QueryResult` — per-query results: hit, rank (Infinity if not found), reciprocalRank, latencyMs
- `ConfigSnapshot` — embedding provider/model, collectionName, topK, scoreThreshold
- `BenchmarkRun` — aggregated run: hitAtK, mrr, avgLatencyMs, isBaseline flag, queries[]
- `BenchmarkConfig` — topK, scoreThreshold, optional label

### BenchmarkStore (`src/benchmark-store.ts`)
- `better-sqlite3` synchronous SQLite API
- Two tables: `benchmark_runs` + `benchmark_query_results`
- Indexes on `run_id` and `timestamp` for efficient querying
- `saveRun()` — transaction inserting run + N query results atomically
- `getRunById()` — returns full BenchmarkRun with queries, or null
- `listRuns(limit?)` — newest first (ORDER BY timestamp DESC)
- `close()` — releases DB connection

### BenchmarkRunner (`src/benchmark-runner.ts`)
- Accepts any `{ search(q: RetrievalQuery): Promise<RetrievalResult[]> }` (duck-typed SearchEngine)
- Per-query: measures latency, finds first expectedFile position in retrievedFiles
- Aggregates: hitAtK = hits/total, mrr = mean(reciprocalRank), avgLatencyMs
- `isBaseline = scoreThreshold > 1.0` for no-RAG baseline runs

## Tests

| File | Tests | Status |
|------|-------|--------|
| benchmark-store.test.ts | 6 | ✅ pass |
| benchmark-runner.test.ts | 7 | ✅ pass |
| **Total** | **13** | **✅ all green** |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] exactOptionalPropertyTypes incompatibility with undefined spread**
- **Found during:** Build/DTS phase
- **Issue:** `label: this.config.label` assigns `string | undefined` to optional `label?: string`, rejected by `exactOptionalPropertyTypes: true`
- **Fix:** Conditional assignment — `if (label !== undefined) { run.label = label; }`
- **Files modified:** `benchmark-runner.ts`, `benchmark-store.ts`
- **Commit:** 96bd357

**2. [Rule 1 - Bug] noUncheckedIndexedAccess array index in tests**
- **Found during:** Typecheck phase
- **Issue:** `result.queries[0]` typed as `QueryResult | undefined` due to `noUncheckedIndexedAccess`
- **Fix:** Added non-null assertions `!` for array index access in tests
- **Files modified:** `benchmark-runner.test.ts`, `benchmark-store.test.ts`
- **Commit:** 96bd357

## Known Stubs

None — all functionality fully implemented and tested.

## Self-Check: PASSED

- ✅ FOUND: packages/benchmark/src/types.ts
- ✅ FOUND: packages/benchmark/src/benchmark-store.ts
- ✅ FOUND: packages/benchmark/src/benchmark-store.test.ts
- ✅ FOUND: packages/benchmark/src/benchmark-runner.ts
- ✅ FOUND: packages/benchmark/src/benchmark-runner.test.ts
- ✅ FOUND: packages/benchmark/src/index.ts
- ✅ FOUND: commit 96bd357
