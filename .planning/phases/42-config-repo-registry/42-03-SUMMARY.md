---
phase: 42-config-repo-registry
plan: '03'
subsystem: config
tags: [zod, schema, validation, typescript]

requires: []
provides:
  - Corrected RetrievalConfigSchema.maxTokensPerCall with positive().optional() semantics
affects: [mcp-server, core]

tech-stack:
  added: []
  patterns:
    - 'Use z.number().int().positive().optional() for optional positive-only numeric fields (no default)'

key-files:
  created: []
  modified:
    - packages/core/src/config/schema.ts

key-decisions:
  - 'maxTokensPerCall changed from min(0).default(40000) to positive().optional() — aligns with test expectations and removes implicit default'

patterns-established:
  - 'positive().optional() pattern: field absent when omitted, rejects 0 and negatives'

requirements-completed: [CONF-01]

duration: 1min
completed: 2026-05-21
---

# Phase 42 Plan 03: Fix RetrievalConfigSchema.maxTokensPerCall Summary

**Fixed Zod schema mismatch for `maxTokensPerCall` — changed `min(0).default(40000)` to `positive().optional()`, resolving 2 failing tests and bringing all 87 core tests to green.**

## Performance

- **Duration:** 1 min
- **Started:** 2026-05-21T20:03:32Z
- **Completed:** 2026-05-21T20:04:30Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Fixed `RetrievalConfigSchema.maxTokensPerCall` to use `z.number().int().positive().optional()`
- All 87 tests in `@ia-framework/core` pass (schema.test.ts 39, registry.test.ts 18, detector.test.ts 11, + others)

## Task Commits

1. **Task 1: Fix RetrievalConfigSchema.maxTokensPerCall** - `9191cf9` (fix)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `packages/core/src/config/schema.ts` - Changed maxTokensPerCall from min(0).default(40000) to positive().optional()

## Decisions Made

- No default value for maxTokensPerCall — callers that previously relied on the 40000 default must provide explicit values or handle undefined. This matches the test-specified contract.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All phase-42 schema tests pass
- Ready for phase completion / next phase planning

---

_Phase: 42-config-repo-registry_
_Completed: 2026-05-21_
