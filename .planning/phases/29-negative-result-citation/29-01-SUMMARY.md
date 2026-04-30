---
phase: 29-negative-result-citation
plan: '01'
subsystem: retrieval
tags: [qdrant, semantic-search, fallback, synonym-expansion, typescript]

requires: []
provides:
  - getRelatedTerms() function with synonym map for 5 technology concepts
  - FallbackSearchResult.relatedResults and related_query fields
  - Related-concept search step in searchWithFallback zero-result path
affects: [mcp-server, dashboard]

tech-stack:
  added: []
  patterns:
    - 'Synonym expansion: check query for known technology keys, return related terms'
    - 'Related-concept search only activates when ALL prior fallback modes return zero results'

key-files:
  created:
    - packages/retrieval/src/search-synonyms.ts
    - packages/retrieval/src/__tests__/search-engine-related.test.ts
  modified:
    - packages/retrieval/src/types.ts
    - packages/retrieval/src/search-engine.ts
    - packages/retrieval/src/index.ts

key-decisions:
  - 'Vector-based mock dispatch in tests: mockEmbed returns different vectors per query text so vectorStore.search can distinguish related vs primary search calls'
  - 'Step 4 added in both keyword-present (empty results) and keyword-absent paths to ensure expansion runs whenever all fallbacks return zero'

patterns-established:
  - 'Related-concept expansion: getRelatedTerms(query) → iterate terms → this.search({...query, text: term}) → first non-empty wins, capped at 3'

requirements-completed: []

duration: 3min
completed: '2026-04-30'
---

# Phase 29 Plan 01: Negative Result Citation - Synonym Expansion Summary

**Related-concept expansion in searchWithFallback: synonym map for 5 tech concepts surfaces real indexed chunks when query targets non-existent feature**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-30T14:32:49Z
- **Completed:** 2026-04-30T14:36:08Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Created `search-synonyms.ts` with `getRelatedTerms()` and a 5-key SYNONYM_MAP (websocket, grpc, rest_api, cache, graphql)
- Extended `FallbackSearchResult` with optional `relatedResults?: RetrievalResult[]` and `related_query?: string` fields
- Integrated Step 4 related-concept expansion into `searchWithFallback` — activates only when primary + hybrid + keyword all return zero results
- All 117 existing tests pass, 8 new tests added

## Task Commits

1. **RED: Failing tests** - `ffbb3f6` (test)
2. **Task 1: synonym map + type extension** - `e27a743` (feat)
3. **Task 2: searchWithFallback integration** - `dc2f0e7` (feat)

## Files Created/Modified

- `packages/retrieval/src/search-synonyms.ts` - getRelatedTerms() with SYNONYM_MAP
- `packages/retrieval/src/types.ts` - Extended FallbackSearchResult with relatedResults/related_query
- `packages/retrieval/src/search-engine.ts` - Step 4 expansion in two zero-result paths
- `packages/retrieval/src/index.ts` - Exports getRelatedTerms
- `packages/retrieval/src/__tests__/search-engine-related.test.ts` - Tests for synonym expansion and relatedResults

## Decisions Made

- Used vector-based dispatch in test mocks (mockEmbed returns different vectors per text) rather than mocking at SearchEngine.search level — keeps tests black-box to the engine's internal embedding flow
- Added Step 4 in both the "keyword available but returns empty" path and the "no keyword support" path so expansion runs regardless of whether the vectorStore implements searchKeyword

## Deviations from Plan

None - plan executed exactly as written. The test mock approach required fixing (plan described mock using `{ text }` destructuring but vectorStore.search receives `(vector, options)`) — corrected during GREEN phase.

## Issues Encountered

None

## Next Phase Readiness

- relatedResults field is available in FallbackSearchResult for MCP tools to surface to the model
- Plan 29-02 can build on this to inject related results into MCP search response formatting

---

_Phase: 29-negative-result-citation_
_Completed: 2026-04-30_
