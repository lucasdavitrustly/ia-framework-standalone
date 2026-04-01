---
phase: 06-observability
plan: "02"
subsystem: observability, mcp-server, cli
tags: [metrics, token-tracking, rag-events, sqlite, mcp, cli]
dependency_graph:
  requires: [06-01]
  provides: [end-to-end-token-tracking, mcp-observability, cli-observability]
  affects: [mcp-server, cli]
tech_stack:
  added: []
  patterns: [graceful-degradation, optional-observability-config, process-lifetime-session-id]
key_files:
  created:
    - packages/observability/src/session.ts
  modified:
    - packages/mcp-server/package.json
    - packages/mcp-server/src/server.ts
    - packages/mcp-server/src/bin.ts
    - packages/mcp-server/src/tools/search-codebase.ts
    - packages/cli/package.json
    - packages/cli/src/commands/search.command.ts
    - packages/cli/src/commands/status.command.ts
decisions:
  - strategy-field-set-to-mcp-for-both-mcp-and-cli: Both MCP server and CLI label events as strategy 'mcp' since both go through the same retrieval path (SearchEngine). Differentiating them is possible via sessionId prefix if needed in future.
  - graceful-degradation-via-trycatch: All observability calls wrapped in try/catch — search/retrieval must never fail due to metrics errors.
  - metricsstore-per-request-in-cli: CLI opens and closes MetricsStore per invocation (short-lived process pattern). MCP server holds it open for process lifetime.
metrics:
  duration: "~30 minutes"
  completed: "2026-04-01"
  tasks_completed: 3
  files_changed: 8
  tests_added: 0
requirements_addressed: [OBSV-01, OBSV-02, OBSV-03, OBSV-04, OBSV-05]
---

# Phase 06 Plan 02: Wire Observability into MCP Server and CLI — Summary

**One-liner:** End-to-end token tracking wired via `RagEvent` logging in MCP server's `search_codebase` tool and CLI search/status commands, backed by SQLite via `MetricsStore`.

## What Was Built

### Session ID utility (`packages/observability/src/session.ts`)
- `generateSessionId()` returns `YYYY-MM-DD-{pid}` — stable for process lifetime, human-readable
- Exported from `@ia-framework/observability` package index

### MCP Server Observability Wiring
- `McpServerConfig` extended with optional `metricsStore?: MetricsStore`, `tokenCounter?: TokenCounter`, `sessionId?: string`
- `searchCodebaseHandler` receives `ObservabilityConfig` and logs `RagEvent` after each search:
  - Event ID via `crypto.randomUUID()` (Node 22 native)
  - Token count via `TokenCounter.countRagEvent(query, chunkContents)`
  - Strategy: `'mcp'`
  - Graceful degradation: if `metricsStore` absent, logging is silently skipped
- `bin.ts` initializes `MetricsStore`, `TokenCounter`, `generateSessionId` at startup
  - `metricsDbPath = path.join(dirname(configPath), 'metrics.sqlite')` (co-located with `project.json`)

### CLI Observability Wiring
- `search.command.ts`: logs `RagEvent` after each search invocation, opens/closes `MetricsStore` per run, wrapped in try/catch
- `status.command.ts`: added `=== Observability ===` section showing:
  ```
  === Observability ===
  Metrics DB:    /path/to/.ia-framework/metrics.sqlite
  Total Events:  42
  Total Tokens:  18,432
  Sessions:      3
  Avg Tokens/Q:  439
  ```
  Shows "No metrics recorded yet." if `metrics.sqlite` doesn't exist yet

## Commits

| Task | Description | Commit |
| ---- | ----------- | ------ |
| 1-3  | Wire MetricsStore into MCP server and CLI | `b9b2a1b` |

## Verification

- `pnpm build` — 10/10 packages ✅
- `pnpm typecheck` — 10/10 packages ✅
- `pnpm test` — 85 tests passing across all packages ✅

## Deviations from Plan

None — plan executed exactly as written. All tasks completed in a single commit since prior session had already implemented the file changes; this session verified, installed deps, confirmed build/typecheck/tests, and committed.

## Known Stubs

None — all observability data flows from live `MetricsStore` reads. The status command correctly handles the case where `metrics.sqlite` doesn't exist yet (pre-first-search).

## Self-Check: PASSED

- `packages/observability/src/session.ts` — exists ✅
- `packages/mcp-server/src/tools/search-codebase.ts` — RagEvent logging present ✅
- `packages/mcp-server/src/bin.ts` — MetricsStore init present ✅
- `packages/cli/src/commands/search.command.ts` — RagEvent logging present ✅
- `packages/cli/src/commands/status.command.ts` — Observability section present ✅
- Commit `b9b2a1b` — exists ✅
