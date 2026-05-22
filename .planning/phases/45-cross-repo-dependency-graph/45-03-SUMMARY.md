---
phase: 45-cross-repo-dependency-graph
plan: 03
subsystem: mcp-server
tags: [cross-repo, dependency-graph, result-formatting, attribution]

requires:
  - phase: 45-cross-repo-dependency-graph-01
    provides: resolveImportToRepo, expansionRepo field on RetrievalResult
provides:
  - '[via repo] annotation in formatted search results for cross-repo expansions'
  - '[repo-name] prefix on cross-repo imports in get_dependencies output'
affects: [mcp-server, retrieval]

tech-stack:
  added: []
  patterns: [cross-repo attribution annotations in tool output]

key-files:
  created: []
  modified:
    - packages/mcp-server/src/tools/result-formatting.ts
    - packages/mcp-server/src/tools/result-formatting.test.ts
    - packages/mcp-server/src/tools/get-dependencies.ts

key-decisions:
  - 'expansionRepo annotation shown only when it differs from repoId (no noise for same-repo results)'
  - 'Structured deps use object format {specifier, crossRepo?} instead of plain strings for programmatic consumers'

patterns-established:
  - 'Cross-repo attribution: [via repo] suffix for expansion origin, [repo] suffix for import target'

requirements-completed: [SRCH-02]

duration: 4min
completed: 2026-05-22
---

# Phase 45 Plan 03: Cross-Repo Attribution Annotations Summary

**[via repo] annotations on cross-repo expanded results and [repo-name] prefix on cross-repo imports in get_dependencies output**

## Performance

- **Duration:** 4 min
- **Started:** 2026-05-22T19:10:02Z
- **Completed:** 2026-05-22T19:13:53Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- buildCodeAnchor appends `[via expansionRepo]` when a result crossed a repo boundary
- get_dependencies annotates imports that resolve to other repos with `[targetRepo]` suffix
- Backward compatible — no annotation when no cross-repo context exists

## Task Commits

Each task was committed atomically:

1. **Task 1: Result formatting — [via repo] annotation** - `926ef98` (feat)
2. **Task 2: get_dependencies — cross-repo import annotation** - `cca7204` (feat)

## Files Created/Modified

- `packages/mcp-server/src/tools/result-formatting.ts` - Added expansionRepo to buildCodeAnchor, appends [via repo] suffix
- `packages/mcp-server/src/tools/result-formatting.test.ts` - Tests for [via repo] present, absent, same-repo cases
- `packages/mcp-server/src/tools/get-dependencies.ts` - resolveImportToRepo integration, repos? on Engine, structured crossRepo field

## Decisions Made

- Show `[via repo]` only when expansionRepo differs from repoId (avoids noise)
- Changed structured deps from `imports: string[]` to `imports: Array<{specifier, crossRepo?}>` for programmatic access

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 45 plans complete — cross-repo dependency graph fully wired with attribution annotations

---

_Phase: 45-cross-repo-dependency-graph_
_Completed: 2026-05-22_
