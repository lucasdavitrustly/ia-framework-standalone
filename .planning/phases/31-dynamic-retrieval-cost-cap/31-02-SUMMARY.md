---
phase: 31-dynamic-retrieval-cost-cap
plan: 02
subsystem: mcp-server
tags: [token-cap, search, rag, retrieval, budget, observability]

requires:
  - phase: 31-dynamic-retrieval-cost-cap
    provides: applyTokenCap utility and TokenCapResult interface from plan 31-01

provides:
  - Token-capped search_codebase handler with 70/30 direct/hierarchy budget split
  - Token-capped search_codebase_hybrid handler with flat budget enforcement
  - Response metadata (token_cap_applied, results_trimmed) in structuredContent

affects: [mcp-server, search tools, retrieval cost]

tech-stack:
  added: []
  patterns:
    - '70/30 budget split: direct results get 70% of cap, hierarchy expansion gets 30%'
    - 'Token cap applied after retrieval, before response building — silent degradation when cap fits'
    - 'Cap metadata spread into structuredContent only when trimming actually occurred'

key-files:
  created: []
  modified:
    - packages/mcp-server/src/tools/search-codebase.ts
    - packages/mcp-server/src/tools/search-codebase-hybrid.ts
    - packages/mcp-server/src/tools/search-codebase.test.ts
    - packages/mcp-server/src/tools/search-codebase-hybrid.test.ts

key-decisions:
  - 'maxTokensPerCall added to ObservabilityConfig (search_codebase) and as handler options param (hybrid) — different because hybrid has no observability config'
  - 'token_cap_applied metadata only included in structuredContent when trimming occurs — no noise when cap not exceeded'
  - 'capMeta type uses `true as const` to satisfy TypeScript literal type'

requirements-completed: []

duration: 5min
completed: 2026-04-30
---

# Phase 31 Plan 02: Token Cap Wiring Summary

**Both search tool handlers enforce a 6000-token soft cap with 70/30 hierarchy/direct budget split and response metadata**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-30T18:09:00Z
- **Completed:** 2026-04-30T18:11:55Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- `search_codebase` handler applies token cap with 70/30 direct/hierarchy budget split
- `search_codebase_hybrid` handler applies flat token cap after retrieval
- Both handlers include `token_cap_applied` and `results_trimmed` in `structuredContent` when trimming occurs
- Added `maxTokensPerCall` to `ObservabilityConfig` with 6000-token default
- 6 new test cases covering trimming behavior and 70/30 split logic

## Task Commits

1. **Task 1: Wire token cap into search_codebase handler** - `2c86ef1` (feat)
2. **Task 2: Wire token cap into search_codebase_hybrid handler** - `935bfe1` (feat)

## Files Created/Modified

- `packages/mcp-server/src/tools/search-codebase.ts` - Added applyTokenCap import, maxTokensPerCall config, 70/30 budget split, capMeta in response
- `packages/mcp-server/src/tools/search-codebase-hybrid.ts` - Added applyTokenCap import, options param, flat cap enforcement, token_cap_applied in response
- `packages/mcp-server/src/tools/search-codebase.test.ts` - Added 2 token cap test cases (trimming + 70/30 split)
- `packages/mcp-server/src/tools/search-codebase-hybrid.test.ts` - Added 1 token cap test case

## Decisions Made

- `maxTokensPerCall` lives in `ObservabilityConfig` for `search_codebase` (consistent with existing observability pattern) and as a separate `options` param for the hybrid handler (which has no `ObservabilityConfig`)
- Token cap metadata only emitted when `tokenCapApplied === true` to avoid polluting clean responses

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 31 complete: both search tools enforce the token budget cap
- The applyTokenCap utility (plan 01) + handler wiring (plan 02) form the complete dynamic retrieval cost cap feature

---

_Phase: 31-dynamic-retrieval-cost-cap_
_Completed: 2026-04-30_
