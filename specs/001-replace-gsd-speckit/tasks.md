# Tasks: Replace GSD with GitHub SpecKit

**Input**: Design documents from `/specs/001-replace-gsd-speckit/`

**Prerequisites**: plan.md (required), spec.md (required for user stories)

**Tests**: Not required — this feature modifies shell scripts and markdown only.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: No new project initialization needed. Existing structure is used.

- [x] T001 Review current `install.sh` structure and identify insertion point for SpecKit step

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Git tracking changes that MUST complete before other stories

**CRITICAL**: User Story 2 (remove .opencode from git) is foundational because it changes tracked files that other stories may touch.

- [x] T002 Update `.gitignore` to replace `.opencode/benchmark/reports/` and `.opencode/benchmark/report.md` entries with a single `.opencode/` rule
- [x] T003 Run `git rm -r --cached .opencode/` to untrack `.opencode/` directory (preserves local files)

**Checkpoint**: `.opencode/` is no longer tracked. `git ls-files .opencode/` returns empty.

---

## Phase 3: User Story 1 - Fresh Install with SpecKit (Priority: P1)

**Goal**: SpecKit CLI is installed during `./install.sh` with version selection and graceful skip.

**Independent Test**: Run `./install.sh` on a machine without SpecKit. Verify version prompt appears and installation completes or skips gracefully.

### Implementation for User Story 1

- [x] T004 [US1] Create `scripts/install-speckit.sh` with `check_speckit()` function that detects if `specify` CLI is available and returns version or NOT_INSTALLED
- [x] T005 [US1] Add `install_speckit()` function to `scripts/install-speckit.sh` that queries npm for available `@github/spec-kit` versions, prompts user to select one, and runs `npm install -g @github/spec-kit@<version>`
- [x] T006 [US1] Add graceful failure handling in `install_speckit()`: if npm query fails, install fails, or user declines, show skip message and return 0 (non-fatal)
- [x] T007 [US1] Add `source "${SCRIPT_DIR}/scripts/install-speckit.sh"` to `install.sh` alongside other script sources
- [x] T008 [US1] Add SpecKit installation step in `install.sh` (after OpenCode install in Step 1 prerequisites section) following the existing pattern: check → install → report

**Checkpoint**: `./install.sh` includes SpecKit step. Can be declined without blocking remaining steps.

---

## Phase 4: User Story 3 - Remove GSD References (Priority: P2)

**Goal**: Zero GSD/GetShitDone references in non-historical tracked files.

**Independent Test**: `grep -r "GSD\|gsd\|GetShitDone\|get-shit-done" .planning/PROJECT.md .planning/STATE.md CLAUDE.md` returns no results.

### Implementation for User Story 3

- [x] T009 [P] [US3] Update `.planning/PROJECT.md`: remove GSD workflow references, replace `/gsd-*` commands with SpecKit equivalents, update descriptions
- [x] T010 [P] [US3] Update `.planning/STATE.md`: remove `gsd_state_version` header, replace `/gsd-plan-phase` references with SpecKit commands
- [x] T011 [P] [US3] Update `CLAUDE.md`: remove or replace any GSD/get-shit-done references
- [x] T012 [P] [US3] Update `.planning/codebase/STRUCTURE.md`: change "GSD workflow artifacts" comment to "Planning artifacts (legacy GSD, now SpecKit)"

**Checkpoint**: `grep -r "GSD\|gsd\|GetShitDone\|get-shit-done"` on active docs returns nothing. Historical `.planning/phases/` files are untouched.

---

## Phase 5: User Story 4 - Dependency Availability Check (Priority: P2)

**Goal**: SpecKit dependencies (Node.js/npm) are verified before attempting install, with user prompt for missing items.

**Independent Test**: Already covered by US1 implementation — Node.js/npm are existing hard requirements in `install.sh` Step 1. SpecKit's only dependency is npm which is already guaranteed by the time the SpecKit step runs.

### Implementation for User Story 4

- [x] T013 [US4] Add dependency pre-check in `install_speckit()` in `scripts/install-speckit.sh`: verify `npm` is available before attempting install; if not, show message explaining npm is required and skip

**Checkpoint**: If npm is somehow unavailable at SpecKit step, user sees a clear message and installer continues.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Verification and cleanup

- [x] T014 [P] Verify `git ls-files .opencode/` returns empty after all changes
- [x] T015 [P] Run full `grep -r` scan for GSD references in non-historical files to confirm zero results
- [x] T016 Validate `install.sh` runs end-to-end without errors (with SpecKit step declining)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — review only
- **Phase 2 (Foundational)**: Depends on Phase 1 — BLOCKS user story phases for clean git state
- **Phase 3 (US1)**: Depends on Phase 2 completion
- **Phase 4 (US3)**: Depends on Phase 2 completion, can run in PARALLEL with Phase 3
- **Phase 5 (US4)**: Depends on Phase 3 (adds to the same file created in US1)
- **Phase 6 (Polish)**: Depends on all previous phases

### User Story Dependencies

- **US1 (P1)**: Independent after foundational phase
- **US2 (P1)**: IS the foundational phase (Phase 2)
- **US3 (P2)**: Independent after foundational phase, parallel with US1
- **US4 (P2)**: Depends on US1 (extends the install-speckit.sh created there)

### Parallel Opportunities

```text
After Phase 2 completes:
  ├── Phase 3 (US1): T004 → T005 → T006 → T007 → T008
  └── Phase 4 (US3): T009, T010, T011, T012 (all parallel)

After Phase 3 completes:
  └── Phase 5 (US4): T013
```

---

## Implementation Strategy

### MVP First (User Story 1 + 2)

1. Complete Phase 2: Remove `.opencode/` from git (quick, low-risk)
2. Complete Phase 3: Add SpecKit to install.sh
3. **STOP and VALIDATE**: Run installer with decline option
4. This alone delivers the core value

### Incremental Delivery

1. Phase 2 → `.opencode/` untracked (immediate cleanup)
2. Phase 3 → SpecKit installable (core feature)
3. Phase 4 → GSD references cleaned (cosmetic improvement)
4. Phase 5 → Dependency check hardened (defensive improvement)
5. Phase 6 → Final verification

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Historical `.planning/phases/` files are explicitly excluded (FR-007)
- No TypeScript tests needed — this is shell script and markdown only
- Commit after each phase completion
