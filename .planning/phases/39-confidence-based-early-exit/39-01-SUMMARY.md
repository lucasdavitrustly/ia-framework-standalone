---
phase: 39-confidence-based-early-exit
plan: 01
subsystem: mcp-server
tags: [early-exit, confidence, logging, config]
dependency-graph:
  requires: [37-query-complexity-classifier]
  provides: [earlyExitConfidence-config, early-exit-logging]
  affects: [search-codebase, search-codebase-hybrid]
tech-stack:
  added: []
  patterns: [confidence-threshold-gating, structured-log-extension]
key-files:
  created: []
  modified:
    - packages/core/src/config/schema.ts
    - packages/core/src/config/schema.test.ts
    - packages/core/src/types/index.ts
    - packages/mcp-server/src/tools/search-codebase.ts
    - packages/mcp-server/src/tools/search-codebase.test.ts
    - packages/mcp-server/src/tools/search-codebase-hybrid.ts
    - packages/mcp-server/src/tools/search-codebase-hybrid.test.ts
key-decisions:
  - earlyExit is a logging/observability flag on existing keyword routing, not a behavior change
  - Reused existing anti-hallucination message for CEX-02 (no new code needed)
requirements-completed: [CEX-01, CEX-02, CEX-03, CEX-04]
metrics:
  duration: 5 min
  completed: 2026-05-15
---

# Phase 39 Plan 01: Confidence-Based Early Exit Summary

Configurable confidence threshold (earlyExitConfidence, default 0.8) for keyword query early exit with structured logging of earlyExit/earlyExitReason fields in both search handlers.

## Duration

- **Start:** 2026-05-15T18:43:27Z
- **End:** 2026-05-15T18:48:50Z
- **Duration:** 5 min
- **Tasks:** 3/3
- **Files modified:** 7

## Tasks Completed

| Task | Name                                               | Commit  | Key Changes                                                                |
| ---- | -------------------------------------------------- | ------- | -------------------------------------------------------------------------- |
| 1    | Add earlyExitConfidence to config schema and types | f5b7bdc | Schema field with 0.8 default, type interface update, 3 tests              |
| 2    | Implement early exit gate and extend logging       | d6c446f | Extended logClassification with earlyExit/earlyExitReason in both handlers |
| 3    | Add tests for early exit behavior and logging      | c8e31d5 | 4 tests in search-codebase, 3 tests in search-codebase-hybrid              |

## What Was Built

- **CEX-01:** High-confidence keyword queries (>=0.8) are flagged with `earlyExit: true` in log entries when results are found. The keyword route already skips vector search — this makes it explicit and configurable.
- **CEX-02:** Low-confidence retrieval returns anti-hallucination message — already existed via Phase 32 score threshold. No new code needed (D-04, D-05).
- **CEX-03:** All classification log entries now include `earlyExit` (boolean) and `earlyExitReason` (string) fields. Reasons: `confidence-above-threshold` for early exits, `fallback-no-results` when high-confidence keyword returns 0 results.
- **CEX-04:** `retrieval.earlyExitConfidence` configurable in project.json (0-1, default 0.8).

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED
