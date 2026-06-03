# Implementation Plan: MCP Usage Dashboard

**Branch**: `005-mcp-usage-dashboard` | **Date**: 2026-06-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/005-mcp-usage-dashboard/spec.md`

## Summary

Extend the existing observability infrastructure to capture full MCP request/response data (not just search events), and expose it through the dashboard API. Currently, only `search_codebase` logs metrics on its semantic path. This plan extends logging to all MCP tool calls, captures response content, and adds new dashboard endpoints for browsing request history with full response bodies.

## Technical Context

**Language/Version**: TypeScript (strict mode), Node.js >= 22.0.0

**Primary Dependencies**: Hono (dashboard API), @modelcontextprotocol/sdk (MCP server), better-sqlite3 (metrics), Zod 4 (validation)

**Storage**: SQLite via better-sqlite3 (embedded, file: `.ia-framework/metrics.sqlite`)

**Testing**: Vitest (unit + integration), in-memory SQLite for store tests

**Target Platform**: Local developer machine (macOS/Linux)

**Project Type**: Monorepo (pnpm workspace) — library + CLI + MCP server + dashboard API

**Performance Goals**: <50ms recording overhead per MCP tool call; dashboard queries return in <200ms for 10k events

**Constraints**: Non-blocking recording (observability must never break tool responses); local-only; no auth

**Scale/Scope**: Single developer, thousands of requests over days/weeks

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                  | Status | Notes                                                                |
| -------------------------- | ------ | -------------------------------------------------------------------- |
| I. TDD                     | PASS   | Tests will be written first for new store methods and API routes     |
| II. TypeScript-Only        | PASS   | All new code in TypeScript strict                                    |
| III. Local-First           | PASS   | SQLite storage, no external services                                 |
| IV. Monorepo Architecture  | PASS   | Extends existing packages (observability, mcp-server, dashboard-api) |
| V. Simplicity              | PASS   | Extending existing MetricsStore pattern; no new abstractions         |
| VI. Incremental by Default | N/A    | Not an indexing feature                                              |
| VII. MCP-First Interface   | PASS   | Captures MCP tool call data; enhances MCP observability              |

No violations. All gates pass.

## Project Structure

### Documentation (this feature)

```text
specs/005-mcp-usage-dashboard/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (dashboard API contracts)
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
packages/observability/src/
├── metrics-store.ts          # Extend with mcp_requests table + methods
├── metrics-store.test.ts     # New tests for request logging
└── index.ts                  # Export new types

packages/mcp-server/src/
├── server.ts                 # Add request/response interceptor
├── request-logger.ts         # NEW: middleware to capture all tool calls
└── request-logger.test.ts    # NEW: tests

packages/dashboard-api/src/routes/
├── requests.ts               # NEW: API routes for MCP request history
└── requests.test.ts          # NEW: tests
```

### Frontend (dashboard app)

```text
apps/dashboard/src/
├── api/client.ts             # Extend with MCP request types + API methods
├── pages/TokenUsage.tsx      # REWRITE: replace RAG metrics with MCP request data
├── components/
│   ├── McpDailyChart.tsx     # NEW: daily input vs output tokens (Recharts AreaChart)
│   └── McpRequestTable.tsx   # NEW: paginated table with expandable response rows
```

**Structure Decision**: Extends three existing packages plus the dashboard app. No new packages needed. The request-logging middleware lives in mcp-server since it intercepts tool calls at that layer. Storage schema extends the existing MetricsStore in observability. Dashboard API adds a new route module following existing patterns. The frontend replaces the old RAG-only `/tokens` page with unified MCP request data.
