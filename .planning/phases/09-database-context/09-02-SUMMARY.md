---
phase: "09"
plan: "02"
subsystem: "mcp-server, cli, dashboard-api, dashboard"
tags: ["database", "mcp-tools", "cli", "dashboard", "postgres"]
dependency-graph:
  requires: ["09-01"]
  provides: ["query_database MCP tool", "index_database_schema MCP tool", "db CLI subcommand", "/api/db/status endpoint", "Dashboard DB status card"]
  affects: ["mcp-server", "cli", "dashboard-api", "apps/dashboard"]
tech-stack:
  added: []
  patterns: ["injectable constructor pattern for testability", "Hono router factory with deps injection", "class mock pattern for Vitest (not vi.fn().mockReturnValue)"]
key-files:
  created:
    - packages/mcp-server/src/tools/query-database.ts
    - packages/mcp-server/src/tools/query-database.test.ts
    - packages/mcp-server/src/tools/index-database-schema.ts
    - packages/mcp-server/src/tools/index-database-schema.test.ts
    - packages/cli/src/commands/db.command.ts
    - packages/cli/src/commands/db.command.test.ts
    - packages/dashboard-api/src/routes/db.ts
    - packages/dashboard-api/src/routes/db.test.ts
  modified:
    - packages/mcp-server/src/server.ts
    - packages/mcp-server/src/bin.ts
    - packages/cli/src/bin.ts
    - packages/cli/package.json
    - packages/dashboard-api/src/app.ts
    - packages/dashboard-api/package.json
    - apps/dashboard/src/api/client.ts
    - apps/dashboard/src/pages/Overview.tsx
decisions:
  - "Used class mock pattern (not vi.fn().mockReturnValue) for PostgresSource constructor in tests — vi.fn with new keyword does not return the mocked value in Vitest"
  - "dbRouter accepts optional loadDbConfigFn and PostgresSourceCtor for full testability without vi.mock()"
  - "DB status card uses neutral gray (not configured), green (connected), red (disconnected) — consistent with plan spec"
metrics:
  duration: "~25 minutes"
  completed: "2026-04-01"
  tasks: 4
  files: 12
---

# Phase 09 Plan 02: MCP Tools + CLI + Dashboard Summary

MCP query/index tools, CLI db subcommand, and dashboard /api/db/status endpoint + Overview status card wired end-to-end.

## Tasks Completed

| # | Task | Commit | Key Files |
|---|------|--------|-----------|
| 1 | MCP tools: query_database + index_database_schema | `5d72e93` | tools/query-database.ts, tools/index-database-schema.ts, server.ts, bin.ts |
| 2 | CLI `db` subcommand (configure/connect/index/status) | `2ac1d57` | commands/db.command.ts, cli/bin.ts |
| 3 | Dashboard API `/api/db/status` endpoint | `95314a4` | routes/db.ts, routes/db.test.ts, app.ts, dashboard-api/package.json |
| 4 | Dashboard Overview DB status card | `fa0fc74` | api/client.ts, pages/Overview.tsx |

## What Was Built

### MCP Tools (Task 1)
- **`query_database`**: executes arbitrary SQL against the configured PostgreSQL database; returns rows as JSON; graceful degradation when DB not configured.
- **`index_database_schema`**: triggers `IndexingPipeline` with `PostgresSource` as a `contextSource`, embedding table/view schema chunks into Qdrant.
- `McpServerConfig` extended with `dbConfigPath?` and `configPath?`; both tools conditionally registered when `dbConfigPath` is set.
- `bin.ts` computes `frameworkDir` and `dbConfigPath` and passes them to `createMcpServer()`.

### CLI db Subcommand (Task 2)
- `ia-framework db configure` — interactive prompts to write `db.json` config
- `ia-framework db connect` — tests connection and prints table count
- `ia-framework db index` — triggers schema indexing via `IndexingPipeline`
- `ia-framework db status` — reads `db.json` and prints connection status

### Dashboard API `/api/db/status` (Task 3)
- `GET /api/db/status` → `{ configured, connected, tableCount, error? }`
- `DbConfigNotFoundError` → `{ configured: false, connected: false, tableCount: null }`
- Connection attempt always followed by `close()` in `try/finally`
- `dbRouter` mounted at `/api/db` in `createApp()`
- Added `@ia-framework/db-context` as dependency to `dashboard-api`

### Dashboard DB Status Card (Task 4)
- `ApiDbStatus` interface + `getDbStatus()` added to `DashboardClient`
- `Overview.tsx` fetches DB status alongside other data
- Status card: gray dot (not configured), green dot + table count (connected), red dot + error message (disconnected)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Vitest mock pattern for PostgresSource constructor in db.test.ts**
- **Found during:** Task 3 (GREEN phase)
- **Issue:** `vi.fn().mockReturnValue(instance)` does NOT return the mocked value when called via `new` in Vitest. The test was written with this broken pattern in the previous session.
- **Fix:** Changed `MockPostgresSourceCtor` from `vi.fn().mockReturnValue(obj)` to `class MockPostgresSource { testConnection = mockFn; close = mockFn; }` pattern
- **Files modified:** `packages/dashboard-api/src/routes/db.test.ts`
- **Commit:** `95314a4`

## Known Stubs

None — all data is wired to real API endpoints.

## Test Coverage

| Package | Tests Before | Tests After | New Tests |
|---------|-------------|-------------|-----------|
| mcp-server | 8 | 17 | 9 (query-database: 5, index-database-schema: 4) |
| cli | 6 | 15 | 9 (db.command: 9) |
| dashboard-api | 15 | 20 | 5 (db route: 5) |

## Self-Check: PASSED

**Files verified:**
- `packages/mcp-server/src/tools/query-database.ts` ✓
- `packages/mcp-server/src/tools/index-database-schema.ts` ✓
- `packages/cli/src/commands/db.command.ts` ✓
- `packages/dashboard-api/src/routes/db.ts` ✓
- `apps/dashboard/src/api/client.ts` ✓
- `apps/dashboard/src/pages/Overview.tsx` ✓

**Commits verified:**
- `5d72e93` ✓ MCP tools
- `2ac1d57` ✓ CLI db subcommand
- `95314a4` ✓ Dashboard API /api/db/status
- `fa0fc74` ✓ Dashboard DB status card

**Build:** 14/14 tasks successful ✓  
**Tests:** 22/22 tasks pass — 52 total tests across mcp-server (17), cli (15), dashboard-api (20) ✓
