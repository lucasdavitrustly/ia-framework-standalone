---
phase: 38-line-number-aware-chunking
plan: 01
subsystem: mcp-server, indexer
tags: [line-numbers, formatting, validation]
dependency-graph:
  requires: []
  provides: [line-number-display, line-number-validation]
  affects: [mcp-search-output]
tech-stack:
  added: []
  patterns: [structured-logging-validation]
key-files:
  created: []
  modified:
    - packages/mcp-server/src/tools/search-codebase.ts
    - packages/mcp-server/src/tools/search-codebase.test.ts
    - packages/indexer/src/pipeline.ts
    - packages/indexer/src/pipeline.test.ts
key-decisions:
  - 'Header suffix format :startLine-endLine after relativePath for compact citation'
  - 'Warn-and-index for invalid line numbers - never skip chunks'
requirements-completed: [LNC-04, LNC-05]
metrics:
  duration: '2 min'
  completed: '2026-05-15'
---

# Phase 38 Plan 01: Line-Number-Aware Chunking Summary

formatResult displays `:startLine-endLine` suffix in MCP search headers; indexer logs structured warning for chunks with endLine exceeding file line count without blocking indexing.

## Tasks Completed

| Task | Name                               | Commit  | Key Changes                                                    |
| ---- | ---------------------------------- | ------- | -------------------------------------------------------------- |
| 1    | Add line numbers to formatResult() | e8b60c6 | Exported formatResult with @internal, added lineRange variable |
| 2    | Pipeline validation warning        | e8b60c6 | Added chunk_line_number_mismatch warning after chunking        |

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- `pnpm --filter @ia-framework/mcp-server test` — 145 tests pass
- `pnpm --filter @ia-framework/indexer test` — 112 tests pass
- `search-codebase.ts` contains `result.startLine}-${result.endLine}`
- `pipeline.ts` contains `chunk_line_number_mismatch`

## Self-Check: PASSED
