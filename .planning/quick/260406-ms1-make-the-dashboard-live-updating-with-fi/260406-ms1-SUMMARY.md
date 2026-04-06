---
phase: quick
plan: 260406-ms1
subsystem: dashboard
tags: [dashboard, indexing, observer-pattern, tdd, frontend, backend]
dependency_graph:
  requires: []
  provides:
    - IndexingStateManager.subscribe/unsubscribe observer pattern
    - 4-stage pipeline view in IndexingPanel (walking/parsing/embedding/storing)
  affects:
    - packages/dashboard-api/src/indexing-state.ts
    - packages/dashboard-api/src/routes/indexing.test.ts
    - apps/dashboard/src/components/IndexingPanel.tsx
tech_stack:
  added: []
  patterns:
    - Observer pattern (Set<IndexingObserver> with subscribe/unsubscribe + notify on state mutation)
    - TDD red-green cycle (failing tests committed before implementation)
    - Pipeline stage rendering with conditional JSX per stage
key_files:
  created:
    - packages/dashboard-api/src/routes/indexing.test.ts
  modified:
    - packages/dashboard-api/src/indexing-state.ts
    - apps/dashboard/src/components/IndexingPanel.tsx
decisions:
  - start() does not notify observers — frontend will detect running=true on next 2s poll
  - Indeterminate animation uses animate-pulse (Tailwind built-in) as custom keyframe unavailable
  - PIPELINE_STAGES const array drives rendering order and stage index arithmetic
metrics:
  duration: 4min
  completed: 2026-04-06T19:33:11Z
  tasks: 3
  files: 3
---

# Quick Task 260406-ms1: Dashboard Live-Updating Pipeline View Summary

**One-liner:** Observer pattern on IndexingStateManager + 4-stage pipeline view (walking/parsing/embedding/storing) with per-stage progress bars replacing the single opaque bar.

## What Was Built

### Task 1: Failing Tests (RED phase)

Created `packages/dashboard-api/src/routes/indexing.test.ts` with 10 test cases covering:

- **T1–T5:** Observer unit tests — subscribe notifies on update/complete/fail, unsubscribe removes observer, multiple observers all notified
- **T6–T8:** Route integration tests — GET /status returns correct stage/filesTotal/filesProcessed/chunksTotal/chunksIndexed for each pipeline stage
- **T9:** POST /trigger passes progress callback to triggerIndexing mock; invoking it updates state
- **T10:** Observer registered before trigger fires is notified when progress callback is invoked

All 6 observer tests were RED at commit time (`subscribe is not a function`). 24 pre-existing tests remained GREEN.

### Task 2: Implementation (GREEN phase)

Extended `packages/dashboard-api/src/indexing-state.ts`:

- Added `export type IndexingObserver = (state: IndexingState) => void`
- Added `private observers: Set<IndexingObserver>` field
- Added `subscribe(observer)` and `unsubscribe(observer)` public methods
- Added `private notifyObservers()` helper that snapshots state and notifies all observers
- `update()`, `complete()`, and `fail()` all call `notifyObservers()` after mutations
- `start()` intentionally does NOT notify (frontend detects running=true via poll)

All 30 tests GREEN. TypeScript compiles clean.

### Task 3: Multi-Stage Pipeline UI

Rewrote `apps/dashboard/src/components/IndexingPanel.tsx`:

- Added `PIPELINE_STAGES`, `STAGE_ICONS`, `STAGE_LABELS` constants
- Pipeline renders all 4 stages vertically; active/completed/pending states are distinct:
  - **Active:** animated yellow dot + `running` badge
  - **Completed:** green `✓` + muted text
  - **Pending:** grey dot + dimmed text
- **Walking stage:** indeterminate animate-pulse bar
- **Parsing stage:** files progress bar (`filesProcessed / filesTotal`) + `currentFile` display
- **Embedding stage:** chunks progress bar (`chunksIndexed / chunksTotal`) with purple fill
- **Storing stage:** indeterminate animate-pulse bar
- **Done state (`stage='done'`):** all 4 stages show `✓`, plus "Completed in Xs" summary
- **Idle state:** simple "Idle" text when `stage === null` and not running
- All existing state, polling, trigger, error, and last-run logic preserved

## Verification

```
pnpm --filter @ia-framework/dashboard-api test -- --run
→ 30 tests passed (3 test files)

pnpm --filter @ia-framework/dashboard typecheck
→ Exit 0 (no TypeScript errors)
```

## Commits

| Task | Type | Hash    | Message                                                                 |
| ---- | ---- | ------- | ----------------------------------------------------------------------- |
| 1    | test | 9b229b9 | add failing tests for observer pattern and stage-aware routes           |
| 2    | feat | c0a2ade | implement IndexingStateManager observer pattern (GREEN)                 |
| 3    | feat | 4b061fa | replace single progress bar with 4-stage pipeline view in IndexingPanel |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all stage data comes from the live `ApiIndexingStatus` polled every 2 seconds.

## Self-Check

- [x] `packages/dashboard-api/src/routes/indexing.test.ts` exists with 10 tests
- [x] `packages/dashboard-api/src/indexing-state.ts` exports `IndexingObserver`, `subscribe`, `unsubscribe`
- [x] Commits 9b229b9, c0a2ade, 4b061fa exist
- [x] 30 tests pass, 0 failures
- [x] Frontend TypeScript compiles clean

## Self-Check: PASSED
