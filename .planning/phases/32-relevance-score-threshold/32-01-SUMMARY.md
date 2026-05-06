---
phase: 32-relevance-score-threshold
plan: 01
subsystem: mcp-server, core
tags: [rag, score-threshold, anti-hallucination, search-quality]
dependency_graph:
  requires: []
  provides: [score-threshold-filtering, anti-hallucination-messaging]
  affects: [search-codebase, search-codebase-hybrid]
tech_stack:
  added: []
  patterns: [client-side-filtering, threshold-guard]
key_files:
  created:
    - packages/mcp-server/src/tools/__tests__/search-codebase-threshold.test.ts
  modified:
    - packages/core/src/config/schema.ts
    - packages/core/src/types/index.ts
    - packages/mcp-server/src/tools/search-codebase.ts
    - packages/mcp-server/src/tools/search-codebase-hybrid.ts
    - packages/core/src/config/schema.test.ts
decisions:
  - 'Client-side filtering (not engine-side) chosen to avoid Qdrant API changes and keep pipeline control'
  - 'Hybrid handler gets no 0.5 default because RRF scores are ~0.01–0.03 (rank-based, not 0–1 similarity)'
  - 'Hierarchy-expanded results (score=0) are exempted from threshold to preserve structural context'
  - 'thresholdFiltered tracks only non-hierarchy direct results to avoid false-positive anti-hallucination'
metrics:
  duration_minutes: ~60
  completed_date: '2026-05-06T16:45:09Z'
  tasks_completed: 3
  files_modified: 5
---

# Phase 32 Plan 01: Relevance Score Threshold Summary

**One-liner:** Client-side 0.5 score threshold filtering for semantic search with anti-hallucination no-results messaging and hierarchy exemption.

## What Was Built

Three tasks delivered a complete score-threshold filtering pipeline for the MCP search tools:

**Task 1 — Schema + filtering:**

- Added `scoreThreshold: z.number().min(0).max(1).optional()` to `RetrievalConfigSchema`
- Added `scoreThreshold?: number | undefined` to `RetrievalConfig` interface
- `searchCodebaseHandler`: filters results client-side using `input.score_threshold ?? defaultScoreThreshold ?? 0.5`
- `searchCodebaseHybridHandler`: filters on `input.score_threshold ?? defaultScoreThreshold` only (no 0.5 default — RRF scores are rank-based)
- Filtering applied BEFORE `applyTokenCap` (pipeline order D-03 preserved)

**Task 2 — Anti-hallucination message:**

- When threshold removes all direct results AND fallback also returns nothing → instructional message:
  > "No relevant code found for this query. Do not guess or hallucinate — inform the user that the codebase doesn't appear to contain relevant information for '{query}'."
- `structuredContent.threshold_filtered: true` added to structured output
- Fallback chain preserved (D-05): fallback attempted first; anti-hallucination only shown if both fail

**Task 2 (auto-fix) — Hierarchy regression:**

- Hierarchy-expanded results carry `score: 0` (structurally related, not ranked)
- Default 0.5 threshold was incorrectly filtering them out
- Fix: `results.filter(r => r.expansionSource === 'hierarchy' || r.score >= scoreThreshold)`
- `thresholdFiltered` logic updated to count only non-hierarchy direct results

**Task 3 — Schema tests:**

- Added `describe('RetrievalConfigSchema — scoreThreshold')` with 6 test cases
- Covers: accepts 0–1, undefined on omit, rejects <0 and >1

## Commits

| Hash      | Type | Description                                                               |
| --------- | ---- | ------------------------------------------------------------------------- |
| `c78e0b4` | test | Failing tests for client-side score threshold filtering                   |
| `b6402d4` | feat | Client-side score threshold filtering with 0.5 default                    |
| `7edb855` | test | Failing tests for anti-hallucination instructional message                |
| `c47e824` | feat | Anti-hallucination instructional message for zero-results after threshold |
| `15612b8` | fix  | Skip hierarchy-expanded results from score threshold filtering            |
| `dba6dd0` | test | scoreThreshold schema validation tests                                    |

## Test Coverage

- `packages/mcp-server/src/tools/__tests__/search-codebase-threshold.test.ts` — 13 tests (all pass)
- `packages/core/src/config/schema.test.ts` — 6 new tests (all pass)
- Full suite: 121 mcp-server + 39 core = 160 tests, all green

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Hierarchy-expanded results incorrectly filtered by score threshold**

- **Found during:** Task 2 (post-implementation regression in existing tests)
- **Issue:** Hierarchy-expanded chunks have `score: 0` since they are structurally related, not relevance-ranked. The default 0.5 threshold removed them from every search response that included hierarchy expansion.
- **Fix:** Added `r.expansionSource === 'hierarchy'` exemption to the filter predicate. Also simplified `thresholdFiltered` to track only `directBefore > 0 && directAfter === 0`.
- **Files modified:** `packages/mcp-server/src/tools/search-codebase.ts`
- **Commit:** `15612b8`

**2. [Rule 2 - Logic] `thresholdFiltered` used redundant double-filter calculation**

- **Found during:** Code review before final commit
- **Issue:** The `directFiltered` variable was computed after filtering (already the passing set) making the condition work but confusingly redundant.
- **Fix:** Refactored to capture `directBefore` count before filter and `directAfter` count after.
- **Files modified:** `packages/mcp-server/src/tools/search-codebase.ts`
- **Commit:** `15612b8` (included in same fix)

## Known Stubs

None — all features fully wired. The `defaultScoreThreshold` config field requires consumers to pass it via `ObservabilityConfig` (e.g., from project config). The wiring from project config → `defaultScoreThreshold` is done in the caller (index server), not in this plan — that path was already established.

## Self-Check

Verified:

- `packages/mcp-server/src/tools/search-codebase.ts` ✅
- `packages/mcp-server/src/tools/search-codebase-hybrid.ts` ✅
- `packages/core/src/config/schema.ts` ✅
- `packages/core/src/types/index.ts` ✅
- `packages/mcp-server/src/tools/__tests__/search-codebase-threshold.test.ts` ✅
- `packages/core/src/config/schema.test.ts` ✅
- All commits present in git log ✅
