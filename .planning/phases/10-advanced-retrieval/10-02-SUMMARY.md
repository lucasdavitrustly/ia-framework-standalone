---
phase: '10'
plan: '02'
title: 'Graph-expanded retrieval + retrieval.mode config + auto-context v2 deferral'
subsystem: 'retrieval, core, mcp-server'
tags: ['search-expansion', 'dependency-graph', 'retrieval-config', 'auto-context', 'tdd']
dependency-graph:
  requires: ['10-01']
  provides:
    [
      'searchWithExpansion method',
      'RetrievalConfig schema',
      'expand_hops MCP param',
      'RETR-04 v2 deferral docs',
    ]
  affects: ['mcp-server', 'cli']
tech-stack:
  added: []
  patterns:
    [
      'BFS graph expansion on search results',
      'zero-vector filePath filter for chunk fetching',
      'expansion score=0 to distinguish from semantic matches',
    ]
key-files:
  created:
    - .planning/research/RETR-04-AUTO-CONTEXT.md
  modified:
    - packages/retrieval/src/search-engine.ts
    - packages/retrieval/src/search-engine.test.ts
    - packages/retrieval/src/types.ts
    - packages/core/src/config/schema.ts
    - packages/core/src/index.ts
    - packages/core/src/types/index.ts
    - packages/mcp-server/src/tools/search-codebase.ts
    - packages/mcp-server/src/bin.ts
    - packages/mcp-server/src/server.ts
decisions:
  - 'SearchEngine keeps DependencyGraph as an optional interface dependency — no hard coupling'
  - 'Expanded results use score: 0 to clearly distinguish from semantic matches'
  - 'expansionHops: 0 = no expansion (backward compatible)'
  - 'Auto-context (RETR-04) deferred to v2 — documented with rationale and prerequisites'
  - 'retrieval.mode defaults to mcp-only (current behavior unchanged)'
  - 'DependencyGraph.getNeighborFiles() is sync but wrapped in async lambda in bin.ts to match SearchEngineConfig interface'
  - 'fetchChunksForFiles uses zero-vector with filePath should-filter for multi-file chunk retrieval'
metrics:
  duration: '~15 minutes'
  completed: '2026-04-02'
  tasks: 5
  files: 9
---

# Phase 10 Plan 02: Graph-Expanded Retrieval + Retrieval Config

**One-liner:** `searchWithExpansion()` adds 1-2 hop dependency graph expansion to search results, `RetrievalConfig` schema enables mode/hops configuration, and RETR-04 auto-context is documented as deferred to v2.

## Tasks Completed

| #   | Task                                         | Commit    | Key Files                                                 |
| --- | -------------------------------------------- | --------- | --------------------------------------------------------- |
| 1   | SearchEngine graph expansion (TDD)           | `28cf094` | search-engine.ts, search-engine.test.ts, types.ts         |
| 2   | Retrieval config in ProjectConfig (RETR-05)  | `28cf094` | core/config/schema.ts, core/index.ts, core/types/index.ts |
| 3   | Wire expansion into MCP search_codebase tool | `28cf094` | tools/search-codebase.ts                                  |
| 4   | Wire DependencyGraph into MCP server         | `28cf094` | mcp-server/bin.ts, mcp-server/server.ts                   |
| 5   | Document RETR-04 v2 deferral                 | `28cf094` | .planning/research/RETR-04-AUTO-CONTEXT.md                |

## What Was Built

### SearchEngine.searchWithExpansion() (Task 1 — TDD)

- New method: `searchWithExpansion(query, { hops?: 0 | 1 | 2 })`
- Runs base `search()` first to get top results
- If `dependencyGraph` configured and hops > 0: extracts unique filePaths from base results, calls `getNeighborFiles(filePaths, hops)` for BFS expansion
- Fetches chunks for neighbor files via `fetchChunksForFiles()` — uses zero-vector with `should` filter on filePath
- Deduplicates: expansion chunks with same chunkId as base results are excluded
- Expansion chunks get `score: 0` to distinguish from semantic matches
- Falls back to plain `search()` when no graph configured or hops=0

### SearchEngineConfig Extension

- `dependencyGraph?: { getNeighborFiles(filePaths: string[], hops: 1 | 2): Promise<string[]> }` — async interface decouples from sync SQLite implementation

### RetrievalConfig Schema (Task 2 — RETR-05)

- `RetrievalModeSchema`: `z.enum(['mcp-only', 'auto-context', 'combined'])` — only `mcp-only` functional in v1
- `RetrievalConfigSchema`: `mode` (default: `mcp-only`), `expansionHops` (0|1|2, default: 1), `autoContextTopK` (1-20, default: 5)
- Added `retrieval?: RetrievalConfig` to `ProjectConfigSchema`
- All exported from `@ia-framework/core`

### MCP search_codebase Expansion (Tasks 3-4)

- `expand_hops` optional input parameter (0-2) added to tool schema
- Tool description updated to document expansion behavior
- Uses `searchWithExpansion()` instead of `search()` — hops from input override config default
- `ObservabilityConfig.defaultExpansionHops` reads from `config.retrieval.expansionHops`
- `bin.ts` creates `DependencyGraph` instance, wraps sync `getNeighborFiles` as async, passes to `SearchEngine`
- Graceful: if graph.sqlite doesn't exist, expansion is disabled (logged as info)

### RETR-04 Auto-Context Deferral (Task 5)

Documented in `.planning/research/RETR-04-AUTO-CONTEXT.md`:

- MCP Resources: not supported by OpenCode (application-driven, optional in spec)
- MCP Prompts: not supported by OpenCode (user-controlled, exposed as slash commands)
- OpenCode plugins: no `prompt.before` hook — only `tool.execute.before/after`, `session.compacting`, `message.updated`
- Tool-based approach (RETR-02) is more token-efficient: context retrieved on-demand, not auto-prepended
- V2 prerequisites: OpenCode adds `prompt.before` plugin hook, or implements MCP Resource support with `annotations.priority`

## Test Results

| Package                                             | Tests         | Status |
| --------------------------------------------------- | ------------- | ------ |
| @ia-framework/retrieval (searchWithExpansion suite) | 6/6 new       | PASS   |
| @ia-framework/mcp-server                            | existing pass | PASS   |

### searchWithExpansion Tests (6)

1. With no dependency graph configured, falls back to search()
2. 1-hop expansion adds chunks from imported files
3. 2-hop expansion adds chunks from imported-imports
4. Base results are not duplicated in expansion
5. Base results retain original scores; expanded results get score=0
6. Expansion with hops=0 skips graph expansion

## Requirements Completed

- **RETR-03**: Retrieval expands results 1-2 hops along the dependency graph to include types, interfaces, and utilities
- **RETR-04**: Auto-context mode — deferred to v2 with documented rationale (OpenCode lacks MCP Resources/Prompts support and plugin hooks for injection)
- **RETR-05**: Developer can configure retrieval mode: MCP-only, auto-context, or combined via `retrieval` config section

## Deviations from Plan

None — plan executed exactly as written. RETR-04 deferral was anticipated in the plan.

## Known Stubs

- `retrieval.mode: 'auto-context'` and `'combined'` are accepted by config validation but functionally equivalent to `mcp-only` in v1. Documented as v2 capability.
