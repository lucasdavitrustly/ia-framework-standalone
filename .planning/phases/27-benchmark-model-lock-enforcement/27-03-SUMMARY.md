---
phase: 27-benchmark-model-lock-enforcement
plan: 03
subsystem: cli
tags: [benchmark, model-enforcement, cli, commander, vitest]

requires:
  - phase: 27-benchmark-model-lock-enforcement
    provides: parseIdentityBlock, compareModelIdentity, BenchmarkConfig.strictModel/configuredModel (plans 27-01, 27-02)
provides:
  - --strict-model flag on benchmark run CLI subcommand
  - --model <model-id> flag on benchmark run CLI subcommand
  - validate-models subcommand for retroactive model identity analysis
affects: [benchmark-cli-users, ci-pipelines]

tech-stack:
  added: []
  patterns:
    - 'CLI flags pass through to BenchmarkConfig for strictModel/configuredModel'
    - 'Retroactive validation subcommand follows compareSubcommand() pattern'

key-files:
  created: []
  modified:
    - packages/cli/src/commands/benchmark.command.ts
    - packages/cli/src/commands/benchmark.command.test.ts

key-decisions:
  - 'validate-models gracefully handles missing rawResponse with informative message'
  - 'DEFAULT_CONFIG constant extracted to module scope for use in validateModelsSubcommand'

requirements-completed: []

duration: 8min
completed: 2026-04-29
---

# Phase 27 Plan 03: Benchmark CLI --strict-model and validate-models Summary

**--strict-model flag and validate-models subcommand added to benchmark CLI, enabling CI enforcement and retroactive model identity auditing**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-29T13:38:00Z
- **Completed:** 2026-04-29T13:46:46Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added `--strict-model` and `--model <model-id>` options to `benchmark run` subcommand
- `strictModel` and `configuredModel` now passed into `BenchmarkConfig` on each run
- Created `validateModelsSubcommand()` for retroactive analysis of stored runs
- Registered `validate-models` in `benchmarkCommand()`
- Added 3 new structure tests verifying validate-models, --strict-model, and --model flags
- Rebuilt benchmark dist to expose `parseIdentityBlock`/`compareModelIdentity` exports to CLI

## Task Commits

1. **Task 1: --strict-model flag and validate-models subcommand** - `a325c30` (feat)
2. **Task 2: CLI integration tests** - `e580106` (test)

## Files Created/Modified

- `packages/cli/src/commands/benchmark.command.ts` - Added --strict-model, --model options and validateModelsSubcommand
- `packages/cli/src/commands/benchmark.command.test.ts` - Added tests for new flags and subcommand

## Decisions Made

- `validate-models` outputs informative message when rawResponse not stored (v1 limitation)
- `DEFAULT_CONFIG` constant hoisted to module scope to share between `runSubcommand` and `validateModelsSubcommand`

## Deviations from Plan

**1. [Rule 3 - Blocking] Rebuilt benchmark dist to expose identity-parser exports**

- **Found during:** Task 1 (importing parseIdentityBlock/compareModelIdentity)
- **Issue:** benchmark dist was stale and didn't include the new exports from plan 27-01
- **Fix:** `cd packages/benchmark && pnpm build` to regenerate dist
- **Files modified:** packages/benchmark/dist/ (gitignored, not committed)
- **Verification:** tsc --noEmit passed after rebuild

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Required pre-build of benchmark package; no scope creep.

## Issues Encountered

None beyond the stale dist.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 27 complete — all 3 plans executed
- CI can now use: `ia-framework benchmark run --strict-model --model <model-id>`
- Developers can audit runs with: `ia-framework benchmark validate-models <run-id>`

---

_Phase: 27-benchmark-model-lock-enforcement_
_Completed: 2026-04-29_
