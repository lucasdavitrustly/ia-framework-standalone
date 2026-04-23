---
phase: 20-prompt-engineering
plan: 03
subsystem: cli
tags: [cli, benchmark, prompt-engineering, mrr, comparison]

requires:
  - phase: 20-prompt-engineering
    provides: prompt bump command and promptVersion config field (plan 01), BenchmarkRunner and benchmark corpus (plan 02)
provides:
  - prompt compare subcommand (ia-framework prompt compare v1 v2)
  - formatComparisonTable exported pure function
  - generateComparisonReport exported pure function
affects: [cli, benchmark, prompt-engineering]

tech-stack:
  added: []
  patterns:
    - 'Subprocess re-index pattern: write promptVersion to config, run index via execFileSync, restore in finally'
    - 'Exported pure formatting functions for testability (formatComparisonTable, generateComparisonReport)'
    - 'ANSI color coding: GREEN for positive delta, RED for negative delta'

key-files:
  created:
    - packages/cli/src/commands/prompt.command.test.ts
  modified:
    - packages/cli/src/commands/prompt.command.ts

key-decisions:
  - 'Subprocess approach for re-indexing: write promptVersion to config file, call execFileSync for index --force --strategy llm, restore in finally block — avoids import complexity and guarantees indexer reads correct version'
  - 'Exported formatComparisonTable and generateComparisonReport as pure functions for testability — Commander action is a thin wrapper'
  - 'Delta computed as rr_A - rr_B (v1 vs v2 perspective) — positive means v1 improved over v2, colored green'

requirements-completed:
  - PRMT-05

duration: 8min
completed: 2026-04-23
---

# Phase 20 Plan 03: Prompt Compare Subcommand Summary

**`ia-framework prompt compare v1 v2` command with full re-index per version, per-query MRR delta table with ANSI color coding, and markdown report output**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-23T12:51:36Z
- **Completed:** 2026-04-23T12:59:30Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- `prompt compare v1 v2` subcommand implemented — re-indexes with each prompt version and diffs MRR
- Per-query MRR delta table with ANSI green/red color coding for positive/negative deltas
- Markdown report auto-saved to `.ia-framework/prompt-compare-vN-vN-{timestamp}.md`
- Original `promptVersion` restored in `finally` block even on error
- 10 unit tests covering table formatting and markdown report generation

## Task Commits

1. **Task 1: Implement prompt compare subcommand** - `c7f8f6b` (feat)
2. **Task 2: Add unit tests for prompt compare logic** - `09e9922` (test)

## Files Created/Modified

- `packages/cli/src/commands/prompt.command.ts` - Added compareSubcommand(), formatComparisonTable(), generateComparisonReport(); registered with promptCommand()
- `packages/cli/src/commands/prompt.command.test.ts` - 10 unit tests for comparison formatting

## Decisions Made

- Subprocess re-index approach: write `promptVersion` to config file, `execFileSync` the `index --force --strategy llm` subcommand, then restore in `finally`. This is simpler than importing the indexing pipeline directly and guarantees the indexer reads the correct version from disk.
- Extracted `formatComparisonTable` and `generateComparisonReport` as exported pure functions so tests can verify behavior without spawning Commander.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 20 is complete — all 3 plans done
- `prompt compare` closes the prompt engineering loop: bump → compare → measure MRR impact
- Ready for milestone completion review

---

_Phase: 20-prompt-engineering_
_Completed: 2026-04-23_
