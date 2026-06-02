# Tasks: Update README

**Input**: Design documents from `/specs/002-update-readme/`

**Prerequisites**: plan.md (required), spec.md (required for user stories)

**Tests**: Not required — this feature modifies markdown documentation only.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: No project initialization needed. This is a single-file documentation update.

- [x] T001 Review current `README.md` structure and identify all sections requiring updates

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: No foundational/blocking changes needed — all tasks are independent edits to README.md.

_(No tasks in this phase)_

---

## Phase 3: User Story 1 - New Developer Onboarding (Priority: P1)

**Goal**: A developer unfamiliar with the project can follow the README and have a working setup in under 15 minutes.

**Independent Test**: A new developer reads the README top-to-bottom and successfully installs ia-framework with SpecKit available.

### Implementation for User Story 1

- [x] T002 [US1] Add SpecKit (`specify` CLI) row to the Prerequisites table in `README.md` (after OpenCode row) with version, install method, required=No, and notes about Python 3.11+/uv dependency chain
- [x] T003 [US1] Update the "The installer will:" numbered list in Quick Start section of `README.md` to include SpecKit installation step (after OpenCode bullet)
- [x] T004 [US1] Add a note in the Configuration section of `README.md` explaining that `.opencode/` is per-user configuration (not tracked in git)

**Checkpoint**: README mentions SpecKit in prerequisites and installer steps. `.opencode/` explained.

---

## Phase 4: User Story 2 - Technology Stack Clarity (Priority: P2)

**Goal**: Developers can identify all required/optional technologies, versions, and purposes.

**Independent Test**: Reading the Prerequisites and Stack sections gives complete technology picture.

### Implementation for User Story 2

- [x] T005 [US2] Verify the "Stack" line in Architecture section of `README.md` is complete and accurate (currently lists TypeScript, pnpm, Turborepo, Vitest, Qdrant, tree-sitter, Hono, React 19, Zod, better-sqlite3)
- [x] T006 [US2] Add a "Recent Changes" note under "Recent Improvements" in `README.md` documenting SpecKit integration and .opencode/ untracking (v1.8 or current)

**Checkpoint**: Technology stack fully documented, recent changes noted.

---

## Phase 5: User Story 3 - Tutorial Workflow (Priority: P2)

**Goal**: Users who installed ia-framework understand the typical workflow from indexing to MCP usage.

**Independent Test**: A developer can follow the post-install tutorial and search their codebase via OpenCode.

### Implementation for User Story 3

- [x] T007 [US3] Verify the CLI Reference section of `README.md` documents all current commands (cross-reference against actual CLI source in `packages/cli/src/commands/`)
- [x] T008 [US3] Add a brief SpecKit section to `README.md` (after CLI Reference or before Development) explaining what SpecKit provides and listing key `/speckit.*` commands available in OpenCode

**Checkpoint**: All CLI commands documented, SpecKit workflow explained.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final verification

- [x] T009 [P] Run `grep -i "gsd\|GetShitDone" README.md` to verify zero deprecated references
- [x] T010 [P] Verify `grep -i "speckit\|specify" README.md` returns matches confirming new content is present
- [x] T011 Verify all README anchor links still work (no broken internal references)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — review only
- **Phase 3 (US1)**: Depends on Phase 1 — core onboarding updates
- **Phase 4 (US2)**: Independent of Phase 3, can run in PARALLEL
- **Phase 5 (US3)**: Independent of Phases 3-4, can run in PARALLEL
- **Phase 6 (Polish)**: Depends on all previous phases

### Parallel Opportunities

```text
After Phase 1 completes:
  ├── Phase 3 (US1): T002 → T003 → T004
  ├── Phase 4 (US2): T005, T006 (parallel)
  └── Phase 5 (US3): T007, T008 (parallel)

After Phases 3-5 complete:
  └── Phase 6 (Polish): T009, T010, T011
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Add SpecKit to prerequisites and installer steps
2. Add .opencode/ note
3. **STOP and VALIDATE**: New user can understand the full install
4. This alone delivers the core onboarding value

### Incremental Delivery

1. Phase 3 → SpecKit in prerequisites + installer docs (core gap filled)
2. Phase 4 → Stack verification + recent changes note (completeness)
3. Phase 5 → CLI verification + SpecKit workflow section (tutorial value)
4. Phase 6 → Final verification

---

## Notes

- [P] tasks = different sections of the same file, but no content dependencies
- All tasks modify a single file: `README.md`
- No tests needed — documentation only
- This is a low-risk change with no code impact
