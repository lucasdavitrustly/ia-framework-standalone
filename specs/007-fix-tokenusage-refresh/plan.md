# Implementation Plan: Fix TokenUsage Page Stale Data

**Branch**: `007-fix-tokenusage-refresh` | **Date**: 2026-06-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/007-fix-tokenusage-refresh/spec.md`

## Summary

Fix the TokenUsage dashboard page not showing new MCP server metrics. Root cause: the `MetricsStore` SQLite database does not enable WAL (Write-Ahead Logging) mode, causing the dashboard API process to not see writes from the MCP server process. Secondary fix: add a polling mechanism to the TokenUsage page so it auto-refreshes without manual browser reload.

## Technical Context

**Language/Version**: TypeScript (strict mode), Node.js >= 22

**Primary Dependencies**: better-sqlite3 (SQLite), React 19, Hono

**Storage**: SQLite via better-sqlite3 (`metrics.sqlite` in `.ia-framework/`)

**Testing**: Vitest

**Target Platform**: macOS/Linux (local dev tool)

**Project Type**: Monorepo (packages/observability, packages/dashboard-api, apps/dashboard)

**Performance Goals**: N/A (local single-user tool)

**Constraints**: Must not break existing MetricsStore consumers; polling must not create memory leaks

**Scale/Scope**: 2 files modified (MetricsStore + TokenUsage page), 1 test file added/updated

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                  | Status | Notes                                                                                 |
| -------------------------- | ------ | ------------------------------------------------------------------------------------- |
| I. TDD                     | PASS   | Unit test for WAL mode initialization; integration test for cross-process visibility. |
| II. TypeScript-Only        | PASS   | All changes in TypeScript.                                                            |
| III. Local-First           | PASS   | SQLite is local, no external services.                                                |
| IV. Monorepo Architecture  | PASS   | Changes span 2 packages (observability, dashboard) — proper boundaries maintained.    |
| V. Simplicity              | PASS   | Single pragma addition + simple setInterval polling. No abstractions introduced.      |
| VI. Incremental by Default | N/A    | Not an indexing operation.                                                            |
| VII. MCP-First Interface   | N/A    | This fixes the observability layer, not the MCP tool interface itself.                |

No violations. Gate passes.

## Project Structure

### Documentation (this feature)

```text
specs/007-fix-tokenusage-refresh/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
packages/observability/src/
└── metrics-store.ts          # Add WAL pragma in initialize()

packages/observability/src/
└── metrics-store.test.ts     # Test WAL mode is enabled (new or extended)

apps/dashboard/src/pages/
└── TokenUsage.tsx            # Add polling interval

apps/dashboard/src/pages/
└── TokenUsage.test.tsx       # Test polling behavior (new)
```

**Structure Decision**: Existing monorepo structure. Changes are minimal edits to existing files.
