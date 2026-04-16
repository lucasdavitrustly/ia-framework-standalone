---
phase: 13-pipeline-refactoring-parallel-embedding
plan: 01
subsystem: indexer
tags: [chunking-strategy, embedding-concurrency, indexing-pipeline, tree-sitter, typescript]

# Dependency graph
requires:
  - phase: 12-llm-chunking-spike
    provides: LLM chunking spike results and GO verdict for llama3.2
provides:
  - ChunkingStrategy interface for pluggable chunking (ast, llm)
  - AstChunkingStrategy wrapping existing parseFile()
  - embeddingConcurrency config field (schema + types)
  - IndexingProgress batch fields (batchesTotal, batchesCompleted)
affects: [13-02-PLAN, 13-03-PLAN, 14-llm-chunking]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'Strategy pattern for chunking: ChunkingStrategy interface with chunk() method'
    - 'Spread-based optional property forwarding to avoid exactOptionalPropertyTypes issues'

key-files:
  created:
    - packages/indexer/src/strategies/types.ts
    - packages/indexer/src/strategies/ast-strategy.ts
    - packages/indexer/src/strategies/index.ts
    - packages/indexer/src/strategies/ast-strategy.test.ts
    - packages/core/src/config/schema.test.ts
  modified:
    - packages/core/src/config/schema.ts
    - packages/core/src/types/index.ts
    - packages/indexer/src/pipeline.ts
    - packages/indexer/src/index.ts

key-decisions:
  - 'Used spread-based conditional property forwarding to handle exactOptionalPropertyTypes between ChunkingConfig and ChunkerConfig'

patterns-established:
  - 'Strategy pattern: ChunkingStrategy interface with name + chunk() for pluggable chunking'
  - 'Barrel re-export: strategies/index.ts re-exported from package index'

requirements-completed: [INDX-17, INDX-16]

# Metrics
duration: 7min
completed: 2026-04-10
---

# Phase 13 Plan 01: Type Foundation Summary

**ChunkingStrategy interface with AstChunkingStrategy wrapper, embeddingConcurrency config, and batch progress fields for pipeline refactoring**

## Performance

- **Duration:** 7 min
- **Started:** 2026-04-10T17:41:06Z
- **Completed:** 2026-04-10T17:48:44Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments

- ChunkingStrategy interface with pluggable chunk() method for ast/llm strategies
- AstChunkingStrategy wrapping existing parseFile() — zero behavior change, same output
- embeddingConcurrency field in both Zod schema and TypeScript types (optional, positive integer)
- IndexingProgress extended with batchesTotal and batchesCompleted (backward compatible)
- Full TDD: 8 tests written before implementation, all passing

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend config schema and progress types** (TDD)
   - RED: `9686599` (test) — failing tests for embeddingConcurrency validation
   - GREEN: `7cbe658` (feat) — embeddingConcurrency config + batch progress fields

2. **Task 2: Create ChunkingStrategy interface and AstChunkingStrategy** (TDD)
   - RED: `3fdc90d` (test) — failing tests for AstChunkingStrategy
   - GREEN: `bb07c49` (feat) — ChunkingStrategy interface + AstChunkingStrategy implementation

## Files Created/Modified

- `packages/core/src/config/schema.ts` — Added embeddingConcurrency to IndexingConfigSchema
- `packages/core/src/config/schema.test.ts` — 4 tests for embeddingConcurrency validation
- `packages/core/src/types/index.ts` — Added embeddingConcurrency to IndexingConfig interface
- `packages/indexer/src/pipeline.ts` — Added batchesTotal/batchesCompleted to IndexingProgress, embeddingConcurrency to IndexingConfig
- `packages/indexer/src/strategies/types.ts` — ChunkingStrategy and ChunkingConfig interfaces
- `packages/indexer/src/strategies/ast-strategy.ts` — AstChunkingStrategy class wrapping parseFile()
- `packages/indexer/src/strategies/ast-strategy.test.ts` — 4 tests for AstChunkingStrategy
- `packages/indexer/src/strategies/index.ts` — Barrel export for strategies
- `packages/indexer/src/index.ts` — Re-export AstChunkingStrategy and types

## Decisions Made

- Used spread-based conditional property forwarding (`...(config.maxChunkLines !== undefined && { maxChunkLines: config.maxChunkLines })`) to avoid `exactOptionalPropertyTypes` mismatch between ChunkingConfig (optional with undefined) and ChunkerConfig (optional without explicit undefined)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Pre-existing typecheck failure in `pipeline.test.ts` — mock missing `searchHybrid` method required by `VectorStore` interface. Not caused by this plan; logged as out-of-scope.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- ChunkingStrategy interface ready for Plan 02 (pipeline refactoring with parallel embedding)
- embeddingConcurrency config ready for Plan 02 to use in p-queue concurrency control
- Batch progress fields ready for Plan 02 to populate during parallel embedding
- All exports available from @ia-framework/indexer for downstream consumers

---

## Self-Check: PASSED

- All 6 created files verified on disk
- All 4 task commits verified in git history (9686599, 7cbe658, 3fdc90d, bb07c49)

---

_Phase: 13-pipeline-refactoring-parallel-embedding_
_Completed: 2026-04-10_
