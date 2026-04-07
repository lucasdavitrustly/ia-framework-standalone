---
phase: 11-mrr-optimization
plan: '03'
subsystem: retrieval
tags: [hybrid-search, sparse-vectors, bm25, rrf, mcp, qdrant]
dependency-graph:
  requires: [11-02]
  provides: [hybrid-search-mcp-tool, sparse-vector-indexing]
  affects: [mcp-server, retrieval, vector-store, indexer]
tech-stack:
  added: []
  patterns:
    - Qdrant sparse vectors with IDF modifier for server-side BM25
    - RRF (Reciprocal Rank Fusion) via client.query() with 3 prefetch slots
    - djb2 hash for stable token-to-integer mapping
    - Separate MCP tool for hybrid vs. dense-only search
key-files:
  created:
    - packages/vector-store/src/interface.ts (SparseVector, HybridSearchOptions, searchHybrid on VectorStore/CollectionInfo/VectorPoint)
    - packages/mcp-server/src/tools/search-codebase-hybrid.ts
    - packages/mcp-server/src/tools/search-codebase-hybrid.test.ts
  modified:
    - packages/vector-store/src/qdrant.ts (searchHybrid, getCollectionInfo hasSparseVector, upsertBatch sparse, initialize sparse_vectors)
    - packages/vector-store/src/qdrant.test.ts (14 tests, added Tests 9–14)
    - packages/retrieval/src/search-engine.ts (searchHybrid, computeTermFrequencySparseVector, djb2Hash)
    - packages/retrieval/src/search-engine.test.ts (5 new tests for searchHybrid + computeTermFrequencySparseVector)
    - packages/retrieval/src/types.ts (optional searchHybrid on SearchEngineConfig.vectorStore)
    - packages/retrieval/src/index.ts (export computeTermFrequencySparseVector)
    - packages/mcp-server/src/server.ts (import + registerSearchCodebaseHybridTool)
    - packages/indexer/src/pipeline.ts (import computeTermFrequencySparseVector, add sparseVector to both vectorPoints push sites)
    - packages/indexer/package.json (@ia-framework/retrieval workspace dep added)
decisions:
  - Export computeTermFrequencySparseVector from @ia-framework/retrieval rather than duplicating in indexer
  - SearchEngine.searchHybrid() falls back to search() when vectorStore.searchHybrid is absent
  - search_codebase_hybrid registered as a separate MCP tool (not a param on search_codebase) for independent evaluation
  - as any cast on client.query() — same pattern as existing deleteByFilter/deleteByIds; Qdrant SDK overload resolution limitation
metrics:
  duration: '~8 minutes (continuation of multi-session plan)'
  completed: '2026-04-07'
  tasks-completed: 7
  files-modified: 11
  tests-added: 13
---

# Phase 11 Plan 03: Hybrid Search — BM25 Sparse + Dense Vectors + RRF Fusion Summary

**One-liner:** Hybrid search via Qdrant sparse vectors (BM25 IDF) + dual dense vectors fused with RRF, exposed as new `search_codebase_hybrid` MCP tool with sparse vector indexing wired into the pipeline.

## What Was Built

Full end-to-end hybrid search pipeline:

1. **VectorStore interface** (`interface.ts`) — `SparseVector`, `HybridSearchOptions`, `VectorStore.searchHybrid()`, `CollectionInfo.hasSparseVector`, `VectorPoint.sparseVector?`
2. **QdrantVectorStore** (`qdrant.ts`) — `initialize()` creates `sparse_vectors.sparse.modifier="idf"`, `upsertBatch()` includes sparse slot when provided, `searchHybrid()` calls `client.query()` with 3 prefetches (text dense, code dense, sparse) + `{ fusion: 'rrf' }`, `getCollectionInfo()` detects `hasSparseVector`
3. **SearchEngine** (`search-engine.ts`) — `searchHybrid()` embeds query, calls `computeTermFrequencySparseVector()`, delegates to `vectorStore.searchHybrid()`, falls back to `search()` when store lacks hybrid support
4. **`computeTermFrequencySparseVector()`** — tokenize → lowercase → count TF → djb2Hash → sort by index ascending (Qdrant requirement)
5. **MCP tool** (`search-codebase-hybrid.ts`) — `registerSearchCodebaseHybridTool()` + `searchCodebaseHybridHandler()` with formatted markdown output
6. **Server wiring** (`server.ts`) — `registerSearchCodebaseHybridTool(server, config.searchEngine)` called after existing search tool
7. **Indexer wiring** (`pipeline.ts`) — both vectorPoints push sites (code chunks and context sources) include `sparseVector: computeTermFrequencySparseVector(chunk.content)`

## Test Coverage

| Package      | Tests Added                                                                                                | Total |
| ------------ | ---------------------------------------------------------------------------------------------------------- | ----- |
| vector-store | +6 (Tests 9–14: searchHybrid calls, RRF fusion, hasSparseVector, sparse upsert, initialize sparse_vectors) | 14    |
| retrieval    | +5 (3 for searchHybrid, 2 for computeTermFrequencySparseVector)                                            | 29    |
| mcp-server   | +4 (handler with results, no results, default limit, tool registration name)                               | 21    |

**All 23 test suites pass. `pnpm -w build` and `pnpm -w test` both clean.**

## Commits

| Hash      | Description                                                                       |
| --------- | --------------------------------------------------------------------------------- |
| `db10c3e` | Task 1: Extend VectorStore interface                                              |
| `782e689` | Task 2: QdrantVectorStore sparse support (14 tests)                               |
| `a6e7588` | Task 3: SearchEngine.searchHybrid() + computeTermFrequencySparseVector (29 tests) |
| `1e22a5d` | Tasks 4–7: MCP tool, server wiring, indexer wiring, 4 new MCP tests               |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Dependency] Added @ia-framework/retrieval to indexer package.json**

- **Found during:** Task 6
- **Issue:** `packages/indexer/package.json` did not list `@ia-framework/retrieval` as a dependency. Importing `computeTermFrequencySparseVector` from it would fail at runtime.
- **Fix:** Added `"@ia-framework/retrieval": "workspace:*"` to indexer's dependencies. No circular dependency — retrieval does not depend on indexer.
- **Files modified:** `packages/indexer/package.json`, `pnpm-lock.yaml`
- **Commit:** `1e22a5d`

## Known Stubs

None. All data paths are wired end-to-end.

## Notes

- **Collection recreation required**: Adding `sparse_vectors` to `createCollection` is a schema change. Existing Qdrant collections (from before this plan) must be deleted and re-indexed via `ia-framework index --full`. The dimension-mismatch logic handles collection recreation automatically.
- **No score threshold for hybrid**: RRF scores are relative ranks, not absolute similarity values. `scoreThreshold` is intentionally absent from `searchHybrid()`.
- **`as any` cast on `client.query()`**: Qdrant SDK 1.17.0 TypeScript overloads don't resolve cleanly for the positional call pattern — same pragmatic workaround as `deleteByFilter`/`deleteByIds` in the existing code.

## Self-Check: PASSED

All 9 key files verified present. All 4 task commits verified in git log.
