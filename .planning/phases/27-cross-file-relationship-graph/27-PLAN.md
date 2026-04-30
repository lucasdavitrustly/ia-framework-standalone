# Phase 27: Cross-File Relationship Graph — Execution Plan

**Created:** 2026-04-29
**Status:** Ready for execution
**Estimated effort:** Medium (most infrastructure already exists)

## Summary

Most of Phase 27 is already implemented. The `DependencyGraph` class, BFS traversal, pipeline integration, and `expand_hops` on `search_codebase` all exist. This plan addresses the **remaining gaps** only.

---

## Tasks

### Task 1: Add `edge_type` column to `file_edges` schema

**File:** `packages/retrieval/src/dependency-graph.ts`

- Alter schema: `file_edges(source_file, target_file, edge_type TEXT DEFAULT 'import', collection TEXT)`
- Add `collection` column for multi-project support (per D-09)
- Update `upsertEdges()` signature to accept `edge_type` parameter
- Update `getNeighborFiles()` to filter by collection
- Migration: drop+recreate table (dev tool, no production data migration needed)

**Tests:** `packages/retrieval/src/dependency-graph.test.ts` — add cases for edge_type filtering

---

### Task 2: Track external imports with `target_file = null` (D-04)

**File:** `packages/retrieval/src/dependency-graph.ts`

- Change `resolveImport()` to return a tagged result: `{ path: string | null, external: boolean }`
- When import is external (non-relative, or unresolved Java package), insert edge with `target_file = NULL` and `edge_type = 'external'`
- Requires schema to allow nullable `target_file` (remove from PK, add separate unique index)

**Tests:** Verify external imports are stored with null target

---

### Task 3: Java import resolution (D-02)

**File:** `packages/retrieval/src/dependency-graph.ts` (or new `resolve-import.ts`)

- Add `resolveJavaImport(importSpec, fileManifest)` — maps `com.example.Foo` → file path using indexed file manifest
- Strategy: convert package path to directory path (`com/example/Foo.java`), check against known files in collection
- Wire into `upsertEdges()` — detect Java imports by absence of `.`/`/` prefix AND presence of package-style dots

**Tests:** Java import resolution with mock file manifest

---

### Task 4: Wire `expand_hops` into `search_codebase_hybrid` tool

**File:** `packages/mcp-server/src/tools/search-codebase-hybrid.ts`

- Add `expand_hops` parameter to input schema (z.number().int().min(0).max(2).default(2))
- After hybrid search results, call `dependencyGraph.getNeighborFiles()` with result file paths
- Fetch chunks for neighbor files and append to results (same pattern as `search_codebase`)
- Engine interface needs `searchWithExpansion` or accept DependencyGraph as dependency

**Tests:** Verify expand_hops=0 returns only direct results, expand_hops=2 returns transitive

---

### Task 5: Change default `expand_hops` to 2 on `search_codebase`

**File:** `packages/mcp-server/src/tools/search-codebase.ts`

- Change `.default(1)` → `.default(2)` in the zod schema for expand_hops
- Update tool description to reflect new default

**Tests:** Existing tests should pass (may need default assertion update)

---

### Task 6: Register `get_file` MCP tool (D-06)

**File:** `packages/mcp-server/src/tools/get-file.ts` (new)

- Create tool: `get_file(path: string)` — returns all chunks for a file sorted by startLine
- Use existing `SearchEngine.getFile(relativePath)` method
- Register in tool index

**Tests:** Tool returns chunks in line order, returns error for unknown paths

---

### Task 7: Emit graph density stats after indexing

**File:** `packages/indexer/` (pipeline completion hook)

- After indexing completes, query: `SELECT COUNT(*) total_edges, COUNT(DISTINCT source_file) files_with_imports, SUM(CASE WHEN target_file IS NULL THEN 1 ELSE 0 END) external_edges FROM file_edges WHERE collection = ?`
- Log as structured info message

**Tests:** Integration test verifying stats are emitted

---

## Dependency Order

```
Task 1 (schema) → Task 2 (external imports) → Task 3 (Java resolution)
Task 1 (schema) → Task 4 (hybrid expand_hops)
Task 5 (default change) — independent
Task 6 (get_file tool) — independent
Task 7 (stats) — depends on Task 1+2
```

## Execution Strategy

1. Tasks 1, 5, 6 can start in parallel (no deps between them)
2. Tasks 2, 3 depend on Task 1 (schema changes)
3. Task 4 depends on Task 1 (needs collection-aware graph)
4. Task 7 is last (needs external tracking from Task 2)

## Validation Criteria

- `arch-semantic` benchmark prompt retrieves connected DTO→Service→Encryption chain
- `deps-cross-file` benchmark prompt returns transitive adapter chain
- `get_file` tool returns complete file context in line order
- Graph density stats appear in indexing logs

---

_Phase: 27-cross-file-relationship-graph_
_Plan created: 2026-04-29_
