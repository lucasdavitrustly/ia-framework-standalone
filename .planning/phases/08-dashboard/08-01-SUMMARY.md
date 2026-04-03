---
phase: 08-dashboard
plan: "01"
subsystem: dashboard-api
tags: [hono, rest-api, websocket, tdd, dependency-injection]
dependency_graph:
  requires: [observability, benchmark, indexer, core, embedding, vector-store]
  provides: [dashboard-api package, REST API endpoints]
  affects: [apps/dashboard, docker-compose]
tech_stack:
  added: [hono, @hono/node-server, chokidar]
  patterns: [factory-pattern, dependency-injection, fire-and-forget, TDD]
key_files:
  created:
    - packages/dashboard-api/src/app.ts
    - packages/dashboard-api/src/app.test.ts
    - packages/dashboard-api/src/routes/status.ts
    - packages/dashboard-api/src/routes/config.ts
    - packages/dashboard-api/src/routes/metrics.ts
    - packages/dashboard-api/src/routes/benchmarks.ts
    - packages/dashboard-api/src/routes/indexing.ts
    - packages/dashboard-api/src/config-watcher.ts
    - packages/dashboard-api/src/indexing-state.ts
    - packages/dashboard-api/src/server.ts
    - packages/dashboard-api/src/index.ts
    - packages/dashboard-api/package.json
    - packages/dashboard-api/tsup.config.ts
    - packages/dashboard-api/tsconfig.json
  modified:
    - packages/observability/src/types.ts
    - packages/observability/src/metrics-store.ts
    - packages/observability/src/metrics-store.test.ts
decisions:
  - "Used TriggerFn = (onProgress) => Promise pattern instead of injecting IndexingPipeline + providers directly — makes testing simple closures"
  - "Used MetricsStoreDep/BenchmarkStoreDep interface aliases via Pick<> to avoid bundling heavy server packages"
  - "Used app.request() for Hono tests instead of testClient() which returns unknown without RPC typed routes"
  - "Mock triggerIndexing uses never-resolving promise to keep state.running=true during assertions"
  - "chokidar v4 requires named imports: import { watch } from 'chokidar' (no default export namespace)"
metrics:
  duration: ~35min
  completed: 2026-04-01
  tasks_completed: 1
  files_created: 14
  files_modified: 3
  tests_added: 22
---

# Phase 8 Plan 01: Dashboard API Package Summary

## One-liner

Hono REST API with DI factory pattern exposing status/config/metrics/benchmarks/indexing endpoints over 15 passing tests.

## What Was Built

Created the complete `@ia-framework/dashboard-api` package — a Hono-based REST API server for the monitoring dashboard. The server exposes 8 JSON endpoints, uses dependency injection for full testability without live databases, and manages in-memory indexing state for fire-and-forget pipeline runs.

**Key architectural decisions:**
- `createApp(deps: AppDependencies)` factory keeps the app fully injectable and testable
- `IndexingStateManager` is a simple in-memory state machine (start/update/complete/fail) — no persistence needed
- `ConfigWatcher` uses chokidar v4 named imports with an initial `start()` load + watch-on-change pattern
- `TriggerFn` closure pattern in `server.ts` wires real providers while tests pass simple mocks

Extended `MetricsStore` with `getEventsByDay()` and `listEvents()` (7 new tests) needed by the metrics route.

## Endpoints Implemented

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/status | Qdrant health + indexing state |
| GET | /api/config | ProjectConfig from ConfigWatcher cache |
| GET | /api/metrics | totals + byStrategy + byDay |
| GET | /api/metrics/events | Paginated RagEvent list |
| GET | /api/benchmarks | List BenchmarkRuns |
| GET | /api/benchmarks/:runId | Single run by ID, 404 if unknown |
| GET | /api/indexing/status | Current IndexingState snapshot |
| POST | /api/indexing/trigger | Fire indexing, returns 202; 409 if running |

## Tests

- 15 tests in `packages/dashboard-api/src/app.test.ts` — all passing
- 7 new tests in `packages/observability/src/metrics-store.test.ts` (27 total)
- Full workspace: 20 test tasks passing

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Mock triggerIndexing resolved immediately causing state.running=false before assertion**
- **Found during:** Task execution (test 11 failing)
- **Issue:** `vi.fn().mockResolvedValue(...)` resolved on next microtask tick, triggering `.then(() => complete())` before test assertion
- **Fix:** Changed mock to `vi.fn().mockReturnValue(new Promise(() => {}))` — never-resolves, keeping state.running=true
- **Files modified:** `packages/dashboard-api/src/app.test.ts`

**2. [Rule 2 - Missing critical functionality] MetricsStore missing getEventsByDay() and listEvents()**
- **Found during:** Writing metrics route
- **Issue:** Plan specified these methods but they didn't exist on MetricsStore
- **Fix:** Added both methods with SQL queries + 7 new tests in observability package
- **Files modified:** `packages/observability/src/metrics-store.ts`, `packages/observability/src/types.ts`, `packages/observability/src/metrics-store.test.ts`

**3. [Rule 3 - Blocking] chokidar v4 no default namespace export**
- **Found during:** config-watcher.ts authoring
- **Issue:** Plan showed `import chokidar from 'chokidar'` but v4 uses named exports only
- **Fix:** Used `import { watch, type FSWatcher } from 'chokidar'`
- **Files modified:** `packages/dashboard-api/src/config-watcher.ts`

**4. [Deviation] AppDependencies uses MetricsStoreDep/BenchmarkStoreDep Pick<> aliases**
- **Issue:** Using full `MetricsStore` and `BenchmarkStore` types in AppDependencies caused issues with unbuilt packages during typecheck
- **Fix:** Used `Pick<MetricsStore, 'getTotalStats' | ...>` inline in app.ts to avoid importing class types
- **Impact:** Cleaner interface, tests work without building observability/benchmark first

## Known Stubs

None — all endpoints return real data from injected dependencies. `server.ts` is the only untested file (integration-level wiring by design).

## Self-Check: PASSED

- [x] `packages/dashboard-api/` exists with all 14 files
- [x] `pnpm --filter @ia-framework/dashboard-api test` — 15/15 passing
- [x] `pnpm --filter @ia-framework/dashboard-api build` — success
- [x] `pnpm --filter @ia-framework/dashboard-api typecheck` — clean
- [x] `pnpm build && pnpm typecheck && pnpm test` — 20 tasks all green
- [x] Commit: `9107202` feat(08-01): dashboard API package with Hono REST server
