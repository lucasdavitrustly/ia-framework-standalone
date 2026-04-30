---
phase: 31-dynamic-retrieval-cost-cap
plan: '01'
subsystem: mcp-server
tags: [token-cap, retrieval, config, vitest, tdd, zod]

requires: []
provides:
  - Token cap utility (estimateTokens + applyTokenCap) in mcp-server tools
  - RetrievalConfigSchema extended with optional maxTokensPerCall field
affects:
  - 31-02 (search tool integration will use applyTokenCap)

tech-stack:
  added: []
  patterns:
    - 'TDD RED-GREEN: test file committed before implementation'
    - 'Token estimation: ceil(content.length / 4) heuristic per D-01'
    - 'Minimum-1 guarantee: applyTokenCap always returns at least the first result'

key-files:
  created:
    - packages/mcp-server/src/tools/token-cap.ts
    - packages/mcp-server/src/tools/token-cap.test.ts
  modified:
    - packages/core/src/config/schema.ts
    - packages/core/src/config/schema.test.ts

key-decisions:
  - 'Token estimation uses ceil(length/4) heuristic — simple, fast, no LLM tokenizer dependency'
  - 'Default cap of 6000 applied at handler level, not schema level (schema just validates override)'
  - 'Minimum-1 guarantee: first result always included even if it alone exceeds budget'

requirements-completed: []

duration: 3min
completed: 2026-04-30
---

# Phase 31 Plan 01: Token Cap Utility + Config Schema Summary

**Token cap utility `applyTokenCap` + `estimateTokens` implemented via TDD, with `RetrievalConfigSchema` extended to accept optional `maxTokensPerCall` positive integer**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-30T15:01:40Z
- **Completed:** 2026-04-30T15:04:20Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- `estimateTokens(content)` → `Math.ceil(content.length / 4)` — zero-dependency token heuristic
- `applyTokenCap(results, maxTokens)` → `TokenCapResult` — trims lowest-ranked results with minimum-1 guarantee
- `RetrievalConfigSchema` extended with `maxTokensPerCall: z.number().int().positive().optional()`
- 9 tests for token cap + 4 new tests for schema, all passing

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: estimateTokens/applyTokenCap failing tests** - `53308f0` (test)
2. **Task 1 GREEN: token-cap.ts implementation** - `00203db` (feat)
3. **Task 2 RED: maxTokensPerCall schema tests** - `b7577f2` (test)
4. **Task 2 GREEN: schema extension** - `d326794` (feat)

## Files Created/Modified

- `packages/mcp-server/src/tools/token-cap.ts` — Token cap utility with `estimateTokens`, `applyTokenCap`, `TokenCapResult`
- `packages/mcp-server/src/tools/token-cap.test.ts` — 9 unit tests covering all edge cases
- `packages/core/src/config/schema.ts` — `RetrievalConfigSchema` with `maxTokensPerCall` optional field
- `packages/core/src/config/schema.test.ts` — 4 tests validating maxTokensPerCall validation rules

## Decisions Made

- Token estimation uses `ceil(length/4)` — simple heuristic matching D-01, no external dependency
- Default cap of 6000 applied at handler level (plan 31-02), not baked into schema default
- Minimum-1 guarantee: even if a single chunk exceeds budget, it's still returned (avoids empty result set)

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Token cap utility ready for integration into search tool handlers (plan 31-02)
- Config schema updated — `retrieval.maxTokensPerCall` can now be read from project.json

---

_Phase: 31-dynamic-retrieval-cost-cap_
_Completed: 2026-04-30_
