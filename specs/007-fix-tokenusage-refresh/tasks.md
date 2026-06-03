# Tasks: Fix TokenUsage Page Stale Data

**Input**: Design documents from `specs/007-fix-tokenusage-refresh/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, quickstart.md

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: No new project setup needed — this is a bugfix on existing code.

- [x] T001 Verify current MetricsStore behavior by checking `PRAGMA journal_mode` value in existing metrics.sqlite

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Enable WAL mode — this is the root cause fix that MUST be done before UI improvements matter.

**⚠️ CRITICAL**: User Story 2 (polling) is pointless without this fix.

- [x] T002 [P] Write failing test that asserts MetricsStore enables WAL mode in packages/observability/src/metrics-store.test.ts
- [x] T003 Add `this.db.pragma('journal_mode = WAL')` at the start of `initialize()` in packages/observability/src/metrics-store.ts
- [x] T004 Run test from T002 and verify it passes

**Checkpoint**: Cross-process read visibility fixed. Dashboard API can now see MCP server writes.

---

## Phase 3: User Story 1 - MCP metrics visible after tool calls (Priority: P1) 🎯 MVP

**Goal**: New MCP tool call data appears in the dashboard API responses without restarting the dashboard.

**Independent Test**: Make an MCP tool call, then `curl http://localhost:3000/api/requests/stats` and verify the new call appears.

### Implementation for User Story 1

- [x] T005 [US1] Write integration test verifying two separate MetricsStore instances on same DB file see each other's writes in packages/observability/src/metrics-store.test.ts
- [x] T006 [US1] Run full observability test suite to confirm no regressions: `pnpm --filter @ia-framework/observability test`

**Checkpoint**: User Story 1 complete — data flows correctly between processes.

---

## Phase 4: User Story 2 - Dashboard auto-refreshes (Priority: P2)

**Goal**: TokenUsage page polls for new data every 30 seconds without manual browser refresh.

**Independent Test**: Open TokenUsage page, wait 30+ seconds, verify stats update without interaction.

### Implementation for User Story 2

- [x] T007 [US2] Add 30-second polling interval with cleanup to useEffect in apps/dashboard/src/pages/TokenUsage.tsx
- [x] T008 [US2] Add ref guard to prevent overlapping fetch requests in apps/dashboard/src/pages/TokenUsage.tsx
- [x] T009 [US2] Ensure polling failures silently keep last successful data (no error flash) in apps/dashboard/src/pages/TokenUsage.tsx
- [x] T010 [US2] Verify dashboard builds successfully: `pnpm --filter @ia-framework/dashboard build`

**Checkpoint**: User Story 2 complete — page auto-refreshes and shows live data.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [x] T011 Run full project build to confirm no regressions: `pnpm build`
- [x] T012 Run full test suite: `pnpm test`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: No dependencies — can start immediately
- **User Story 1 (Phase 3)**: Depends on Foundational (Phase 2) — WAL mode must be in place
- **User Story 2 (Phase 4)**: Depends on Foundational (Phase 2) — independent of US1
- **Polish (Phase 5)**: Depends on all stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Depends on Phase 2 only. No dependency on US2.
- **User Story 2 (P2)**: Depends on Phase 2 only. No dependency on US1. Can run in parallel with US1.

### Parallel Opportunities

- T002 and T003 can run in parallel (test file vs source file)
- US1 (Phase 3) and US2 (Phase 4) can run in parallel after Phase 2 completes
- T007, T008, T009 are sequential (same file, same useEffect)

---

## Parallel Example: After Phase 2

```bash
# These can run in parallel (different packages):
Task: "T005 [US1] Write integration test in packages/observability/src/metrics-store.test.ts"
Task: "T007 [US2] Add polling interval in apps/dashboard/src/pages/TokenUsage.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 2: Add WAL pragma (3 tasks)
2. Complete Phase 3: Verify cross-process visibility (2 tasks)
3. **STOP and VALIDATE**: Test that dashboard API returns fresh data
4. This alone fixes the reported bug

### Incremental Delivery

1. WAL pragma fix → Data flows correctly (MVP — bug is fixed)
2. Add polling → Better UX (enhancement)
3. Polish → Full confidence

---

## Notes

- The core fix is a single line of code (`this.db.pragma('journal_mode = WAL')`)
- The polling enhancement is ~20 lines of React code
- Total scope: ~25 lines of implementation code + tests
- Commit after each phase for clean git history
