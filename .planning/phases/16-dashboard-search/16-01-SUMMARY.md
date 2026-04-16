---
plan: 16-01
phase: 16-dashboard-search
status: completed
completed_at: '2026-04-14T21:30:00.000Z'
commits:
  - 000e13e: 'feat(16-01): search route handler with POST / and GET /collections'
  - 8cb2f56: 'feat(16-01): wire search engine into dashboard-api app and server'
---

# Plan 16-01 Summary

## What Was Done

Created the dashboard backend search API and wired the search engine into the DI factory.

### Task 1: Search route handler (TDD)

- Created `packages/dashboard-api/src/routes/search.ts` exporting `searchRouter(deps: SearchDeps): Hono`
- POST `/api/search` — accepts `{ query, limit, scoreThreshold, collections }`, routes to correct engine (ast/llm/both), returns `{ results, metrics }`
- GET `/api/search/collections` — returns available collection info with name, type, chunkCount
- Result DTO excludes imports/exports arrays per D-24
- Metrics include latencyMs, chunksScanned, resultsReturned, scoreRange per D-16
- 10 unit tests, all GREEN

### Task 2: DI wiring

- Extended `AppDependencies` in `app.ts` with optional `search` field
- Conditionally mounts `/api/search` router when `search` deps are present
- Added collection discovery block to `server.ts` at startup, mirroring `mcp-server/bin.ts` pattern
- Fixed `DependencyGraph` type mismatch: wrapped synchronous `getNeighborFiles` in a `Promise.resolve()` adapter to satisfy the async interface expected by `SearchEngine`

## Key Decision

**DependencyGraph async adapter** (new):  
`DependencyGraph.getNeighborFiles` is synchronous (`string[]`) but `SearchEngineConfig.dependencyGraph` expects async (`Promise<string[]>`). Rather than modifying the `DependencyGraph` class (would affect other consumers), `server.ts` wraps the instance: `{ getNeighborFiles: (p, h) => Promise.resolve(rawGraph.getNeighborFiles(p, h)) }`.

## Test Results

- 39/39 tests pass in `@ia-framework/dashboard-api`
- TypeScript typecheck: 0 errors
