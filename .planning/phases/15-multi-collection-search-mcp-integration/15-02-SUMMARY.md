---
phase: 15-multi-collection-search-mcp-integration
plan: '02'
subsystem: mcp-server, cli
tags: [multi-collection, mcp, cli, source-tags, collection-discovery]
dependency_graph:
  requires: [15-01]
  provides: [mcp-multi-collection-search, cli-multi-collection-search]
  affects: [packages/mcp-server, packages/cli]
tech_stack:
  added: ['@qdrant/js-client-rest in mcp-server and cli packages']
  patterns: [collection-discovery-at-startup, duck-typed-engine-config, source-tag-rendering]
key_files:
  created: []
  modified:
    - packages/mcp-server/src/bin.ts
    - packages/mcp-server/src/server.ts
    - packages/mcp-server/src/tools/search-codebase.ts
    - packages/mcp-server/src/tools/search-codebase-hybrid.ts
    - packages/mcp-server/src/tools/get-file.ts
    - packages/cli/src/commands/search.command.ts
    - packages/cli/package.json
decisions:
  - 'McpServerConfig.searchEngine widened to SearchEngine | MultiCollectionSearchEngine via duck typing — avoids breaking server.ts tool registrations'
  - 'dependencyGraph wired only to AST engines inside collectionEngines; LLM engines receive undefined (LLM chunks have empty imports/exports)'
  - '@qdrant/js-client-rest added explicitly to both mcp-server and cli packages (was only in vector-store)'
metrics:
  duration: '~45 minutes (continuation from prior session)'
  completed: '2026-04-14'
  tasks_completed: 2
  files_modified: 7
---

# Phase 15 Plan 02: MCP + CLI Multi-Collection Wiring Summary

**One-liner:** Multi-collection search wired into MCP server and CLI via QdrantClient collection discovery, MultiCollectionSearchEngine, and [ast]/[llm] source tag rendering in all output formatters.

## What Was Built

### Task 1: Collection Discovery + MCP Wiring

- **`packages/mcp-server/src/bin.ts`** — Complete rewrite: uses `QdrantClient.collectionExists()` to probe for `{base}` (AST) and `{base}-llm` (LLM) collections at startup. Creates one `SearchEngine` per existing collection, wraps all in `MultiCollectionSearchEngine`, passes to `createMcpServer`. Fails gracefully with helpful error if no collections exist.
- **`packages/mcp-server/src/server.ts`** — `McpServerConfig.searchEngine` type widened from `SearchEngine` to `SearchEngine | MultiCollectionSearchEngine` — both satisfy the tool duck types.
- **`packages/mcp-server/package.json`** — Added `@qdrant/js-client-rest` dependency (was missing; only existed in vector-store).

### Task 2: Source Tags + CLI Wiring

- **`packages/mcp-server/src/tools/search-codebase.ts`** — `formatResult` adds ` [ast]` or ` [llm]` suffix after the `[text]` vector tag when `result.source` is set.
- **`packages/mcp-server/src/tools/search-codebase-hybrid.ts`** — Same pattern: ` [ast]`/` [llm]` appended after ` [hybrid]` tag.
- **`packages/mcp-server/src/tools/get-file.ts`** — Chunk section headers include source tag when present: `### funcType: name (lines X-Y) [ast]`.
- **`packages/cli/src/commands/search.command.ts`** — Full rewrite with identical multi-collection discovery pattern as `bin.ts`. Console output line format: `─── file.ts (function) [score: 0.850, matched: text] [llm]`.
- **`packages/cli/package.json`** — Added `@qdrant/js-client-rest` dependency.

## Verification Results

```
Tasks:    12 successful, 12 total   (turbo build)
Tasks:    13 successful, 13 total   (turbo typecheck)
Tests:    54 passed, 4 test files   (turbo test @ia-framework/retrieval)
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Dependency] Added @qdrant/js-client-rest to CLI package**

- **Found during:** Task 2 — TypeScript error `Cannot find module '@qdrant/js-client-rest'`
- **Issue:** `packages/cli/package.json` did not list `@qdrant/js-client-rest` — the package was only a dependency of `@ia-framework/vector-store`. Direct imports in CLI required it to be explicit.
- **Fix:** `pnpm add @qdrant/js-client-rest --filter @ia-framework/cli`
- **Files modified:** `packages/cli/package.json`, `pnpm-lock.yaml`
- **Commit:** 97917b6

(Same issue was fixed for `mcp-server` in Task 1 — `0534a97`)

**2. [Rule 1 - Bug] exactOptionalPropertyTypes workaround for dependencyGraph**

- **Found during:** Task 1 TypeScript check
- **Issue:** `exactOptionalPropertyTypes: true` in tsconfig caused type error when passing `dependencyGraph` directly to `MultiCollectionSearchEngine` constructor when it could be `undefined`.
- **Fix:** Used spread conditional: `...(dependencyGraph !== undefined ? { dependencyGraph } : {})`
- **Files modified:** `packages/mcp-server/src/bin.ts`, `packages/cli/src/commands/search.command.ts`
- **Commit:** 0534a97, 97917b6

## Commits

| Hash      | Message                                                                                |
| --------- | -------------------------------------------------------------------------------------- |
| `0534a97` | `feat(15-02): collection discovery + MultiCollectionSearchEngine wiring in MCP server` |
| `97917b6` | `feat(15-02): source tag rendering in MCP tools + CLI multi-collection search`         |

## Success Criteria Verification

| Criterion                                                                 | Status |
| ------------------------------------------------------------------------- | ------ |
| MCP bin.ts discovers AST + LLM collections via collectionExists (RETR-08) | ✅     |
| MCP tools use MultiCollectionSearchEngine for all searches (RETR-08)      | ✅     |
| Source tags [ast]/[llm] appear in MCP formatted output (RETR-10)          | ✅     |
| CLI search uses same multi-collection discovery pattern (RETR-08)         | ✅     |
| Single-collection startup works (RETR-11)                                 | ✅     |
| No-collection startup fails with helpful error                            | ✅     |
| Full build + typecheck + tests pass                                       | ✅     |

## Self-Check: PASSED
