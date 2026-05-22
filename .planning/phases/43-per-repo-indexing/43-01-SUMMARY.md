---
phase: 43-per-repo-indexing
plan: 01
subsystem: indexing
tags: [qdrant, vector-store, incremental-indexing, multi-repo]

requires:
  - phase: 42-config-repo-registry
    provides: RepoRegistry config with repo names
provides:
  - ChunkPayload.repoId field for per-repo filtering
  - IndexingConfig.repoId for pipeline configuration
  - Per-repo incremental state keying
affects: [43-02, mcp-server, retrieval]

tech-stack:
  added: []
  patterns: [composite-key-for-state, optional-spread-pattern]

key-files:
  created:
    - packages/indexer/src/__tests__/repo-id.test.ts
  modified:
    - packages/vector-store/src/interface.ts
    - packages/indexer/src/pipeline.ts
    - packages/indexer/src/incremental.ts

key-decisions:
  - 'repoId is optional (undefined) for backward compatibility with single-repo setups'
  - 'Composite key format: collectionName:repoId for incremental state map'

patterns-established:
  - 'Optional spread pattern: ...(repoId ? { repoId } : {}) for conditional payload fields'

requirements-completed: [INDX-01]

duration: 2min
completed: 2026-05-22
---

# Phase 43 Plan 01: Per-Repo Indexing Foundation Summary

**Added repoId field to ChunkPayload/IndexingConfig and wired through pipeline with per-repo incremental state keying**

## Performance

- **Duration:** 2 min
- **Started:** 2026-05-22T13:22:05Z
- **Completed:** 2026-05-22T13:24:28Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- ChunkPayload interface now carries optional `repoId` for per-repo filtering in Qdrant
- IndexingPipeline propagates `config.repoId` into every chunk's payload
- Incremental state uses composite key `collection:repoId` enabling per-repo git tracking

## Task Commits

Each task was committed atomically:

1. **Task 1: Add repoId to ChunkPayload and IndexingConfig** - `4d449b9` (feat)
2. **Task 2: Wire repoId through pipeline and incremental state** - `cfe6c2c` (feat)

## Files Created/Modified

- `packages/vector-store/src/interface.ts` - Added repoId field to ChunkPayload
- `packages/indexer/src/pipeline.ts` - Added repoId to IndexingConfig, embedBatchWithRetry, payload construction
- `packages/indexer/src/incremental.ts` - Per-repo composite keying for all state functions
- `packages/indexer/src/__tests__/repo-id.test.ts` - Type-level tests for new fields

## Decisions Made

- repoId is optional (`string | undefined`) for backward compat — single-repo setups continue working unchanged
- Composite key format `collectionName:repoId` chosen for state map (simple, readable, no collisions)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- repoId field is in place; ready for 43-02 (per-repo filtering in MCP queries)
- All 124 existing tests pass

---

_Phase: 43-per-repo-indexing_
_Completed: 2026-05-22_
