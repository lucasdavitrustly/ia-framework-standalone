---
phase: 23-zero-result-fallback-search
plan: 02
subsystem: mcp-server
tags: [mcp, fallback, search, retrieval, structured-content]

requires:
  - phase: 23-zero-result-fallback-search
    provides: searchWithFallback method on SearchEngine and FallbackSearchResult/FallbackSuggestion types

provides:
  - search_codebase MCP tool with structured fallback envelope on zero results
  - search_codebase_hybrid MCP tool with structured fallback envelope on zero results
  - fallback:false param on search_codebase to disable fallback
  - 'No exact match found. Closest related code:' text for LLMs on negative queries

affects: [mcp-server, benchmarks]

tech-stack:
  added: []
  patterns:
    - "Zero-result fallback: primary search -> if empty -> searchWithFallback -> structured envelope with suggestions"
    - "Suggestions stripped of score field (D-11) - only file/name/snippet"

key-files:
  created:
    - packages/mcp-server/src/tools/__tests__/search-codebase-fallback.test.ts
    - packages/mcp-server/src/tools/__tests__/search-codebase-hybrid-fallback.test.ts
  modified:
    - packages/mcp-server/src/tools/search-codebase.ts
    - packages/mcp-server/src/tools/search-codebase-hybrid.ts

key-decisions:
  - "searchWithFallback called only when primary returns 0 results and fallback param not false"
  - "Suggestions stripped of score field per D-11 before placing in structuredContent"
  - "Backward compat: HybridEngine.searchWithFallback is optional; falls back to existing behavior when absent"

requirements-completed: []

duration: 12min
completed: 2026-04-28
---

# Phase 23 Plan 02: MCP Fallback Wiring Summary

**search_codebase and search_codebase_hybrid tools now return structured fallback envelope with keyword suggestions when primary search returns zero results**

## Performance

- **Duration:** 12 min
- **Started:** 2026-04-28T17:47:18Z
- **Completed:** 2026-04-28T17:58:59Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- Wired search_codebase to call `searchWithFallback()` on zero results, returning `found/fallback_used/fallback_mode/suggestions` in structuredContent
- Wired search_codebase_hybrid with same fallback pattern, backward-compatible with engines lacking `searchWithFallback`
- Added `fallback:false` input param on search_codebase to disable fallback and get raw empty results
- 10 new TDD tests (6 for search_codebase, 4 for hybrid), all passing with zero regressions

## Task Commits

1. **Task 1: Update search_codebase tool** - `2e940ab` (feat)
2. **Task 2: Update search_codebase_hybrid tool** - `3b93308` (feat)
3. **Task 3: Verify no regressions** - `8bcae0b` (chore)

## Files Created/Modified

- `packages/mcp-server/src/tools/search-codebase.ts` - Added searchWithFallback to Engine type, fallback param, structured envelope
- `packages/mcp-server/src/tools/search-codebase-hybrid.ts` - Added searchWithFallback to HybridEngine type, fallback logic
- `packages/mcp-server/src/tools/__tests__/search-codebase-fallback.test.ts` - 6 TDD tests for search_codebase fallback
- `packages/mcp-server/src/tools/__tests__/search-codebase-hybrid-fallback.test.ts` - 4 TDD tests for hybrid fallback

## Decisions Made

- Suggestions are stripped of score field before structuredContent (D-11 compliance)
- HybridEngine.searchWithFallback is optional; existing behavior preserved for backward compat
- `fallback:false` skips searchWithFallback entirely, returns raw empty result

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 23 complete: fallback engine (Plan 01) + MCP wiring (Plan 02) both done
- Ready for benchmark validation to verify Actionability score improvement on negative queries

---

_Phase: 23-zero-result-fallback-search_
_Completed: 2026-04-28_
