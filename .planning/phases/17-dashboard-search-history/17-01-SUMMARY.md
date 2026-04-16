---
phase: 17-dashboard-search-history
plan: 01
status: complete
commits:
  - 69ca2bf feat(17-01): implement SearchHistoryStore with SQLite persistence
  - 9f3c16a feat(17-01): wire search history API routes and DI into dashboard-api
---

## Summary

Plan 17-01 delivered the full backend persistence layer for search history.

### What was built

**Task 1: SearchHistoryStore (TDD)**

- `packages/dashboard-api/src/search-history-store.ts` — SQLite-backed store with `search_history` table, 3 indexes, and full CRUD
- `packages/dashboard-api/src/search-history-store.test.ts` — 11 tests covering save, get, list (with all filter/sort/pagination combinations), delete, and clearAll
- Added `better-sqlite3` and `@types/better-sqlite3` as direct dependencies of `dashboard-api`

**Task 2: API routes + DI wiring**

- `packages/dashboard-api/src/routes/search.ts` — Rewrote with `searchHistoryStore?: SearchHistoryStore` in `SearchDeps`, auto-save on POST `/`, and 5 new history endpoints:
  - `GET /api/search/history` — list with filtering (q, collection, date range, minScore) and pagination
  - `GET /api/search/history/:id` — retrieve single entry
  - `POST /api/search/history/:id/replay` — re-execute query, return original vs fresh results
  - `DELETE /api/search/history/:id` — delete single entry
  - `DELETE /api/search/history` — clear all
- `packages/dashboard-api/src/app.ts` — added `searchHistoryStore?: SearchHistoryStore` to `AppDependencies.search` interface
- `packages/dashboard-api/src/server.ts` — instantiates `SearchHistoryStore` from `search-history.sqlite`, wires it into `searchDeps`, closes on SIGTERM

### Deviations

- **Rule 3 (Blocking):** `better-sqlite3` was not listed as a direct dependency of `dashboard-api` — added via `pnpm add better-sqlite3 @types/better-sqlite3 --filter @ia-framework/dashboard-api`
- **TypeScript strictness:** `exactOptionalPropertyTypes: true` required a `mapResult()` helper that conditionally adds `description` only when defined (cannot use `description: r.name ?? undefined` pattern)
- **GET /history param building:** Params built by conditional property assignment (not `|| undefined`) to satisfy `exactOptionalPropertyTypes`

### Test results

```
Test Files  5 passed (5)
     Tests  50 passed (50)
  Duration  420ms
```

TypeScript compiles without errors (`npx tsc --noEmit`).
