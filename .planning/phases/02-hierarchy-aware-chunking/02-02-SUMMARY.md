---
phase: '02'
plan: '02'
subsystem: 'mcp-server, vector-store, indexer, retrieval'
tags: ['hierarchy', 'qdrant', 'chunking', 'search', 'tdd']
dependency-graph:
  requires: ['02-01']
  provides: ['HIER-02', 'HIER-04']
  affects:
    ['packages/vector-store', 'packages/indexer', 'packages/retrieval', 'packages/mcp-server']
tech-stack:
  added: []
  patterns:
    [
      'hierarchy expansion via scrollForHierarchy',
      'optional Engine method pattern',
      'TDD RED-GREEN cycle',
    ]
key-files:
  created:
    - packages/mcp-server/src/tools/search-codebase.test.ts
  modified:
    - packages/vector-store/src/interface.ts
    - packages/vector-store/src/qdrant.ts
    - packages/indexer/src/pipeline.ts
    - packages/retrieval/src/types.ts
    - packages/retrieval/src/search-engine.ts
    - packages/mcp-server/src/tools/search-codebase.ts
decisions:
  - 'Hierarchy expansion implemented as post-search step, not inside searchWithExpansion, to keep retrieval engine concerns separate'
  - 'Engine.scrollForHierarchy is optional to avoid breaking existing Engine implementations'
  - 'expandHierarchy walks BFS up to maxHops levels, deduplicates by chunkId'
  - "Hierarchy results tagged with expansionSource='hierarchy' rendered as [hierarchy] in output"
metrics:
  duration: '~45 minutes'
  completed: '2026-04-29'
  tasks: 2
  files: 6
---

# Phase 02 Plan 02: Hierarchy Fields Passthrough & Expansion Summary

Wired superclass/interfaces/isInnerClass hierarchy metadata from `ChunkPayload` through to Qdrant storage and added hierarchy-aware superclass traversal in the `search_codebase` MCP tool via a new optional `Engine.scrollForHierarchy` method.

## Tasks Completed

| #   | Name                                                 | Commit                       | Files                                                                   |
| --- | ---------------------------------------------------- | ---------------------------- | ----------------------------------------------------------------------- |
| 1   | ChunkPayload hierarchy fields + pipeline passthrough | 7f56dce                      | interface.ts, qdrant.ts, pipeline.ts                                    |
| 2   | Hierarchy expansion in search_codebase (TDD)         | RED: 1b94c48, GREEN: 5ba5d94 | search-codebase.ts, search-codebase.test.ts, types.ts, search-engine.ts |

## What Was Built

### Task 1 — ChunkPayload Extension

- Added `superclass?`, `interfaces?`, `isInnerClass?` to `ChunkPayload` in `packages/vector-store/src/interface.ts`
- Updated `toChunkPayload()` in `qdrant.ts` to extract the new fields from Qdrant records
- Updated `embedBatchWithRetry` in `packages/indexer/src/pipeline.ts` to map `chunk.superclass`, `chunk.interfaces`, `chunk.isInnerClass` into the stored payload

### Task 2 — Hierarchy Expansion (TDD)

- Added `superclass?`, `interfaces?`, `isInnerClass?`, `expansionSource?` to `RetrievalResult` in `packages/retrieval/src/types.ts`
- Updated `VectorSearchResult` internal type and `toRetrievalResult()` in `search-engine.ts` to propagate hierarchy fields
- Added optional `scrollForHierarchy?(name, chunkType)` method to `Engine` type in `search-codebase.ts`
- Implemented `expandHierarchy()` — BFS walk of superclass chains up to `maxHops` levels, deduplicating by `chunkId`
- Tagged hierarchy-expanded results with `expansionSource: 'hierarchy'` → rendered as `[hierarchy]` in formatted output
- Wired `expandHierarchy` call after `searchWithExpansion` when `clampedHops > 0`

## Test Results

- `packages/mcp-server`: 92/92 tests pass (4 new hierarchy expansion tests)
- `packages/vector-store`: 14/14 tests pass
- `packages/indexer`: 110/110 tests pass
- `packages/retrieval`: all pass

## Deviations from Plan

### Discovery: Actual mapping location

**Found during:** Task 1  
**Issue:** Plan referred to `ast-strategy.ts` as the `CodeChunk → ChunkPayload` mapping location. The actual mapping is in `packages/indexer/src/pipeline.ts` (`embedBatchWithRetry` function).  
**Fix:** Modified `pipeline.ts` instead of `ast-strategy.ts`.  
**Files modified:** `packages/indexer/src/pipeline.ts`  
**Commit:** 7f56dce

### Discovery: RetrievalResult missing hierarchy fields

**Found during:** Task 2 (RED phase)  
**Issue:** `RetrievalResult` and `toRetrievalResult()` in `search-engine.ts` didn't propagate hierarchy fields from the Qdrant payload.  
**Fix:** Added hierarchy fields to `VectorSearchResult` inline type and to the `toRetrievalResult()` mapping (Rule 2 — missing critical functionality).  
**Files modified:** `packages/retrieval/src/types.ts`, `packages/retrieval/src/search-engine.ts`  
**Commit:** 1b94c48 (test commit included type fixes)

## Self-Check: PASSED

- ✅ `packages/mcp-server/src/tools/search-codebase.ts` — exists
- ✅ Commit `5ba5d94` (feat: implement hierarchy expansion) — exists
- ✅ Commit `1b94c48` (test: add failing tests) — exists
- ✅ Commit `7f56dce` (feat: ChunkPayload hierarchy fields) — exists
