---
phase: 27
plan: 27
subsystem: retrieval/mcp-server/indexer
tags: [dependency-graph, cross-file, rag, import-resolution, java]
dependency-graph:
  requires: []
  provides: [cross-file-graph-v2, expand-hops-hybrid, java-import-resolution, graph-density-stats]
  affects: [retrieval, mcp-server, indexer]
tech-stack:
  added: []
  patterns: [nullable-sqlite-column, tagged-union-resolution, bfs-collection-filter]
key-files:
  created: []
  modified:
    - packages/retrieval/src/dependency-graph.ts
    - packages/retrieval/src/dependency-graph.test.ts
    - packages/mcp-server/src/tools/search-codebase-hybrid.ts
    - packages/mcp-server/src/tools/search-codebase-hybrid.test.ts
    - packages/mcp-server/src/tools/search-codebase.ts
    - packages/indexer/src/pipeline.ts
decisions:
  - Used drop+recreate migration for file_edges v1→v2 schema (dev tool, no prod data)
  - External imports stored with null target_file + edge_type='external' for tracking without breaking BFS
  - expand_hops defaults to 2 (transitive) across both search tools for richer cross-file context
  - Java resolution uses file suffix matching (com/example/Foo.java) against indexed file manifest
metrics:
  duration: ~25min
  completed: 2026-04-30
  tasks_completed: 7
  files_modified: 6
---

# Phase 27 Plan 27: Cross-File Relationship Graph Indexing Summary

**One-liner:** Schema v2 for `file_edges` adds `edge_type`/`collection`/nullable `target_file`, Java import resolution, `expand_hops` on hybrid search, and graph density stats after indexing.

## Tasks Completed

| Task | Description                                                   | Commit  | Status          |
| ---- | ------------------------------------------------------------- | ------- | --------------- |
| 1    | Add `edge_type` + `collection` columns to `file_edges` schema | f2bfeb8 | ✅              |
| 2    | Track external imports with `target_file = null`              | f2bfeb8 | ✅              |
| 3    | Java import resolution via `resolveJavaImport()`              | f2bfeb8 | ✅              |
| 4    | Wire `expand_hops` into `search_codebase_hybrid`              | 08581d0 | ✅              |
| 5    | Change `expand_hops` default from 1→2 in `search_codebase`    | 066a407 | ✅              |
| 6    | `get_file` MCP tool                                           | —       | ✅ Pre-existing |
| 7    | Emit graph density stats after indexing                       | ae5df88 | ✅              |

## What Changed

### `dependency-graph.ts` (Schema v2)

- **New columns:** `edge_type TEXT DEFAULT 'import'`, `collection TEXT DEFAULT ''`, `target_file` now nullable
- **Migration:** `initialize()` detects old v1 schema (no `edge_type` col) and drops+recreates
- **`upsertEdges()`:** Now stores external imports (`express`, `@nestjs/common`) as rows with `target_file = NULL` and `edge_type = 'external'`
- **`getNeighborFiles()`:** Filters by `collection`, skips null-target edges in BFS
- **New `upsertEdgesWithJava()`:** Resolves Java package imports via file manifest before falling back to external
- **New `resolveJavaImport()`:** Converts `com.example.Foo` → `com/example/Foo.java` and searches manifest
- **New `getDensityStats()`:** Returns `{ total_edges, files_with_imports, external_edges }` per collection

### `search-codebase.ts`

- Default expansion hops: `1` → `2` (transitive by default)
- Updated tool description and schema description

### `search-codebase-hybrid.ts`

- Added optional `searchWithExpansion` to `HybridEngine` type
- Added `expand_hops` to `SearchCodebaseHybridInput` (default: 2)
- Handler calls `searchWithExpansion(hops)` when available and `hops > 0`, otherwise `searchHybrid`
- `expand_hops` added to registered tool inputSchema

### `pipeline.ts`

- Updated `dependencyGraph` interface: `upsertEdges`/`deleteEdgesForFile` accept optional `collection`, added optional `getDensityStats`
- After `stage = 'done'`, logs structured info: `total_edges`, `files_with_imports`, `external_edges`, `collection`

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written.

**Note:** Task 6 (`get_file` MCP tool) was already fully implemented and registered prior to this execution. Documented as pre-existing work.

## Known Stubs

None — all new fields are stored and retrieved from SQLite.

## Test Coverage

- `dependency-graph.test.ts`: +6 new tests (collection isolation, external import null tracking, getDensityStats, Java resolution via manifest, Java upsertEdgesWithJava, schema migration idempotency)
- `search-codebase-hybrid.test.ts`: +3 new tests (expand_hops=2 calls searchWithExpansion, expand_hops=0 bypasses expansion, fallback when no searchWithExpansion)
- All 293 tests across retrieval + mcp-server + indexer packages pass

## Self-Check: PASSED

- `packages/retrieval/src/dependency-graph.ts` — FOUND ✅
- `packages/mcp-server/src/tools/search-codebase-hybrid.ts` — FOUND ✅
- `packages/mcp-server/src/tools/search-codebase.ts` — FOUND ✅
- `packages/indexer/src/pipeline.ts` — FOUND ✅
- Commits: 066a407, f2bfeb8, 08581d0, ae5df88 — all in git log ✅
