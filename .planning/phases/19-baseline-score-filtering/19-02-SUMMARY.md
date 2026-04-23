---
phase: 19-baseline-score-filtering
plan: '02'
subsystem: benchmark
tags: [benchmark, baseline, mrr, stddev, sqlite, cli]

requires:
  - phase: 19-baseline-score-filtering
    provides: BenchmarkRunner.run(), BenchmarkStore, BenchmarkQuery corpus

provides:
  - BenchmarkRunner.runBaseline() with 3-run averaging and MRR stddev
  - BaselineResult type with runs array, avgMrr, avgHitAtK, mrrStddev
  - BenchmarkStore.saveBaseline() and getLatestBaseline() with baseline_runs table
  - CLI subcommand `ia-framework benchmark baseline` for reproducible MRR baseline

affects: [19-03, 19-04, score-filtering, dashboard]

tech-stack:
  added: []
  patterns:
    - 'TDD RED-GREEN-REFACTOR for benchmark baseline feature'
    - '3-run averaging with population stddev for MRR reliability'
    - 'Dedicated baseline_runs SQLite table separate from benchmark_runs'

key-files:
  created:
    - packages/benchmark/src/__tests__/baseline-runner.test.ts
  modified:
    - packages/benchmark/src/types.ts
    - packages/benchmark/src/benchmark-runner.ts
    - packages/benchmark/src/benchmark-store.ts
    - packages/benchmark/src/index.ts
    - packages/cli/src/commands/benchmark.command.ts

key-decisions:
  - 'Stddev uses population formula (divide by N=3) not sample (N-1) — consistent with the plan spec'
  - 'baseline_runs table stores run_ids as JSON array, individual runs saved via existing saveRun()'
  - 'getLatestBaseline() reconstructs BenchmarkRun objects from run_ids via getRunById()'

requirements-completed:
  - BASE-02

duration: 8min
completed: 2026-04-22
---

# Phase 19 Plan 02: Baseline Score Filtering Summary

**3-run MRR baseline benchmark with stddev reporting, dedicated SQLite storage, and `ia-framework benchmark baseline` CLI subcommand**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-22T23:18:00Z
- **Completed:** 2026-04-22T23:26:29Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Added `BaselineResult` interface to types.ts with baselineId, runs[], avgMrr, avgHitAtK, avgLatencyMs, mrrStddev
- Implemented `BenchmarkRunner.runBaseline()` — calls `run()` exactly 3 times, computes averages and population stddev
- Extended `BenchmarkStore` with `baseline_runs` table, `saveBaseline()`, and `getLatestBaseline()`
- Added `benchmark baseline` CLI subcommand with full corpus setup, search engine wiring, and formatted output

## Task Commits

1. **Task 1 (RED): Failing tests** — `e74e649` (test)
2. **Task 1 (GREEN): runBaseline, saveBaseline, getLatestBaseline** — `450c56f` (feat)
3. **Task 2: CLI baseline subcommand** — `7058fed` (feat)

## Files Created/Modified

- `packages/benchmark/src/__tests__/baseline-runner.test.ts` — 14 new tests covering runBaseline and store baseline methods
- `packages/benchmark/src/types.ts` — Added `BaselineResult` interface
- `packages/benchmark/src/benchmark-runner.ts` — Added `runBaseline()` method with NUM_RUNS=3, averaging, stddev
- `packages/benchmark/src/benchmark-store.ts` — Added `baseline_runs` table, `saveBaseline()`, `getLatestBaseline()`
- `packages/benchmark/src/index.ts` — Exported `BaselineResult` type
- `packages/cli/src/commands/benchmark.command.ts` — Added `baselineSubcommand()` and registered it

## Decisions Made

- Population stddev (divide by N) used instead of sample stddev (divide by N-1) — with N=3 fixed, either is acceptable and population matches the plan's formula
- Individual runs stored in existing `benchmark_runs` table; `baseline_runs` stores aggregates + run_id array
- `getLatestBaseline()` reconstructs full BenchmarkRun objects for each run via `getRunById()` — keeps baseline_runs table lean

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## Next Phase Readiness

- `ia-framework benchmark baseline` command is ready to establish reproducible MRR baseline
- Baseline data in SQLite ready for comparison after score threshold tuning (Plan 03/04)

---

_Phase: 19-baseline-score-filtering_
_Completed: 2026-04-22_
