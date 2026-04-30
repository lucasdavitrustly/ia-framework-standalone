---
phase: 29-negative-result-citation
plan: 02
subsystem: mcp-server
tags: [mcp, search, fallback, rag, retrieval, related-results]

requires:
  - phase: 29-negative-result-citation
    provides: 'FallbackSearchResult.relatedResults field and searchWithFallback synonym expansion (plan 01)'

provides:
  - "search_codebase tool surfaces relatedResults as 'No results for X. Related communication mechanisms found:'"
  - 'search_codebase_hybrid tool surfaces relatedResults identically'
  - 'structuredContent includes related_results array for programmatic consumers'

affects: [mcp-server, retrieval]

tech-stack:
  added: []
  patterns:
    - 'relatedResults check before suggestions check in zero-result path'
    - "Descriptive fallback message: 'No results for X. Related communication mechanisms found:'"

key-files:
  created:
    - packages/mcp-server/src/tools/__tests__/search-codebase-related.test.ts
  modified:
    - packages/mcp-server/src/tools/search-codebase.ts
    - packages/mcp-server/src/tools/search-codebase-hybrid.ts

key-decisions:
  - 'relatedResults check placed BEFORE suggestions check so synonym expansion takes priority'
  - 'Same formatting pattern applied to both search_codebase and search_codebase_hybrid for consistency'
  - "retrieval package dist rebuilt as part of plan (29-01 added types but didn't rebuild)"

requirements-completed: []

duration: 2min
completed: 2026-04-30
---

# Phase 29 Plan 02: Negative Result Citation MCP Formatting Summary

**Both search_codebase and search_codebase_hybrid tools now surface synonym-expanded related results with descriptive 'Related communication mechanisms found:' message in zero-result path**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-30T14:38:01Z
- **Completed:** 2026-04-30T14:40:10Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- `search_codebase` zero-result path now formats `relatedResults` with descriptive label and per-item path+snippet
- `search_codebase_hybrid` applies identical pattern for consistent model experience
- `structuredContent` exposes `related_results`, `related_query`, `fallback_mode` for downstream programmatic consumers
- 5 new TDD tests added (RED→GREEN cycle), all 100 mcp-server tests pass

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: failing tests for relatedResults** - `b66d4a6` (test)
2. **Task 1 GREEN: implement relatedResults in search_codebase** - `c91d0e4` (feat)
3. **Task 2: implement relatedResults in search_codebase_hybrid** - `4702a6d` (feat)

## Files Created/Modified

- `packages/mcp-server/src/tools/__tests__/search-codebase-related.test.ts` - 5 TDD tests for relatedResults formatting behavior
- `packages/mcp-server/src/tools/search-codebase.ts` - Added relatedResults check in `buildSearchResponse` before suggestions path
- `packages/mcp-server/src/tools/search-codebase-hybrid.ts` - Added relatedResults check in `searchCodebaseHybridHandler` before suggestions path

## Decisions Made

- relatedResults check placed before suggestions check so the more informative synonym-expanded results surface first
- Identical formatting across both search tools ensures consistent model experience regardless of which tool is called

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Built retrieval package before tests**

- **Found during:** Task 1 RED (test writing)
- **Issue:** `packages/retrieval/dist/index.d.ts` didn't include `relatedResults` (added in plan 29-01 but dist not rebuilt), causing TypeScript errors in test file
- **Fix:** Ran `pnpm --filter @ia-framework/retrieval run build` to regenerate dist with updated types
- **Files modified:** packages/retrieval/dist/ (gitignored, not committed)
- **Verification:** TypeScript resolved `relatedResults` on `FallbackSearchResult` after rebuild
- **Committed in:** N/A (dist is gitignored)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary pre-step; no scope creep.

## Issues Encountered

- Pre-existing TypeScript errors in `search-codebase-hybrid-templates.test.ts` and `search-codebase-templates.test.ts` (type narrowing for `content[0].text`). These are out-of-scope and not introduced by this plan.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Both MCP tool handlers now complete the D-05 negative result citation feature end-to-end
- Phase 29 complete: retrieval layer computes relatedResults (plan 01), MCP layer surfaces them (plan 02)

---

_Phase: 29-negative-result-citation_
_Completed: 2026-04-30_
