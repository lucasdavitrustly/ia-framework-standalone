---
phase: 04-mcp-server
plan: "02"
subsystem: mcp-server
tags: [mcp-server, stdio-transport, tools, search-codebase, get-file, get-dependencies, tdd]
dependency_graph:
  requires: [04-01-retrieval, 01-02-core]
  provides: [@ia-framework/mcp-server]
  affects: [04-03-integration-verification]
tech_stack:
  added: ["@ia-framework/embedding", "@ia-framework/vector-store (bin.ts runtime deps)"]
  patterns: [MCP tool registration, handler function extraction for testability, StdioServerTransport wiring]
key_files:
  created:
    - packages/mcp-server/src/tools/search-codebase.ts
    - packages/mcp-server/src/tools/get-file.ts
    - packages/mcp-server/src/tools/get-dependencies.ts
    - packages/mcp-server/src/server.ts
    - packages/mcp-server/src/server.test.ts
    - packages/mcp-server/src/index.ts
    - packages/mcp-server/src/bin.ts
    - packages/mcp-server/package.json
    - packages/mcp-server/tsconfig.json
    - packages/mcp-server/tsup.config.ts
  modified: []
decisions:
  - "Handler functions exported separately (searchCodebaseHandler, getFileHandler, getDependenciesHandler) for direct testability without MCP transport"
  - "bin.ts uses IA_FRAMEWORK_CONFIG env var fallback to .ia-framework/project.json in cwd — supports both custom paths and convention-based discovery"
  - "Added @ia-framework/embedding and @ia-framework/vector-store as explicit package.json deps (bin.ts runtime imports require them)"
metrics:
  duration: "~15 minutes"
  completed: "2026-04-01"
  tasks_completed: 3
  files_created: 10
---

# Phase 04 Plan 02: MCP Server Summary

**One-liner:** `@ia-framework/mcp-server` with `createMcpServer()` factory registering three MCP tools (`search_codebase`, `get_file`, `get_dependencies`) and a stdio binary entrypoint for OpenCode integration.

## What Was Built

`@ia-framework/mcp-server` — the primary integration point with OpenCode. It uses `@modelcontextprotocol/sdk` to expose three tools over StdioServerTransport (JSON-RPC 2.0), each delegating to `SearchEngine` from `@ia-framework/retrieval` and formatting results as human-readable markdown.

### Key Components

| File | Purpose |
|------|---------|
| `src/tools/search-codebase.ts` | `searchCodebaseHandler()` + `registerSearchCodebaseTool()` — natural language search with markdown result formatting |
| `src/tools/get-file.ts` | `getFileHandler()` + `registerGetFileTool()` — retrieve all chunks for a file as sequential code blocks |
| `src/tools/get-dependencies.ts` | `getDependenciesHandler()` + `registerGetDependenciesTool()` — extract unique imports/exports from all file chunks |
| `src/server.ts` | `createMcpServer(config)` factory — registers all 3 tools on an McpServer instance |
| `src/server.test.ts` | 8 TDD tests using mock SearchEngine (vi.fn()) |
| `src/bin.ts` | stdio binary entrypoint — loads config, wires embedding+Qdrant+SearchEngine, connects StdioServerTransport |
| `src/index.ts` | Package barrel export |

## Tasks Completed

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Package scaffold (package.json, tsconfig, tsup) — already existed from Phase 4 setup | 10b2a05 |
| 2 | MCP tool handlers TDD (RED→GREEN, 8 tests) — already existed from Phase 4 setup | 10b2a05 |
| 3 | Binary entrypoint (bin.ts) + build (dist/) | da97f3d |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing] @ia-framework/embedding and @ia-framework/vector-store not in package.json**
- **Found during:** Task 3 (bin.ts creation)
- **Issue:** `bin.ts` imports `createEmbeddingProvider` and `QdrantVectorStore` but package.json only listed `@ia-framework/core` and `@ia-framework/retrieval` as dependencies
- **Fix:** Added `@ia-framework/embedding` and `@ia-framework/vector-store` to package.json dependencies, ran `pnpm install`
- **Commit:** da97f3d

## Known Stubs

None.

## Self-Check: PASSED

- `packages/mcp-server/src/server.ts` → FOUND ✅
- `packages/mcp-server/src/server.test.ts` → FOUND ✅
- `packages/mcp-server/src/tools/search-codebase.ts` → FOUND ✅
- `packages/mcp-server/src/tools/get-file.ts` → FOUND ✅
- `packages/mcp-server/src/tools/get-dependencies.ts` → FOUND ✅
- `packages/mcp-server/src/bin.ts` → FOUND ✅
- `packages/mcp-server/dist/index.js` → FOUND ✅
- `packages/mcp-server/dist/index.d.ts` → FOUND ✅
- `packages/mcp-server/dist/bin.js` → FOUND ✅
- 8/8 tests pass → ✅
- Commit da97f3d → FOUND ✅
