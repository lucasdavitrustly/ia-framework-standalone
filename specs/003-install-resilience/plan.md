# Implementation Plan: Install Script Resilience & Defaults

**Branch**: `003-install-resilience` | **Date**: 2026-06-03 | **Spec**: `specs/003-install-resilience/spec.md`

**Input**: Feature specification from `/specs/003-install-resilience/spec.md`

## Summary

Harden the `install.sh` installer with an upfront Node.js 22+ active-version gate, update `init-config.sh` to write correct defaults (multi-repo format, `qwen3-embedding:0.6b` with prefixes, `localhost` vector store host), add MCP server log capture with a dashboard Logs page for debugging startup failures.

## Technical Context

**Language/Version**: Bash (install scripts), TypeScript strict mode (dashboard API + frontend)

**Primary Dependencies**: Hono (dashboard-api), React 19 + Vite + Tailwind (dashboard frontend), pino (MCP server logging)

**Storage**: File-based logs (`.ia-framework/logs/mcp-server.log`), JSON config (`.ia-framework/project.json`)

**Testing**: Vitest (TypeScript packages), manual testing (bash scripts)

**Target Platform**: macOS / Linux (Node.js 22+)

**Project Type**: Monorepo (pnpm workspaces) — CLI + MCP server + Dashboard

**Performance Goals**: Log API response < 200ms for 100 lines

**Constraints**: Local-first, no external services, bash-only installer

**Scale/Scope**: Single developer local install

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                  | Status | Notes                                                                           |
| -------------------------- | ------ | ------------------------------------------------------------------------------- |
| I. TDD                     | PASS   | Vitest tests required for dashboard API logs endpoint and frontend Logs page    |
| II. TypeScript-Only        | PASS   | All new TS code strict; bash scripts are infrastructure, not source             |
| III. Local-First           | PASS   | All functionality local (file logs, localhost defaults)                         |
| IV. Monorepo Architecture  | PASS   | Changes touch existing packages (dashboard-api, dashboard app, install scripts) |
| V. Simplicity              | PASS   | File-based logs + polling — no WebSocket, no heavy log framework                |
| VI. Incremental by Default | N/A    | Not an indexing feature                                                         |
| VII. MCP-First Interface   | PASS   | MCP server gets log redirection; dashboard is for human debugging               |

**Gate Result**: PASS — no violations.

## Project Structure

### Documentation (this feature)

```text
specs/003-install-resilience/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── contracts/           # Phase 1 output
```

### Source Code (repository root)

```text
scripts/
├── check-prerequisites.sh   # MODIFY: enhanced Node version gate
├── init-config.sh           # MODIFY: repos format, prefixes, localhost host
├── configure-opencode.sh    # MODIFY: stderr redirect to log file

packages/dashboard-api/src/
├── routes/
│   └── logs.ts              # NEW: GET /api/logs endpoint
└── app.ts                   # MODIFY: register logs route

apps/dashboard/src/
├── pages/
│   └── LogsPage.tsx         # NEW: Logs viewer UI
├── api/
│   └── logs.ts              # NEW: API client for logs
└── App.tsx                  # MODIFY: add Logs route + nav

install.sh                   # MODIFY: log dir setup, truncation
```

**Structure Decision**: Changes distributed across existing packages — no new packages needed.

## Complexity Tracking

No constitution violations requiring justification.
