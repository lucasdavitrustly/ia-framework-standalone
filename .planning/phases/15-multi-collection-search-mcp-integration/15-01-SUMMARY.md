---
phase: '15'
plan: '01'
subsystem: 'retrieval'
tags: ['rrf', 'multi-collection', 'search', 'tdd', 'qdrant']
dependency_graph:
  requires:
    - '14-01: SearchEngine with hybrid search'
    - 'packages/retrieval/src/types.ts'
    - 'packages/retrieval/src/search-engine.ts'
  provides:
    - 'rrfMerge function for cross-collection rank fusion'
    - 'MultiCollectionSearchEngine class'
    - 'RetrievalResult.source field'
  affects:
    - 'packages/mcp-server (Plan 15-02 will wire MultiCollectionSearchEngine into MCP tools)'
tech_stack:
  added: []
  patterns:
    - 'RRF (Reciprocal Rank Fusion) with k=60 for cross-collection merging'
    - 'Over-fetch pattern: query each engine with limit*2, then truncate after RRF'
    - "Source tagging: every result carries source:'ast'|'llm' from its originating engine"
    - 'exactOptionalPropertyTypes: private fields typed as T | undefined (not T?)'
key_files:
  created:
    - 'packages/retrieval/src/rrf.ts'
    - 'packages/retrieval/src/rrf.test.ts'
    - 'packages/retrieval/src/multi-collection-search-engine.ts'
    - 'packages/retrieval/src/multi-collection-search-engine.test.ts'
  modified:
    - 'packages/retrieval/src/types.ts (added source field)'
    - 'packages/retrieval/src/index.ts (added barrel exports)'
decisions:
  - 'Over-fetch with limit*2 per engine before RRF — ensures good candidates for fusion without ballooning API calls'
  - 'getFile expansion in searchWithExpansion routes through this.getFile() (all collections) rather than individual engine.searchWithExpansion — avoids single-collection bias in graph expansion'
  - 'Private dependencyGraph field typed as T | undefined (not T?) due to exactOptionalPropertyTypes:true'
metrics:
  duration: '~8 minutes (continued from previous session)'
  completed_date: '2026-04-14'
  tasks_completed: 2
  files_created: 4
  files_modified: 2
---

# Phase 15 Plan 01: Multi-Collection Search Engine (RRF + Source Tagging) Summary

**One-liner:** RRF-based `MultiCollectionSearchEngine` wrapping N `SearchEngine` instances with parallel queries, source tagging, and over-fetch strategy.

## What Was Built

Two new modules in `packages/retrieval/src/`:

### `rrf.ts` — Reciprocal Rank Fusion

- `RankedList` interface binding a `source: 'ast' | 'llm'` to a `RetrievalResult[]`
- `rrfMerge(lists, limit, k=60)` — merges N ranked lists by RRF formula (`1 / (k + rank + 1)`), dedupes by `chunkId` (summing scores for repeated items), tags each result with `source`, returns top `limit` results
- Single-list optimization skips Map overhead and directly maps with RRF scores + source tags

### `multi-collection-search-engine.ts` — MultiCollectionSearchEngine

- Constructor: `new MultiCollectionSearchEngine({ engines: CollectionEngine[], dependencyGraph? })`
- **`search()`** — Queries all engines in parallel (over-fetch `limit*2`), merges via `rrfMerge`
- **`searchHybrid()`** — Same pattern but calls `engine.searchHybrid()` on each
- **`searchWithExpansion()`** — Base multi-collection search, then fetches neighbor file chunks via `this.getFile()` (all collections), dedupes by chunkId, appends with score=0
- **`getFile()`** — Queries all engines in parallel, tags results by source, dedupes by chunkId (first wins), sorts by `startLine`

### Type change in `types.ts`

Added `source?: 'ast' | 'llm' | undefined` to `RetrievalResult` — optional, won't break existing `SearchEngine` usages.

### Barrel exports in `index.ts`

`rrfMerge`, `RankedList`, `MultiCollectionSearchEngine`, `CollectionEngine`, `MultiCollectionSearchEngineConfig` all exported.

## TDD Cycles

### Task 1 — rrfMerge

- **RED** `02c4ce0` — 8 failing tests for rrfMerge + RetrievalResult.source
- **GREEN** `3125d45` — rrfMerge implemented, all 8 pass

### Task 2 — MultiCollectionSearchEngine

- **RED** `9474dc1` — 16 failing tests (14 behavioral + 2 interface compatibility)
- **GREEN** `c9761b5` — MultiCollectionSearchEngine implemented, all 16 pass

## Verification

```
Test Files  4 passed (4)
     Tests  54 passed (54)
TypeScript: 0 errors
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - TypeScript] Fixed implicit `any` in test filter callback**

- **Found during:** Task 2 RED phase
- **Issue:** `results.filter((r) => r.chunkId === 'shared')` — `r` implicitly had type `any` with `noUncheckedIndexedAccess` + `strictNullChecks`
- **Fix:** Annotated as `(r: RetrievalResult)`
- **Files modified:** `multi-collection-search-engine.test.ts` line 301
- **Commit:** Part of `9474dc1`

**2. [Rule 2 - TypeScript] Fixed `exactOptionalPropertyTypes` on private field**

- **Found during:** Task 2 GREEN phase — LSP error on constructor assignment
- **Issue:** `private readonly dependencyGraph?: { ... }` — with `exactOptionalPropertyTypes: true`, assigning `config.dependencyGraph` (which can be `undefined`) to an optional property requires explicit `| undefined`
- **Fix:** Changed to `private readonly dependencyGraph: { ... } | undefined`
- **Files modified:** `multi-collection-search-engine.ts` lines 34–38
- **Commit:** Part of `c9761b5`

## Known Stubs

None — all methods are fully implemented with real logic.

## Self-Check: PASSED
