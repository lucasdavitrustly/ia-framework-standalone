---
description: "Task list for TLC Spec-Driven Slash Commands"
---

# Tasks: TLC Spec-Driven Slash Commands

**Input**: Design documents from `/specs/018-tlc-spec-driven-commands/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Test tasks ARE included for the branch helper because the project constitution mandates TDD (Principle I) and `contracts/branch-helper.md` defines a test contract (T1–T10). Markdown command files are declarative and covered by an install-verification task rather than unit tests.

**Organization**: Tasks are grouped by user story (P1–P2 from spec.md) for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US6)
- All paths are repo-relative to `/Users/rafael.goncalves/ia-framework/`

## Path Conventions

Skill package: `skills/tlc-spec-driven/`. Commands under `commands/`, branch helper under `scripts/`, docs at `SKILL.md` and `references/`. No `src/`/`tests/` TS layout applies (see plan.md Structure Decision).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Prepare the skill package to carry commands and a branch helper.

- [X] T001 Create the command and script directories `skills/tlc-spec-driven/commands/` and `skills/tlc-spec-driven/scripts/tests/` (with a `.gitkeep` if empty) so subsequent files have a home.
- [X] T002 Review `scripts/install-skills.sh` (`install_skill()`, the `assets.commands` + `IDE_SUPPORTS_COMMANDS` gate) and `scripts/ide-descriptors/opencode.sh` + `claude-code.sh` to confirm no installer change is needed; record the confirmed link path(s) as a comment in `specs/018-tlc-spec-driven-commands/quickstart.md` verification step 1 if they differ from what is documented.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The single change that makes the installer link commands at all. Blocks every user story that relies on a command being present (US1, US2, US3, US4, US6).

**⚠️ CRITICAL**: No command becomes discoverable until `assets.commands` is enabled.

- [X] T003 Set `"commands": true` under `assets` in `skills/tlc-spec-driven/skill.json` (leave `agents`/`hooks` false) so the installer links `commands/*.md` into command-capable IDEs (FR-009).

**Checkpoint**: Installer will now link any command file added under `commands/`. User story work can begin.

---

## Phase 3: User Story 1 - Trigger a phase by command (Priority: P1) 🎯 MVP

**Goal**: The four phases (Specify, Design, Tasks, Execute) are invokable as `tlc-<action>` commands whose behavior matches the natural-language triggers.

**Independent Test**: On a command-capable IDE, invoke each of `tlc-specify`/`tlc-design`/`tlc-tasks`/`tlc-execute` and confirm the matching phase runs (per quickstart step 1 palette + a phase invocation).

- [X] T004 [P] [US1] Create `skills/tlc-spec-driven/commands/tlc-design.md` with frontmatter (`name: tlc-design`, non-empty `description`, `argument-hint`, least-privilege `tools`) and a body that loads `references/design.md` and runs the Design phase (FR-001/FR-004/FR-011/FR-015; contract commands.md CO-1/CO-3).
- [X] T005 [P] [US1] Create `skills/tlc-spec-driven/commands/tlc-tasks.md` (`name: tlc-tasks`) that loads `references/tasks.md` and runs the Tasks phase (FR-001/FR-004/FR-011/FR-015).
- [X] T006 [P] [US1] Create `skills/tlc-spec-driven/commands/tlc-execute.md` (`name: tlc-execute`) that loads `references/implement.md` and runs the Execute phase (FR-001/FR-004/FR-011/FR-015).
- [X] T007 [US1] Create `skills/tlc-spec-driven/commands/tlc-specify.md` (`name: tlc-specify`, `argument-hint: '"<feature description>"'`) that loads `references/specify.md`; body MUST prompt for a description when `$ARGUMENTS` is empty (FR-014/CO-4) and reserve a clearly marked branch-creation step to be wired in US2 (do NOT implement branch logic here yet). (FR-001/FR-004/FR-011/FR-015)

**Checkpoint**: All four phase commands exist and run their phases; `tlc-specify` still lacks branch creation (added in US2).

---

## Phase 4: User Story 2 - New feature spec creates a branch (Priority: P1)

**Goal**: Initiating a new feature spec via `tlc-specify` creates/switches to a `NNN-<slug>` branch off current HEAD, using self-contained numbering with no `.specify/` dependency.

**Independent Test**: On a clean repo, run `tlc-specify "<desc>"`; assert a new branch `NNN-<slug>` is checked out whose parent commit equals the prior HEAD, and numbering has no collision (quickstart steps 2 & 5).

### Tests for User Story 2 (TDD — write FIRST, ensure they FAIL) ⚠️

- [X] T008 [US2] Write the failing shell test suite `skills/tlc-spec-driven/scripts/tests/new-feature-branch.test.sh` covering T1–T10 from `contracts/branch-helper.md` (numbering across `.specs/features`/`.specs/quick`/local+remote branches, base-10 padding, existing-branch switch, branch-from-HEAD parent check, non-git-dir exit, slug derivation, JSON output shape). Run it and confirm it fails (no script yet).

### Implementation for User Story 2

- [X] T009 [US2] Implement `skills/tlc-spec-driven/scripts/new-feature-branch.sh` (POSIX sh) per `contracts/branch-helper.md`: compute `max(sources)+1` padded to 3 digits (base-10 forced), derive slug (stop-word filter + dash collapse), create/switch `NNN-<slug>` from current HEAD without overwrite, emit `{BRANCH_NAME,FEATURE_NUM,KIND}` JSON; handle non-git and unborn-HEAD edge cases (FR-005/FR-007/FR-008/FR-012/FR-017/SC-003/SC-006). Make it executable.
- [X] T010 [US2] Run `sh skills/tlc-spec-driven/scripts/tests/new-feature-branch.test.sh` and iterate on `new-feature-branch.sh` until T1–T10 all pass (red→green).
- [X] T011 [US2] Wire the branch step in `skills/tlc-spec-driven/commands/tlc-specify.md` to invoke `scripts/new-feature-branch.sh --json --kind feature` BEFORE writing any spec artifact, using the returned `FEATURE_NUM`/`BRANCH_NAME` (FR-005/CO-2). Depends on T007, T009.

**Checkpoint**: `tlc-specify` creates a branch first, then writes the spec; branch helper is tested and green.

---

## Phase 5: User Story 3 - Quick task creates a branch (Priority: P1)

**Goal**: Starting a quick task via `tlc-quick` creates/switches to a branch before implementation, reusing the US2 helper.

**Independent Test**: Run `tlc-quick "<one-liner>"`; assert a branch is created/checked out before any file change and a quick record is created (quickstart step 3).

- [X] T012 [US3] Create `skills/tlc-spec-driven/commands/tlc-quick.md` (`name: tlc-quick`, `argument-hint: '"<one-sentence task>"'`) that loads `references/quick-mode.md`, prompts when `$ARGUMENTS` is empty (FR-014/CO-4), invokes `scripts/new-feature-branch.sh --json --kind quick` BEFORE implementation (FR-006/FR-017/CO-2), then proceeds with quick-mode. Depends on T009.

**Checkpoint**: Both P1 branch-creating commands (specify, quick) work via the shared helper.

---

## Phase 6: User Story 5 - Graceful degradation on command-less IDEs (Priority: P1)

**Goal**: Installing on a command-less IDE succeeds with zero errors, links no commands, and the skill remains usable via natural language.

**Independent Test**: Install the skill targeting a command-less IDE descriptor; assert exit 0, no command symlink created, and natural-language triggers still route (quickstart step 1, negative half).

- [X] T013 [US5] Verify graceful degradation: run/inspect `scripts/install-skills.sh` selecting `tlc-spec-driven` against a command-capable IDE (opencode) AND a command-less descriptor (e.g. cursor); assert command symlinks appear only for the capable IDE and the installer exits 0 for both (FR-009/FR-010/SC-004). Record the result in `specs/018-tlc-spec-driven-commands/quickstart.md` verification notes.

**Checkpoint**: Command delivery is correct on both capable and incapable IDEs; no regression for natural-language usage.

---

## Phase 7: User Story 4 - Project and state actions by command (Priority: P2)

**Goal**: Key project/state actions are invokable as commands.

**Independent Test**: Invoke each project/state command and confirm the matching skill behavior runs (produces/updates the expected project/state artifacts).

- [X] T014 [P] [US4] Create `skills/tlc-spec-driven/commands/tlc-project-init.md` (`name: tlc-project-init`) loading `references/project-init.md` (FR-003/FR-004/FR-011/FR-015).
- [X] T015 [P] [US4] Create `skills/tlc-spec-driven/commands/tlc-roadmap.md` (`name: tlc-roadmap`) loading `references/roadmap.md` (FR-003/FR-004/FR-011/FR-015).
- [X] T016 [P] [US4] Create `skills/tlc-spec-driven/commands/tlc-map-codebase.md` (`name: tlc-map-codebase`) loading `references/brownfield-mapping.md` (FR-003/FR-004/FR-011/FR-015).
- [X] T017 [P] [US4] Create `skills/tlc-spec-driven/commands/tlc-state.md` (`name: tlc-state`, `argument-hint: '"<decision|blocker|todo> <text>"'`) loading `references/state-management.md`; prompt when empty (FR-003/FR-014).
- [X] T018 [P] [US4] Create `skills/tlc-spec-driven/commands/tlc-session.md` (`name: tlc-session`, `argument-hint: '"<pause|resume>"'`) loading `references/session-handoff.md` (FR-003/FR-004/FR-011/FR-015).

**Checkpoint**: All 10 commands from the roster in `contracts/commands.md` exist.

---

## Phase 8: User Story 6 - Command discoverability (Priority: P2)

**Goal**: Every TLC command shows a description + argument hint in the palette.

**Independent Test**: Open the command palette on a command-capable IDE; confirm each `tlc-*` command displays a description and argument hint (quickstart step 7).

- [X] T019 [US6] Audit all files in `skills/tlc-spec-driven/commands/` for a non-empty `description` and, where the command takes input, a present `argument-hint`; fix any missing metadata (FR-011/CO-3). Cross-check names against the `tlc-<action>` convention (FR-015).

**Checkpoint**: Discoverability metadata verified across the full roster.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Documentation and end-to-end validation spanning all stories.

- [X] T020 [P] Update `skills/tlc-spec-driven/SKILL.md` to document the command entry points (the `tlc-<action>` roster) and the new branch-on-new-spec/quick behavior (FR-013).
- [X] T021 [P] Update `skills/tlc-spec-driven/references/specify.md` to describe branch-on-new-feature-spec via `scripts/new-feature-branch.sh` (FR-013).
- [X] T022 [P] Update `skills/tlc-spec-driven/references/quick-mode.md` to add the branch-before-implementation step (a documented change to the current commit-only flow) (FR-013).
- [X] T023 Run `specs/018-tlc-spec-driven-commands/quickstart.md` end-to-end (verification steps 1–7) and confirm SC-001…SC-006; fix any gaps.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2 / T003)**: depends on Setup; BLOCKS command discoverability for US1/US2/US3/US4/US6.
- **US1 (Phase 3)**: after Foundational.
- **US2 (Phase 4)**: after US1 (T007 exists) — adds the helper and wires `tlc-specify`.
- **US3 (Phase 5)**: after US2 (reuses `new-feature-branch.sh` from T009).
- **US5 (Phase 6)**: after Foundational; independent of US1–US4 content but needs `assets.commands=true` (T003) and at least one command file to observe linking.
- **US4 (Phase 7)**: after Foundational; independent of US1–US3.
- **US6 (Phase 8)**: after the commands it audits exist (US1, US3, US4).
- **Polish (Phase 9)**: after the behavior it documents/validates exists.

### User Story Dependencies

- **US1 (P1)**: Foundational only.
- **US2 (P1)**: builds on US1's `tlc-specify` stub; introduces the shared branch helper.
- **US3 (P1)**: depends on US2's helper (`new-feature-branch.sh`).
- **US5 (P1)**: Foundational + ≥1 command file; otherwise independent.
- **US4 (P2)**: Foundational only — fully parallelizable with US1–US3, US5.
- **US6 (P2)**: verification over US1/US3/US4 outputs.

### Within Each User Story

- US2: test (T008) FIRST and failing → implement helper (T009) → make green (T010) → wire command (T011).
- Command-file creation tasks marked [P] touch distinct files and can run together.

### Parallel Opportunities

- Setup: T001, T002 (different concerns).
- US1: T004, T005, T006 in parallel (distinct files); T007 after (shares no file but sequenced for the branch-step reservation clarity).
- US4: T014–T018 all [P] (five distinct files).
- Polish: T020, T021, T022 all [P] (distinct docs).
- Across stories: US4 (P2) can proceed in parallel with US1/US2/US3 once T003 is done.

---

## Parallel Example: User Story 4

```bash
# Create all five project/state command files together:
Task: "Create skills/tlc-spec-driven/commands/tlc-project-init.md"
Task: "Create skills/tlc-spec-driven/commands/tlc-roadmap.md"
Task: "Create skills/tlc-spec-driven/commands/tlc-map-codebase.md"
Task: "Create skills/tlc-spec-driven/commands/tlc-state.md"
Task: "Create skills/tlc-spec-driven/commands/tlc-session.md"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 Setup → Phase 2 Foundational (T003) → Phase 3 US1.
2. **STOP and VALIDATE**: the four phase commands run on a command-capable IDE.
3. This is a demoable MVP: TLC phases are invokable as commands (SC-001), even before branch automation.

### Incremental Delivery

1. Setup + Foundational → installer links commands.
2. US1 → phase commands (MVP, SC-001).
3. US2 → feature-spec branching (SC-002/SC-003/SC-006).
4. US3 → quick-task branching (SC-002).
5. US5 → confirm graceful degradation (SC-004).
6. US4 → project/state commands.
7. US6 → discoverability audit (SC-005).
8. Polish → docs + full quickstart validation.

### Parallel Team Strategy

After T003: Dev A takes US1→US2→US3 (the branch-critical path); Dev B takes US4 in parallel; US5/US6 validation folds in as their inputs land.

---

## Notes

- [P] = different files, no dependencies.
- [Story] label maps each task to its user story for traceability.
- US2 follows strict TDD per constitution Principle I (test T008 before helper T009).
- Commit after each task or logical group (constitution: commit per logical unit).
- The branch helper is deliberately self-contained — it must not read or import anything under `.specify/` (FR-007/SC-006).
