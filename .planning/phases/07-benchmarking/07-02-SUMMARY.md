---
phase: "07-benchmarking"
plan: "02"
subsystem: benchmark, cli
tags: [benchmark, corpus, zod, cli, tdd]
dependency_graph:
  requires: [packages/benchmark (07-01), packages/retrieval, packages/core, packages/embedding, packages/vector-store]
  provides: [packages/benchmark corpus, packages/cli benchmark command]
  affects: [packages/cli bin.ts]
tech_stack:
  added: [zod dependency in benchmark package]
  patterns: [tdd-corpus-red-green, zod-validation, commander-subcommands, exactOptionalPropertyTypes-cast]
key_files:
  created:
    - packages/benchmark/src/corpus.ts
    - packages/benchmark/src/corpus.test.ts
    - packages/cli/src/commands/benchmark.command.ts
  modified:
    - packages/benchmark/package.json
    - packages/benchmark/src/index.ts
    - packages/cli/package.json
    - packages/cli/src/bin.ts
    - packages/cli/src/commands/index.ts
    - pnpm-lock.yaml
decisions:
  - "Zod schema output cast to BenchmarkQuery[] to satisfy exactOptionalPropertyTypes (description optional field mismatch)"
  - "benchmarkCommand() extracts each subcommand to its own helper function (runSubcommand, listSubcommand, historySubcommand) for readability and future extensibility"
  - "benchmark run exits 0 with guidance message after first-run corpus scaffold — prevents running benchmark with placeholder queries"
metrics:
  duration: "9 min"
  completed: "2026-04-01"
  tasks_completed: 2
  files_created: 3
---

# Phase 7 Plan 02: QueryCorpus Loader and Benchmark CLI Command Summary

**One-liner:** Zod-validated corpus loader with first-run scaffold + benchmark CLI commands (run/list/history) using Commander sub-subcommand pattern.

## What Was Built

### QueryCorpus Loader (`packages/benchmark/src/corpus.ts`)

- `BenchmarkQueriesFileSchema` — Zod v4 schema validating `{ queries: BenchmarkQuery[] }` structure
- `loadCorpus(filePath)` — reads JSON, throws `CorpusNotFoundError` on ENOENT, ZodError on invalid structure
- `scaffoldExampleCorpus(filePath)` — writes 3-query example JSON with `{ flag: 'wx' }` (no overwrite)
- `CorpusNotFoundError` — custom error class with `filePath` property for precise error handling

### Benchmark CLI Commands (`packages/cli/src/commands/benchmark.command.ts`)

**`benchmark run`** — full benchmark pipeline:
1. Load config + build SearchEngine (matches search.command.ts pattern)
2. Try loadCorpus — on first run: scaffold example + exit 0 with guidance
3. Run BenchmarkRunner with config options
4. Save run to BenchmarkStore (`benchmarks.sqlite`)
5. Print formatted Unicode box-drawing table + summary stats

**`benchmark list`** — tabular recent runs (newest first):
- Columns: ID (8 chars), Timestamp, Label, Hit@K, MRR, Baseline
- "No benchmark runs yet" on empty store

**`benchmark history`** — ASCII Hit@K trend chart:
- 10-row height, each run = one column, chronological order (oldest→newest)
- Baseline runs shown as ○ vs ● for RAG runs
- Requires ≥2 runs (guidance message if fewer)

### CLI Wiring
- Added `@ia-framework/benchmark: workspace:*` to CLI dependencies
- Added `benchmarkCommand()` to `bin.ts` and `commands/index.ts`

## Tests

| File | Tests | Status |
|------|-------|--------|
| benchmark-store.test.ts | 6 | ✅ pass |
| benchmark-runner.test.ts | 7 | ✅ pass |
| corpus.test.ts | 6 | ✅ pass |
| **Total** | **19** | **✅ all green** |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] exactOptionalPropertyTypes incompatibility in corpus.ts Zod return**
- **Found during:** Build DTS phase
- **Issue:** Zod's inferred type for `description?: string | undefined` conflicts with `exactOptionalPropertyTypes` strict optional typing
- **Fix:** `return validated.queries as BenchmarkQuery[]` cast
- **Files modified:** `corpus.ts`
- **Commit:** 5c31e93

## Known Stubs

None.

## Self-Check: PASSED

- ✅ FOUND: packages/benchmark/src/corpus.ts
- ✅ FOUND: packages/benchmark/src/corpus.test.ts
- ✅ FOUND: packages/cli/src/commands/benchmark.command.ts
- ✅ FOUND: commit 5c31e93
- ✅ 19 tests passing
- ✅ CLI build + typecheck clean
