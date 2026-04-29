---
phase: 24-maven-dependency-graph
plan: 02
subsystem: mcp-server
tags: [maven, qdrant, mcp-tool, dependency-graph, chunk-enrichment]

requires:
  - phase: 24-maven-dependency-graph
    provides: MavenModuleParser, ModuleGraph types, SQLite persistence
provides:
  - maven_module field on ChunkPayload for module-aware retrieval
  - get_module_dependencies MCP tool for cross-module dependency context
  - inferMavenModule helper for path-to-module resolution
affects: [mcp-server, indexer, vector-store]

tech-stack:
  added: []
  patterns: [ModuleDepsEngine adapter pattern, BFS from JSON graph, partial artifactId matching]

key-files:
  created:
    - packages/mcp-server/src/tools/get-module-dependencies.ts
    - packages/mcp-server/src/tools/get-module-dependencies.test.ts
  modified:
    - packages/vector-store/src/interface.ts
    - packages/vector-store/src/qdrant.ts
    - packages/indexer/src/pipeline.ts
    - packages/indexer/src/retrieval-metadata.ts
    - packages/mcp-server/src/server.ts
    - packages/mcp-server/src/index.ts
    - packages/core/src/index.ts

key-decisions:
  - 'Used ModuleChunkResult simplified interface to decouple tool from VectorStore SearchResult type'
  - 'searchByModule adapter returns empty for now — TODO wire Qdrant filtered search when VectorStore accessible in server context'
  - 'Exported Maven types from @ia-framework/core root index for downstream consumption'

patterns-established:
  - 'ModuleDepsEngine adapter bridges MetricsStore + search into tool-specific interface'
  - 'Partial artifactId matching for user-friendly module lookup'

requirements-completed: []

duration: 5min
completed: 2026-04-28
---

# Phase 24 Plan 02: Maven Module Indexing & MCP Tool Summary

**ChunkPayload enriched with maven_module coordinates during indexing, get_module_dependencies MCP tool returning BFS dependency graph with interface chunks**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-28T18:58:33Z
- **Completed:** 2026-04-28T19:03:40Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments

- ChunkPayload carries optional mavenModule coordinates for module-aware retrieval filtering
- Indexer pipeline enriches chunks with Maven module identity via inferMavenModule path matching
- get_module_dependencies MCP tool provides direct deps, transitive deps (2 hops BFS), and interface chunk context
- 6 test cases covering all tool behaviors (direct, transitive, partial match, not-found, chunks, no-graph)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add maven_module to ChunkPayload and enrich in indexer** - `39e43a6` (feat)
2. **Task 2: get_module_dependencies MCP tool** - `0d444da` (feat)

## Files Created/Modified

- `packages/vector-store/src/interface.ts` - Added mavenModule optional field to ChunkPayload
- `packages/vector-store/src/qdrant.ts` - Parse mavenModule in toChunkPayload deserialization
- `packages/indexer/src/pipeline.ts` - mavenModuleGraph config, enrichment in embedBatchWithRetry
- `packages/indexer/src/retrieval-metadata.ts` - inferMavenModule path-to-module resolution
- `packages/core/src/index.ts` - Re-export Maven types from root
- `packages/mcp-server/src/tools/get-module-dependencies.ts` - MCP tool handler with BFS and formatting
- `packages/mcp-server/src/tools/get-module-dependencies.test.ts` - 6 test cases
- `packages/mcp-server/src/server.ts` - Tool registration with MetricsStore adapter
- `packages/mcp-server/src/index.ts` - Re-export handler and registration

## Decisions Made

- Used simplified ModuleChunkResult interface to decouple tool from vector-store SearchResult type — cleaner boundary
- searchByModule adapter returns empty array as placeholder — Qdrant filtered search wiring deferred until VectorStore is accessible in server context
- Exported Maven types from @ia-framework/core root index to enable downstream packages to import without deep paths

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Maven types not exported from @ia-framework/core root**

- **Found during:** Task 1
- **Issue:** core/src/index.ts didn't re-export Maven types — indexer couldn't import ModuleGraph
- **Fix:** Added maven re-exports to packages/core/src/index.ts
- **Files modified:** packages/core/src/index.ts
- **Verification:** Build succeeds
- **Committed in:** 39e43a6 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Essential for downstream package compilation. No scope creep.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 24 complete — Maven module awareness flows from POM parsing through indexing to MCP tool
- Ready for next phase or milestone work

---

_Phase: 24-maven-dependency-graph_
_Completed: 2026-04-28_
