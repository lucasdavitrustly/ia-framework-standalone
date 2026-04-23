---
phase: 19-baseline-score-filtering
plan: 01
subsystem: retrieval
tags: [search, qdrant, rrf, score-threshold, hybrid-search, mcp]

requires:
  - phase: 15-multi-collection-search
    provides: MultiCollectionSearchEngine with RRF merge
  - phase: 18-score-bucketing
    provides: RRF rank-based scoring awareness

provides:
  - Mode-aware score threshold defaults (dense=0.3, hybrid/RRF=undefined)
  - MultiCollectionSearchEngine strips scoreThreshold from overFetchQuery
  - MCP search_codebase tool delegates threshold to engine (no hardcoded 0.3)
  - User can still override via explicit score_threshold param

affects:
  - mcp-server
  - retrieval
  - search quality (P0 fix: hybrid search now returns results)

tech-stack:
  added: []
  patterns:
    - 'Dense search: 0.3 cosine threshold default'
    - 'Hybrid/RRF search: no threshold (rank-based scores ~0.01-0.03)'
    - 'MCP tools: delegate threshold selection to engine layer'

key-files:
  created:
    - packages/retrieval/src/__tests__/search-engine-threshold.test.ts
    - packages/mcp-server/src/tools/__tests__/search-codebase-threshold.test.ts
  modified:
    - packages/retrieval/src/search-engine.ts
    - packages/retrieval/src/multi-collection-search-engine.ts
    - packages/mcp-server/src/tools/search-codebase.ts
    - packages/retrieval/src/multi-collection-search-engine.test.ts

key-decisions:
  - 'Dense mode uses 0.3 cosine threshold (was erroneously 0.5 in search-engine.ts)'
  - 'MultiCollectionSearchEngine.search() and searchHybrid() both strip scoreThreshold=undefined from overFetchQuery to prevent cosine filtering before RRF merge'
  - 'MCP search_codebase tool removed ?? 0.3 fallback; engine now owns threshold decisions'
  - 'Updated existing multi-collection test that asserted old (buggy) pass-through behavior'

patterns-established:
  - 'Engine layer owns default threshold selection; tool layer only passes user-explicit overrides'
  - 'RRF contexts: always undefined scoreThreshold to child engines'

requirements-completed:
  - FILT-01
  - BASE-01

duration: 4min
completed: 2026-04-22
---

# Phase 19 Plan 01: Baseline Score Filtering Summary

**P0 bug fix: hybrid and multi-collection RRF search modes no longer silently drop all results due to 0.3 cosine threshold applied to rank-based RRF scores (~0.01-0.03)**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-22T23:20:59Z
- **Completed:** 2026-04-22T23:24:32Z
- **Tasks:** 1 (TDD: RED → GREEN)
- **Files modified:** 6

## Accomplishments

- Dense search correctly uses 0.3 cosine threshold (fixed from erroneous 0.5)
- MultiCollectionSearchEngine strips scoreThreshold before RRF merge so rank-based scores aren't compared against cosine thresholds
- MCP `search_codebase` tool removed hardcoded `?? 0.3` fallback — engine now owns threshold defaults
- `search_codebase_hybrid` already correct (no threshold) — confirmed with new test

## Task Commits

1. **Task 1 RED: Failing tests** - `744d1f6` (test)
2. **Task 1 GREEN: Implementation** - `94b1c8d` (feat)

## Files Created/Modified

- `packages/retrieval/src/search-engine.ts` - Changed default threshold from 0.5 → 0.3
- `packages/retrieval/src/multi-collection-search-engine.ts` - Strip scoreThreshold in search() and searchHybrid()
- `packages/mcp-server/src/tools/search-codebase.ts` - Remove `?? 0.3` fallback; allow `undefined`
- `packages/retrieval/src/__tests__/search-engine-threshold.test.ts` - New tests for dense vs hybrid threshold behavior
- `packages/mcp-server/src/tools/__tests__/search-codebase-threshold.test.ts` - New tests for MCP tool threshold delegation
- `packages/retrieval/src/multi-collection-search-engine.test.ts` - Updated Test 4 to assert correct (new) behavior

## Decisions Made

- Dense mode keeps 0.3 as the right cosine similarity threshold for filtering low-quality results
- RRF contexts always receive `scoreThreshold: undefined` — post-RRF scores are rank-based and incomparable to cosine thresholds
- Engine layer is authoritative for threshold defaults; MCP tool layer only passes through user-explicit values

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Existing multi-collection test asserted old buggy pass-through behavior**

- **Found during:** GREEN phase (test run)
- **Issue:** `multi-collection-search-engine.test.ts` Test 4 asserted scoreThreshold=0.7 was passed to child engines — this was the bug being fixed
- **Fix:** Updated test description and assertions to match correct behavior (undefined passed to child engines)
- **Files modified:** packages/retrieval/src/multi-collection-search-engine.test.ts
- **Verification:** All 60 retrieval tests pass
- **Committed in:** 94b1c8d

**2. [Rule 1 - Bug] Empty suite in threshold test caused Vitest failure**

- **Found during:** GREEN phase
- **Issue:** `describe('MultiCollectionSearchEngine score threshold behavior', () => {})` with no tests caused "No test found in suite" error
- **Fix:** Added a placeholder test with comment pointing to the covering test file
- **Files modified:** packages/retrieval/src/**tests**/search-engine-threshold.test.ts
- **Committed in:** 94b1c8d

**3. [Rule 1 - Bug] exactOptionalPropertyTypes TypeScript error after removing ?? 0.3**

- **Found during:** GREEN phase implementation
- **Issue:** `scoreThreshold: input.score_threshold` (which can be `undefined`) was incompatible with `scoreThreshold?: number` under `exactOptionalPropertyTypes: true`
- **Fix:** Updated Engine type signature to `scoreThreshold?: number | undefined`
- **Files modified:** packages/mcp-server/src/tools/search-codebase.ts
- **Committed in:** 94b1c8d

---

**Total deviations:** 3 auto-fixed (3 bugs discovered during implementation)
**Impact on plan:** All fixes necessary for correctness. No scope creep.

## Issues Encountered

None beyond the auto-fixed deviations above.

## Next Phase Readiness

- Hybrid search mode now returns results (P0 fix complete)
- Dense search threshold: 0.3 (correct cosine baseline)
- Ready for Phase 19 Plan 02 (next plan in baseline-score-filtering phase)

---

_Phase: 19-baseline-score-filtering_
_Completed: 2026-04-22_
