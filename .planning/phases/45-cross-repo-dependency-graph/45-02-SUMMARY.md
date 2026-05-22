---
phase: 45-cross-repo-dependency-graph
plan: 02
subsystem: graph
tags: [cross-repo, dependency-graph, edge-builder, expansion, multi-hop]

requires:
  - phase: 45-cross-repo-dependency-graph
    provides: CrossRepoEdgeStore, resolveImportToRepo, expansionRepo field
provides:
  - buildCrossRepoEdges function (second pass edge builder)
  - Cross-repo aware expansion in search engine (expandHierarchy + multiHopExpand)
affects: [45-03]

tech-stack:
  added: []
  patterns: [async generator for chunk scrolling, cross-repo hop budget tracking]

key-files:
  created:
    - packages/core/src/graph/cross-repo-edge-builder.ts
    - packages/core/src/graph/cross-repo-edge-builder.test.ts
  modified:
    - packages/mcp-server/src/tools/search-codebase.ts
    - packages/retrieval/src/multi-hop.ts
    - packages/core/src/index.ts

key-decisions:
  - 'ChunkForEdgeBuilding minimal interface avoids cross-package dependency on @ia-framework/retrieval'
  - 'Cross-repo expansion costs 1 hop per boundary crossing (D-04)'

patterns-established:
  - 'EdgeBuilderEngine uses AsyncIterable for paginated chunk scrolling'
  - 'Cross-repo results tagged with both expansionSource and expansionRepo'

requirements-completed: [SRCH-02]

duration: 5min
completed: 2026-05-22
---

# Phase 45 Plan 02: Cross-Repo Edge Builder & Expansion Summary

**Second-pass edge builder resolves imports across repos, expansion engine follows pre-computed edges costing 1 hop per crossing**

## Performance

- **Duration:** 5 min
- **Started:** 2026-05-22T19:10:19Z
- **Completed:** 2026-05-22T19:15:25Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- buildCrossRepoEdges function iterates chunks, resolves imports via prefix matching, stores edges
- Search engine expandHierarchy follows cross-repo edges with hop budget tracking
- multiHopExpand engine extended with scrollByNameInRepo for cross-repo symbol lookup

## Task Commits

Each task was committed atomically:

1. **Task 1: Cross-repo edge builder** - `3b59781` (feat)
2. **Task 2: Cross-repo expansion in search engine** - `8969cca` (feat)

## Files Created/Modified

- `packages/core/src/graph/cross-repo-edge-builder.ts` - Second-pass edge builder with AsyncIterable scrolling
- `packages/core/src/graph/cross-repo-edge-builder.test.ts` - 5 tests covering edge creation, rebuild, skip behavior
- `packages/mcp-server/src/tools/search-codebase.ts` - Engine type extended + expandHierarchy cross-repo support
- `packages/retrieval/src/multi-hop.ts` - MultiHopEngine extended with scrollByNameInRepo
- `packages/core/src/index.ts` - Barrel exports for edge builder

## Decisions Made

- Created ChunkForEdgeBuilding minimal interface to avoid adding @ia-framework/retrieval as dependency of core package
- Cross-repo expansion costs 1 hop per boundary crossing per D-04 design decision

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## Next Phase Readiness

- Ready for 45-03 which will wire the edge builder into the indexing pipeline and add integration tests

---

_Phase: 45-cross-repo-dependency-graph_
_Completed: 2026-05-22_
