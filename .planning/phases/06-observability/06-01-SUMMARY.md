---
phase: 06-observability
plan: "01"
subsystem: observability
tags: [observability, sqlite, token-counting, metrics, tdd, better-sqlite3]
dependency_graph:
  requires: [04-01-retrieval, 04-02-mcp-server]
  provides: [RagEvent, TokenCounter, MetricsStore, generateSessionId]
  affects: [06-02-wiring]
tech_stack:
  added:
    - better-sqlite3@^12.8.0
    - "@types/better-sqlite3@^7.6.0"
  patterns: [TDD red-green, synchronous SQLite API, chars/token heuristic for local LLMs, pnpm onlyBuiltDependencies for native modules]
key_files:
  created:
    - packages/observability/package.json
    - packages/observability/tsconfig.json
    - packages/observability/tsup.config.ts
    - packages/observability/src/types.ts
    - packages/observability/src/token-counter.ts
    - packages/observability/src/token-counter.test.ts
    - packages/observability/src/metrics-store.ts
    - packages/observability/src/metrics-store.test.ts
    - packages/observability/src/session.ts
    - packages/observability/src/index.ts
  modified:
    - package.json (added better-sqlite3 to onlyBuiltDependencies)
    - pnpm-lock.yaml
decisions:
  - "TokenCounter uses ceil(length/charsPerToken) heuristic — simple, dependency-free, good enough for cost-visibility estimates with Ollama local models"
  - "MetricsStore uses better-sqlite3 synchronous API — no async overhead, perfect for single-user internal tooling"
  - "MetricsStore accepts ':memory:' for dbPath — enables clean Vitest tests without temp file management"
  - "better-sqlite3 requires native compilation — added to pnpm.onlyBuiltDependencies in root package.json"
  - "Session ID format: YYYY-MM-DD-{pid} — human-readable date + unique per process"
metrics:
  duration: "~12 minutes"
  completed: "2026-04-01"
  tasks_completed: 3
  files_created: 10
---

# Phase 06 Plan 01: Observability Package Summary

**One-liner:** TDD-built `@ia-framework/observability` package with a chars/token TokenCounter and a better-sqlite3 MetricsStore that logs RagEvents and returns per-session, per-strategy, and total stats.

## What Was Done

Created the `@ia-framework/observability` package from scratch using TDD:
- **types.ts**: RagEvent, SessionStats, StrategyStats, TotalStats interfaces
- **token-counter.ts**: `TokenCounter` class — estimates tokens via `ceil(chars/4)` heuristic, with `count(text)` and `countRagEvent(query, chunks)` methods
- **metrics-store.ts**: `MetricsStore` class — SQLite-backed event log via `better-sqlite3`. Schema: `rag_events` table with indexes on `session_id`, `strategy`, `timestamp`. Methods: `logEvent`, `getSessionStats`, `getStrategyStats`, `getTotalStats`, `close`
- **session.ts**: `generateSessionId()` — returns `YYYY-MM-DD-{pid}` (stable for process lifetime)
- **index.ts**: re-exports all public API

## TDD Cycle

| Phase | Result |
|-------|--------|
| RED (token-counter.test.ts) | 9 tests written, 0 pass (no implementation) |
| GREEN (token-counter.ts) | 9 tests pass |
| RED (metrics-store.test.ts) | 12 tests written, all fail (stub throws Error) |
| GREEN (metrics-store.ts) | 12 tests pass with better-sqlite3 implementation |

## Tasks Completed

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Package scaffold + TokenCounter TDD | 0ee8c60 |
| 2 | MetricsStore TDD with better-sqlite3 | 0ee8c60 |
| 3 | Build integration + full workspace verification | 0ee8c60 |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] better-sqlite3 native module not compiled after pnpm install**
- **Found during:** Task 3 (running tests — module loaded but missing .node binary)
- **Issue:** pnpm install skips native build scripts unless explicitly allowed via `onlyBuiltDependencies`
- **Fix:** Added `"better-sqlite3"` to `pnpm.onlyBuiltDependencies` in root `package.json`, then ran `pnpm rebuild better-sqlite3`
- **Files modified:** `package.json`
- **Commit:** 0ee8c60

## Known Stubs

None — all implementations are real. Session.ts is simple but complete.

## Self-Check: PASSED

- `packages/observability/dist/index.js` → FOUND ✅
- `packages/observability/dist/index.d.ts` → FOUND ✅
- `pnpm --filter @ia-framework/observability test` → 21/21 pass ✅
- `pnpm build` → 10 packages, 0 errors ✅
- `pnpm typecheck` → 16 packages, 0 errors ✅
- `pnpm test` → all packages pass ✅
- Commit 0ee8c60 → FOUND ✅
