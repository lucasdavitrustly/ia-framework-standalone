---
phase: 27-cross-file-relationship-graph
verified: 2026-04-30T00:00:00Z
status: passed
score: 7/7 must-haves verified
---

# Phase 27: Cross-File Relationship Graph Verification Report

**Phase Goal:** Extend the indexer to build and persist a cross-file import/export relationship graph so downstream retrieval can traverse file relationships (fixing arch-semantic and deps-cross-file benchmark regressions).
**Verified:** 2026-04-30
**Status:** ✅ passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #   | Truth                                                                       | Status     | Evidence                                                                                                                                                                                    |
| --- | --------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `file_edges` has `edge_type` + `collection` columns, nullable `target_file` | ✓ VERIFIED | `dependency-graph.ts` lines 111–120: `CREATE TABLE file_edges (source_file TEXT NOT NULL, target_file TEXT, edge_type TEXT NOT NULL DEFAULT 'import', collection TEXT NOT NULL DEFAULT '')` |
| 2   | External imports stored with `target_file = null`                           | ✓ VERIFIED | `resolveImport()` returns `{ path: null, external: true, edgeType: 'external' }` for non-relative specifiers; `upsertEdges()` stores the null target                                        |
| 3   | Java import resolution implemented                                          | ✓ VERIFIED | `resolveJavaImport()` (lines 60–76) converts `com.example.Foo` → `com/example/Foo.java` and searches manifest; `upsertEdgesWithJava()` wires it before falling back to external             |
| 4   | `expand_hops` wired into `search_codebase_hybrid`                           | ✓ VERIFIED | `search-codebase-hybrid.ts` lines 63–80: handler reads `input.expand_hops ?? 2`, calls `engine.searchWithExpansion({ hops })` when available                                                |
| 5   | `expand_hops` default = 2 in `search_codebase`                              | ✓ VERIFIED | `search-codebase.ts` line 210: `const hops = input.expand_hops ?? observability?.defaultExpansionHops ?? 2`; tool description states "2 = transitive (default)"                             |
| 6   | `get_file` MCP tool exists and is registered                                | ✓ VERIFIED | `packages/mcp-server/src/tools/get-file.ts` — full implementation; registered in `server.ts:74` via `registerGetFileTool(server, config.searchEngine)`                                      |
| 7   | Graph density stats emitted after indexing                                  | ✓ VERIFIED | `pipeline.ts` lines 462–473: after `stage = 'done'`, calls `dependencyGraph.getDensityStats(collectionName)` and logs `total_edges`, `files_with_imports`, `external_edges`, `collection`   |

**Score:** 7/7 truths verified

---

## Required Artifacts

| Artifact                                                  | Expected                                                        | Status     | Details                                                                                                                                                                  |
| --------------------------------------------------------- | --------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/retrieval/src/dependency-graph.ts`              | Schema v2, external imports, Java resolution, `getDensityStats` | ✓ VERIFIED | 281 lines; full implementation with `initialize()` migration, `upsertEdges()`, `upsertEdgesWithJava()`, `resolveJavaImport()`, `getNeighborFiles()`, `getDensityStats()` |
| `packages/mcp-server/src/tools/search-codebase-hybrid.ts` | `expand_hops` parameter + `searchWithExpansion` dispatch        | ✓ VERIFIED | 234 lines; `expand_hops` in `HybridEngine` type, `SearchCodebaseHybridInput`, handler, and registered `inputSchema`                                                      |
| `packages/mcp-server/src/tools/search-codebase.ts`        | `expand_hops` default = 2                                       | ✓ VERIFIED | Line 210 uses `?? 2` fallback; tool description updated                                                                                                                  |
| `packages/mcp-server/src/tools/get-file.ts`               | `get_file` tool returning chunks sorted by startLine            | ✓ VERIFIED | 95 lines; sorts by `startLine` (line 54), registered in `server.ts`                                                                                                      |
| `packages/indexer/src/pipeline.ts`                        | Graph density stats after indexing                              | ✓ VERIFIED | Lines 462–473; conditional on `getDensityStats` optional method present                                                                                                  |

---

## Key Link Verification

| From                        | To                                  | Via                                                  | Status  | Details                                                                                         |
| --------------------------- | ----------------------------------- | ---------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------- | ----- |
| `pipeline.ts`               | `DependencyGraph.getDensityStats`   | Optional interface method check                      | ✓ WIRED | `if (dependencyGraph?.getDensityStats)` guard before call                                       |
| `search-codebase-hybrid.ts` | `HybridEngine.searchWithExpansion`  | Optional method check                                | ✓ WIRED | `if (hops > 0 && engine.searchWithExpansion)` guard before call                                 |
| `server.ts`                 | `get-file.ts` `registerGetFileTool` | Import + call at line 74                             | ✓ WIRED | `import { registerGetFileTool } from './tools/get-file.js'`; called unconditionally             |
| `upsertEdges`               | SQLite `file_edges`                 | `INSERT INTO file_edges` with nullable `target_file` | ✓ WIRED | `insert.run(sourceFilePath, edge.target, edge.edgeType, collection)` — `edge.target` is `string | null` |
| `upsertEdgesWithJava`       | `resolveJavaImport`                 | Direct call before external fallback                 | ✓ WIRED | Lines 192–198: `resolveJavaImport(spec, fileManifest)` → `null` triggers external edge          |

---

## Commits Verified

| Commit    | Task                                                              | Status              |
| --------- | ----------------------------------------------------------------- | ------------------- |
| `f2bfeb8` | Schema v2 + external imports + Java resolution (Tasks 1, 2, 3)    | ✓ Exists in git log |
| `08581d0` | `expand_hops` in `search_codebase_hybrid` (Task 4)                | ✓ Exists in git log |
| `066a407` | Default `expand_hops` 1→2 in `search_codebase` (Task 5)           | ✓ Exists in git log |
| `ae5df88` | Graph density stats + `dependencyGraph` interface update (Task 7) | ✓ Exists in git log |

---

## Anti-Patterns Found

None. No TODOs, stubs, or placeholder implementations found in the modified files. All implemented values flow from SQLite queries to structured log output (stats) or to retrieval results (expand_hops).

---

## Human Verification Required

### 1. arch-semantic benchmark regression resolution

**Test:** Run the `arch-semantic` benchmark prompt ("How does the service layer communicate with the domain model?") against an indexed Java codebase with `OrderService.java → OrderDTO.java → FieldEncryption.java` import chain.
**Expected:** Results include all three files in the response (transitive expand_hops=2 traverses the full chain).
**Why human:** Requires a live indexed corpus and benchmark runner. Cannot verify retrieval quality from static code inspection.

### 2. deps-cross-file benchmark regression resolution

**Test:** Run the `deps-cross-file` benchmark prompt ("What external dependencies does the payment module depend on?") against an indexed codebase with a 3-4 hop adapter chain.
**Expected:** Transitive imports across 3-4 file hops appear in the results.
**Why human:** Same as above — live indexing + retrieval required.

### 3. Schema migration (v1 → v2) in live database

**Test:** Point the framework at an existing `.ia-framework/graph.sqlite` that has the v1 `file_edges` schema (no `edge_type` column). Run indexing.
**Expected:** Migration detects missing `edge_type` column, drops and recreates table, indexing completes successfully.
**Why human:** Requires an actual v1 SQLite file on disk to verify the migration path.

---

## Summary

Phase 27 goal is **fully achieved**. All 7 must-haves are present, substantive, and wired:

1. **Schema v2** — `file_edges` has `edge_type`, `collection`, nullable `target_file`, with collection-scoped index for fast BFS.
2. **External imports** — `resolveImport()` returns a tagged union; `upsertEdges()` stores `null` target with `edge_type='external'` for unresolvable specifiers.
3. **Java resolution** — `resolveJavaImport()` converts dot-notation to file path suffix and searches the manifest; `upsertEdgesWithJava()` applies it before the external fallback.
4. **Hybrid expand_hops** — `search_codebase_hybrid` dispatches to `searchWithExpansion(hops)` when available, with fallback to `searchHybrid`.
5. **Default hops = 2** — `search_codebase` handler uses `input.expand_hops ?? defaultExpansionHops ?? 2`, giving transitive expansion by default.
6. **`get_file` tool** — Fully implemented, sorts chunks by `startLine`, registered in `server.ts`.
7. **Graph density stats** — Logged at end of indexing pipeline when `getDensityStats` is available on the injected `dependencyGraph`.

Three human verification items remain to confirm the benchmark regressions are resolved end-to-end and the v1→v2 SQLite migration behaves correctly in a live environment.

---

_Verified: 2026-04-30_
_Verifier: the agent (gsd-verifier)_
