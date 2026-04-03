---
phase: 9
plan: 1
title: "db-context package + pipeline extension"
subsystem: "core, db-context, indexer"
tags: ["database", "postgresql", "context-source", "indexing", "tdd"]
dependency_graph:
  requires: ["08-04"]
  provides: ["db-context-package", "context-source-interface", "pipeline-contextSources"]
  affects: ["mcp-server", "cli", "dashboard-api"]
tech_stack:
  added: ["pg@^8.13.0", "@types/pg@^8.11.0"]
  patterns: ["ContextSource interface pattern", "constructor-injected Pool for testability", "information_schema queries for schema introspection"]
key_files:
  created:
    - "packages/db-context/package.json"
    - "packages/db-context/tsconfig.json"
    - "packages/db-context/tsup.config.ts"
    - "packages/db-context/src/types.ts"
    - "packages/db-context/src/loader.ts"
    - "packages/db-context/src/postgres-source.ts"
    - "packages/db-context/src/postgres-source.test.ts"
    - "packages/db-context/src/index.ts"
  modified:
    - "packages/core/src/types/index.ts"
    - "packages/core/src/index.ts"
    - "packages/indexer/src/pipeline.ts"
    - "packages/indexer/src/pipeline.test.ts"
decisions:
  - "Pool constructor injection (not vi.mock) for PostgresSource testability — follows Phase 3 pattern"
  - "FK query runs once for all tables (not per-table) for efficiency"
  - "contextSources processed after file chunks; chunksTotal updated post-getChunks() since count unknown upfront"
  - "Failing contextSources log error and skip — never crash pipeline"
metrics:
  duration: "~6 minutes"
  completed: "2026-04-01"
  tasks: 4
  files: 12
---

# Phase 9 Plan 1: db-context package + pipeline extension Summary

**One-liner:** PostgreSQL schema indexing via ContextSource interface — `PostgresSource` queries `information_schema`, `IndexingPipeline` embeds DB chunks identically to file chunks.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Extend `@ia-framework/core` types | 2b8b978 | types/index.ts, index.ts |
| 2 | New `@ia-framework/db-context` package (TDD) | 91e2223 | 8 new files |
| 3 | Extend `IndexingPipeline` (TDD) | 244b2d1 | pipeline.ts, pipeline.test.ts |
| 4 | Install dependencies and verify build | 458e7e1 | pnpm-lock.yaml |

## What Was Built

### Core Type Extensions
- `ChunkMetadata.chunkType` extended: `'table' | 'view'` added to union
- `ContextSource` interface added: `{ name: string; getChunks(): Promise<ChunkMetadata[]> }`
- Both exported from `@ia-framework/core`

### @ia-framework/db-context Package
- `DatabaseConfigSchema` (Zod): validates `host, port, database, user, password, ssl?`
- `loadDbConfig(path)`: reads + validates db.json, throws `DbConfigNotFoundError` on missing file
- `PostgresSource implements ContextSource`:
  - `testConnection()`: COUNT(*) from information_schema.tables — never throws
  - `getChunks()`: queries tables, views, columns, FKs → one ChunkMetadata per table/view
  - `executeQuery(sql)`: runs arbitrary SQL, returns `{ rows, rowCount }`
  - `close()`: calls pool.end()
- Constructor-injected Pool for full testability without vi.mock()

### IndexingPipeline Extension  
- `contextSources?: ContextSource[]` added to `IndexingConfig`
- After file chunks: calls `getChunks()` per source, embeds in batches, upserts to Qdrant
- Graceful: failing source logs error and is skipped
- `chunksTotal` updated post-`getChunks()` (unknown count upfront)

## Test Results

| Package | Tests | Status |
|---------|-------|--------|
| @ia-framework/db-context | 14/14 | ✅ |
| @ia-framework/indexer | 13/13 (5 new) | ✅ |
| Full workspace | 21/21 tasks | ✅ |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all data flows are real implementations.

## Self-Check: PASSED

Files exist:
- packages/db-context/src/postgres-source.ts ✓
- packages/db-context/src/index.ts ✓
- packages/db-context/src/loader.ts ✓
- packages/db-context/src/types.ts ✓
- packages/db-context/src/postgres-source.test.ts ✓

Commits verified:
- 2b8b978 ✓
- 91e2223 ✓
- 244b2d1 ✓
- 458e7e1 ✓
