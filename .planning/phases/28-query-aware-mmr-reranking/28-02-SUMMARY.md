---
phase: 28-query-aware-mmr-reranking
plan: '02'
subsystem: retrieval
tags: [mmr, search-engine, reranking, diversity, retrieval, typescript]

requires:
  - phase: 28-query-aware-mmr-reranking
    provides: mmrRerank, classifyQueryLambda from plan 01

provides:
  - MMR integrated into SearchEngine.search() and searchHybrid()
  - mmrEnabled/mmrLambda/mmrCandidateMultiplier config options in SearchEngineConfig
  - mmrRerank and helpers exported from @ia-framework/retrieval package

affects:
  - packages/mcp-server (uses @ia-framework/retrieval types)
  - any SearchEngine consumers

tech-stack:
  added: []
  patterns:
    - 'MMR-first pipeline: diversity (raw scores) → domain bonuses (rerankResults)'
    - 'Over-fetch by mmrCandidateMultiplier (default 3x) before MMR selection'
    - 'Query-type-aware lambda: classifyQueryLambda → 0.5 architecture, 0.8 lookup'

key-files:
  created: []
  modified:
    - packages/retrieval/src/types.ts
    - packages/retrieval/src/search-engine.ts
    - packages/retrieval/src/index.ts
    - packages/retrieval/src/search-engine.test.ts

key-decisions:
  - 'MMR runs first on raw scores, then rerankResults applies domain bonuses — preserves both diversity and symbol-match priority'
  - 'Over-fetch multiplier default 3x: search fetches limit*3 candidates before MMR selects limit'
  - 'MCP server pre-existing type errors in test files are out of scope (unrelated to retrieval changes)'

requirements-completed: []

duration: 22min
completed: 2026-04-30
---

# Phase 28 Plan 02: MMR Integration into SearchEngine Summary

**MMR re-ranking wired into SearchEngine.search() and searchHybrid() with query-type-aware λ, 3x over-fetch, and configurable disable flag**

## Performance

- **Duration:** ~22 min
- **Started:** 2026-04-30T13:54:00Z
- **Completed:** 2026-04-30T14:16:47Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- MMR diversity re-ranking applied by default in both search() and searchHybrid()
- Architecture queries (λ=0.5) pull results from multiple files instead of returning near-identical top chunks
- Specific-lookup queries (λ=0.8) preserve the highest-relevance result at position 0
- SearchEngineConfig extended with `mmrEnabled`, `mmrLambda`, `mmrCandidateMultiplier`
- All MMR helpers exported from `@ia-framework/retrieval` package

## Task Commits

1. **Task 1: Extend SearchEngineConfig and integrate MMR into search pipeline** - `726d452` (feat)
2. **Task 2: Add integration tests for MMR in SearchEngine** - `ccd7af8` (test)

## Files Created/Modified

- `packages/retrieval/src/types.ts` — Added mmrEnabled, mmrLambda, mmrCandidateMultiplier to SearchEngineConfig
- `packages/retrieval/src/search-engine.ts` — MMR integrated into search() and searchHybrid(), over-fetch 3x
- `packages/retrieval/src/index.ts` — Export mmrRerank, classifyQueryLambda, jaccardSimilarity, cosineSimilarity, MmrOptions
- `packages/retrieval/src/search-engine.test.ts` — 4 new MMR integration tests + limit assertion update

## Decisions Made

- **MMR-first pipeline**: Run MMR on raw scores first (diversity), then rerankResults for domain bonuses (symbol/layer hints). This ensures rerankResults can still promote exact symbol matches after MMR diversifies.
- **Over-fetch default 3x**: `limit * (mmrCandidateMultiplier ?? 3)` passed to both vectorStore.search and vectorStore.searchHybrid.
- **Updated existing test**: `searchHybrid() calls vectorStore.searchHybrid() with ... limit` now expects `limit * 3` (15 for limit=5) — this is correct new behavior per D-06.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed operation order: MMR was overriding rerankResults symbol bonuses**

- **Found during:** Task 1 (verification — 2 existing tests failed)
- **Issue:** Plan specified `rerankResults → MMR`, but this caused MMR (using raw `.score`) to undo rerankResults' symbol bonuses. The test `searchHybrid() reranks exact symbol matches` failed because GenericService (score 0.95) beat PaymentController (score 0.82 + rerankResults bonus) under MMR's raw score evaluation.
- **Fix:** Changed pipeline to `MMR first (raw scores) → rerankResults (domain bonuses)`. This preserves both diversity and domain-awareness.
- **Files modified:** packages/retrieval/src/search-engine.ts
- **Verification:** All 22 existing tests pass; new MMR tests also pass.
- **Committed in:** 726d452 (Task 1 commit)

**2. [Rule 1 - Bug] Fixed limit expectation in existing searchHybrid test**

- **Found during:** Task 1 verification
- **Issue:** Test expected `args.limit` to be 5, but over-fetching now passes `5 * 3 = 15`.
- **Fix:** Updated test assertion to `toBe(15)` with explanatory comment.
- **Files modified:** packages/retrieval/src/search-engine.test.ts
- **Verification:** Test passes.
- **Committed in:** 726d452 (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs — operation order and test expectation)
**Impact on plan:** Both fixes essential for correctness. The MMR-first pipeline is semantically superior to the plan's proposed order.

## Issues Encountered

- MCP server tsconfig type errors in test files (pre-existing, unrelated to retrieval changes — same 36 error lines before and after this plan's changes).

## Next Phase Readiness

- MMR integration complete for Phase 28
- Ready for Phase 28-03 if planned, or phase complete

---

_Phase: 28-query-aware-mmr-reranking_
_Completed: 2026-04-30_
