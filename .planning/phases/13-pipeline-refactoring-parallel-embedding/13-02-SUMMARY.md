---
phase: 13-pipeline-refactoring-parallel-embedding
plan: 02
subsystem: indexer
tags: [p-queue, parallel-embedding, retry, abort, chunking-strategy]
dependency-graph:
  requires: [13-01]
  provides: [parallel-embedding-pipeline, retry-logic, abort-support, strategy-delegation]
  affects: [packages/indexer]
tech-stack:
  added: [p-queue@^9.1.2]
  patterns:
    [p-queue-concurrency, retry-once-skip, abort-via-queue-clear, strategy-pattern-delegation]
key-files:
  created: []
  modified:
    - packages/indexer/src/pipeline.ts
    - packages/indexer/src/pipeline.test.ts
    - packages/indexer/package.json
    - pnpm-lock.yaml
decisions:
  - D-01: 'Used p-queue for concurrent batch embedding instead of manual Promise pool'
  - D-02: 'Retry-once pattern (maxRetries=1) with skip-on-exhaustion for resilient batch processing'
  - D-03: 'Abort integration via queue.clear() — cancels queued tasks, in-flight finish naturally'
  - D-04: 'Default concurrency: ollama→3 (GPU VRAM limited), openai→10 (cloud API higher limits)'
  - D-05: 'Context sources not refactored to p-queue — sequential approach retained per plan spec'
metrics:
  duration: '7m 26s'
  completed: '2026-04-10T17:59:00Z'
  tasks: 2
  files-modified: 4
---

# Phase 13 Plan 02: Parallel Embedding Pipeline with p-queue Summary

**One-liner:** Refactored indexing pipeline to use p-queue for concurrent embedding batch processing with provider-aware defaults (ollama:3, openai:10), retry-once-then-skip resilience, abort signal support, and ChunkingStrategy delegation.

## Tasks Completed

### Task 1: Refactor pipeline.ts for parallel embedding (TDD)

**RED Phase** — Wrote 12 failing tests covering all parallel embedding behaviors:

- Concurrency limiting (max concurrent batches assertion)
- Provider-aware defaults (ollama→3, openai→10)
- Config override (embeddingConcurrency overrides provider default)
- Promise.all for text+code embeddings per batch
- Retry-once on transient failure
- Skip-after-retry-failure with skippedChunks tracking
- Abort signal cancels queued tasks
- ChunkingStrategy delegation and default fallback
- Batch progress (batchesTotal/batchesCompleted)
- skippedChunks in return type

**GREEN Phase** — Implemented all pipeline changes:

- Added `p-queue@^9.1.2` dependency (ESM-native)
- Added `getDefaultConcurrency()` helper with provider-name switch
- Added `embedBatchWithRetry()` with retry-once logic and `Promise.all` for text+code
- Refactored `run()` to build batches and process via `new PQueue({ concurrency })`
- Added abort signal integration: `signal.addEventListener('abort', () => queue.clear())`
- Changed return type from `{ filesIndexed, chunksIndexed }` to `{ filesIndexed, chunksIndexed, skippedChunks }`
- Replaced direct `parseFile()` call with `strategy.chunk()` delegation
- Removed unused `parseFile` import

**REFACTOR Phase** — No cleanup needed; code was clean after GREEN.

### Task 2: Finalize pipeline tests

All 12 new tests from the RED phase were already comprehensive and correct. The searchHybrid mock fix (pre-existing LSP error from Plan 01) was applied during RED phase. All 45 tests pass (37 existing + 8 new parallel embedding tests, but the test file actually has 12 new test cases in the "parallel embedding" describe block plus existing tests totaling 45).

## Commits

| Commit    | Type | Message                                                                                        |
| --------- | ---- | ---------------------------------------------------------------------------------------------- |
| `81f63f2` | test | `test(13-02): add failing tests for parallel embedding, retry, abort, and strategy delegation` |
| `9742f66` | feat | `feat(13-02): implement parallel embedding pipeline with p-queue`                              |

## Verification Results

- **Tests:** 45/45 passing (3 test files: pipeline.test.ts, chunk-description.test.ts, ast-strategy.test.ts)
- **Typecheck:** 24/24 workspace tasks pass (all packages)
- **p-queue:** Installed and imported correctly (ESM-native, no build issues)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed missing searchHybrid mock in makeMockVectorStore**

- **Found during:** Task 1 RED phase
- **Issue:** Pre-existing LSP error — VectorStore interface requires `searchHybrid` but mock didn't include it (noted in Plan 01 summary)
- **Fix:** Added `searchHybrid: vi.fn().mockResolvedValue([])` to `makeMockVectorStore()`
- **Files modified:** packages/indexer/src/pipeline.test.ts
- **Commit:** 81f63f2

**2. [Rule 3 - Blocking] Removed unused parseFile import**

- **Found during:** Task 1 GREEN phase
- **Issue:** After switching to `strategy.chunk()`, the direct `parseFile` import became unused, causing TypeScript compiler error
- **Fix:** Removed `parseFile` from imports
- **Files modified:** packages/indexer/src/pipeline.ts
- **Commit:** 9742f66

## Architecture Notes

- **p-queue vs manual Promise pool:** p-queue provides battle-tested concurrency control with `queue.clear()` for abort support. Much simpler than implementing custom semaphore.
- **Context sources not refactored:** The plan spec notes that context source embedding still uses the old sequential approach. This is intentional — context sources are typically small (DB schema, docs) and don't benefit from parallelization.
- **Return type change:** Adding `skippedChunks` to the return type is backward-compatible since it's a new field. Consumers that destructure `{ filesIndexed, chunksIndexed }` continue to work.

## Known Stubs

None — all functionality is fully wired and operational.

## Self-Check: PASSED

- All key files exist (pipeline.ts, pipeline.test.ts, package.json, pnpm-lock.yaml, 13-02-SUMMARY.md)
- All commits verified (81f63f2, 9742f66)
- 45/45 tests pass
- 24/24 typecheck tasks pass
