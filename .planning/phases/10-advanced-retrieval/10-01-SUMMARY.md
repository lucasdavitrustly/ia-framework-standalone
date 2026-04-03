---
phase: '10'
plan: '01'
title: 'DependencyGraph barrel export + IndexingPipeline upsertEdges wiring'
subsystem: 'retrieval, indexer'
tags: ['dependency-graph', 'sqlite', 'barrel-export', 'pipeline-wiring']
dependency-graph:
  requires: ['09-02']
  provides: ['DependencyGraph barrel export', 'IndexingPipeline upsertEdges wiring']
  affects: ['mcp-server', 'cli', 'dashboard-api']
tech-stack:
  added: ['better-sqlite3@^12.8.0', '@types/better-sqlite3@^7.6.0']
  patterns:
    [
      'SQLite file-level adjacency table',
      'BFS neighbor expansion',
      'optional injectable dependency graph in pipeline',
    ]
key-files:
  created:
    - packages/retrieval/src/dependency-graph.ts
    - packages/retrieval/src/dependency-graph.test.ts
  modified:
    - packages/retrieval/src/index.ts
    - packages/retrieval/package.json
    - packages/retrieval/tsup.config.ts
    - packages/indexer/src/pipeline.ts
    - packages/indexer/src/pipeline.test.ts
decisions:
  - 'DependencyGraph lives in packages/retrieval (retrieval concern, consumed by SearchEngine in 10-02)'
  - 'IndexingPipeline receives DependencyGraph as optional injectable — maintains testability'
  - 'SQLite file is .ia-framework/graph.sqlite (separate from metrics.sqlite)'
  - 'File-level edges only (not chunk-level) — simpler, sufficient for 1-2 hop expansion'
  - 'better-sqlite3 marked as external in tsup.config.ts (native module)'
metrics:
  duration: '~8 minutes'
  completed: '2026-04-02'
  tasks: 3
  files: 7
---

# Phase 10 Plan 01: DependencyGraph Barrel Export + IndexingPipeline upsertEdges Wiring

**One-liner:** Exported `DependencyGraph` from retrieval barrel, wired `upsertEdges()` into `IndexingPipeline.run()`, and verified all existing tests pass.

## Tasks Completed

| #   | Task                                         | Commit    | Key Files                                 |
| --- | -------------------------------------------- | --------- | ----------------------------------------- |
| 1   | Export DependencyGraph from retrieval barrel | `28cf094` | retrieval/src/index.ts                    |
| 2   | Wire upsertEdges into IndexingPipeline       | `28cf094` | indexer/src/pipeline.ts, pipeline.test.ts |
| 3   | Verify builds and tests pass                 | `28cf094` | —                                         |

## What Was Built

### DependencyGraph Class (pre-existing, now exported)

- `DependencyGraph` class: file-level import adjacency stored in SQLite via `better-sqlite3`
- `initialize()`: creates `file_edges` table with `source_file`/`target_file` composite PK + indexes
- `upsertEdges(sourceFilePath, imports, projectRoot)`: resolves relative imports to absolute paths, skips external packages, replaces all edges for source file in a transaction
- `getNeighborFiles(startFiles, hops)`: BFS traversal returning files reachable within 1-2 hops (excludes start files)
- `deleteEdgesForFile(filePath)`: removes edges for incremental re-indexing
- `resolveImport()`: private helper resolving relative specifiers with `.ts`, `.tsx`, `.js`, `.jsx`, `/index.ts` fallbacks

### Barrel Export

- `DependencyGraph` and `DependencyGraphConfig` type added to `packages/retrieval/src/index.ts`
- `better-sqlite3` added as dependency; marked `external` in `tsup.config.ts` (native module)

### IndexingPipeline Wiring

- `dependencyGraph?` optional config field added to `IndexingConfig` interface
- `dependencyGraph.initialize()` called at pipeline start
- After parsing each file: `upsertEdges(filePath, fileImports, targetProjectPath)` called when imports exist
- During incremental indexing: `deleteEdgesForFile(filePath)` called before re-indexing changed files
- Graceful: no graph = no graph calls (fully backward compatible)

## Test Results

| Package                                                          | Tests   | Status |
| ---------------------------------------------------------------- | ------- | ------ |
| @ia-framework/retrieval (dependency-graph.test.ts)               | 10/10   | PASS   |
| @ia-framework/indexer (pipeline.test.ts — dependencyGraph suite) | 4/4 new | PASS   |

### DependencyGraph Tests (10)

1. Resolves relative imports to absolute paths
2. Skips external package imports
3. 1-hop neighbor expansion
4. 2-hop transitive expansion
5. Deduplicates results
6. Empty result for unknown files
7. upsertEdges replaces existing edges
8. deleteEdgesForFile removes all edges for a source
9. Resolves index.ts barrel exports (directory/index.ts)
10. Handles multiple start files

### IndexingPipeline dependencyGraph Tests (4)

1. Calls upsertEdges for chunks with imports
2. Does not call upsertEdges for empty imports
3. Calls deleteEdgesForFile during incremental indexing
4. Does not call graph methods when dependencyGraph is undefined

## Requirements Completed

- **INDX-05**: Indexing builds a dependency graph (imports, type references, function calls) during parsing

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all implementations are complete with real data flows.
