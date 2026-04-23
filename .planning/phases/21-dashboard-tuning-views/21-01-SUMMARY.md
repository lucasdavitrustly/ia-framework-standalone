---
phase: '21'
plan: '01'
subsystem: 'dashboard-api, benchmark'
tags: ['tuning', 'rag', 'analytics', 'tdd', 'backend']
dependency_graph:
  requires: []
  provides:
    [
      'GET /api/tuning/chunks',
      'GET /api/tuning/scores/:historyId',
      'promptVersion in benchmark-trends',
    ]
  affects: ['dashboard-api', 'benchmark']
tech_stack:
  added: []
  patterns:
    [
      'Hono router factory with deps injection',
      'exactOptionalPropertyTypes adapter pattern',
      'PromptMetadataProvider optional constructor injection',
    ]
key_files:
  created:
    - 'packages/dashboard-api/src/routes/tuning-types.ts'
    - 'packages/dashboard-api/src/routes/tuning.ts'
    - 'packages/dashboard-api/src/routes/tuning.test.ts'
  modified:
    - 'packages/dashboard-api/src/routes/analytics-types.ts'
    - 'packages/dashboard-api/src/routes/analytics.ts'
    - 'packages/dashboard-api/src/routes/analytics.test.ts'
    - 'packages/dashboard-api/src/app.ts'
    - 'packages/benchmark/src/types.ts'
    - 'packages/benchmark/src/benchmark-runner.ts'
decisions:
  - 'Thin search adapter in app.ts to handle exactOptionalPropertyTypes strictness without loosening interface types'
  - 'PromptMetadataProvider is optional constructor arg — no-op when absent, preserves backward compat'
  - 'Near-miss margin is a named constant (NEAR_MISS_MARGIN = 0.1) to satisfy D-10 requirement explicitly'
metrics:
  duration: '~2 sessions'
  completed: '2026-04-23'
  tasks_completed: 2
  files_changed: 10
---

# Phase 21 Plan 01: Tuning Views Backend Summary

## One-liner

Tuning API endpoints (chunk browse + score analysis with near-miss) and prompt version tracking in benchmark-trends, using TDD RED-GREEN cycle.

## What Was Built

### New Endpoints (`/api/tuning`)

- **`GET /api/tuning/chunks`** — Paginated chunk browser. Query params: `collection` (default `llm`), `minQuality`, `limit` (default 50), `offset`. Returns `ChunkBrowseResponse { chunks, total }`.
- **`GET /api/tuning/scores/:historyId`** — Re-runs the original query at `scoreThreshold=0` to get all candidates, then partitions into above/below threshold and marks near-misses (within 10% below threshold per D-10). Returns `ScoreAnalysisResponse { query, threshold, candidates, returnedCount, filteredCount, nearMissCount }`.

### Extended Analytics

- `GET /api/analytics/benchmark-trends` now includes `promptVersion` and `promptContentHash` fields per data point when present in `configSnapshot`.

### BenchmarkRunner Metadata Capture

- Added optional `PromptMetadataProvider` constructor injection to `BenchmarkRunner`. When provided, `run()` and `runBaseline()` merge `{ promptVersion, promptContentHash }` into the `configSnapshot` stored on the run result.

## Commits

| Hash      | Type | Description                                                             |
| --------- | ---- | ----------------------------------------------------------------------- |
| `b8005d0` | test | RED — failing tests for tuning endpoints and prompt version analytics   |
| `6b231b5` | feat | GREEN — implement tuning routes, extend analytics, wire BenchmarkRunner |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] exactOptionalPropertyTypes incompatibility in app.ts**

- **Found during:** Task 2
- **Issue:** `MultiCollectionSearchEngine.search()` returns `source: "ast" | "llm" | undefined` (always-present key), but `TuningSearchEngineDep` declares `source?: string` (optionally-absent key). With `exactOptionalPropertyTypes: true` these are incompatible.
- **Fix:** Thin inline adapter in `app.ts` that uses spread conditionals (`...(r.source !== undefined ? { source: r.source } : {})`) to produce the correct optional shape.
- **Files modified:** `packages/dashboard-api/src/app.ts`
- **Commit:** `6b231b5`

## Known Stubs

None — both endpoints are fully wired. The `vectorStore.scrollChunks` dependency is injected, so the chunk browse endpoint returns real data when `MultiCollectionSearchEngine` implements `scrollChunks`. If it doesn't implement `scrollChunks` yet, the dependency injection will surface that at wiring time (not a silent stub).

## Self-Check: PASSED
