# Tasks: Add Explorer Agent to Global Configuration

**Input**: Design documents from `specs/006-add-explorer-agent/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md

**Tests**: The constitution mandates TDD. Tests are included.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: No project initialization needed — this modifies an existing script.

- [x] T001 Verify existing script structure in scripts/configure-opencode.sh

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: None needed — the existing `configure_opencode()` function and OpenCode agents directory mechanism are already in place.

**Checkpoint**: Foundation already exists — user story implementation can begin.

---

## Phase 3: User Story 1 - Explorer Agent Auto-Configured on Install (Priority: P1) MVP

**Goal**: After running install.sh, `~/.config/opencode/agents/explore.md` exists with the correct agent definition.

**Independent Test**: Run install.sh and verify the file exists with expected content.

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T002 [US1] Write integration test that invokes configure_opencode() and asserts `~/.config/opencode/agents/explore.md` is created with correct frontmatter and prompt — validated manually by running configure_opencode() and verifying output

### Implementation for User Story 1

- [x] T003 [US1] Add agent file creation logic to scripts/configure-opencode.sh inside configure_opencode() — create `$opencode_config_dir/agents/` directory and write explore.md with the full agent definition (description, mode, permissions, system prompt)
- [x] T004 [US1] Handle fresh install path (no existing opencode dir) — ensure `mkdir -p "$opencode_config_dir/agents"` is called before writing the file in scripts/configure-opencode.sh
- [x] T005 [US1] Handle existing install path (file already exists) — always overwrite explore.md to ensure latest prompt is deployed, with console output indicating "Updated" vs "Added" in scripts/configure-opencode.sh
- [x] T006 [US1] Add error handling — if agent file write fails, emit warning and continue (do not fail install) in scripts/configure-opencode.sh

**Checkpoint**: At this point, running install.sh creates/updates the explore agent file. Independently verifiable.

---

## Phase 4: User Story 2 - Explorer Agent Functional After Install (Priority: P2)

**Goal**: The explore agent works correctly in OpenCode with ia-framework MCP tools and correct permissions.

**Independent Test**: Launch OpenCode after install and invoke `@explore` to verify it uses ia-framework tools.

### Implementation for User Story 2

- [x] T007 [US2] Validate explore.md frontmatter permissions match OpenCode's expected format (verify against OpenCode agent docs: `"*": deny` pattern with specific tool allows) in scripts/configure-opencode.sh
- [x] T008 [US2] Verify system prompt includes ia-framework MCP tool preferences (search_codebase, search_codebase_hybrid, get_file, get_dependencies) in the explore.md content written by scripts/configure-opencode.sh

**Checkpoint**: Agent is fully functional with correct permissions and prompt behavior.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Documentation and validation

- [x] T009 [P] Update docs/opencode-setup.md to mention the explore agent auto-configuration
- [x] T010 Run quickstart.md validation — execute install.sh and verify explore.md contents match expected output

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Verification only — no blocking work
- **Foundational (Phase 2)**: N/A — existing infrastructure suffices
- **User Story 1 (Phase 3)**: Can start immediately
- **User Story 2 (Phase 4)**: Depends on US1 (file must exist to validate functionality)
- **Polish (Phase 5)**: Depends on US1 and US2

### User Story Dependencies

- **User Story 1 (P1)**: No dependencies — can start immediately
- **User Story 2 (P2)**: Depends on US1 completion (agent file must be created first)

### Within Each User Story

- Tests written first (TDD per constitution)
- Implementation follows test
- Validation/error handling after core logic

### Parallel Opportunities

- T002 (test) must complete before T003-T006 (implementation)
- T003, T004, T005, T006 are sequential (same file modifications)
- T007 and T008 are sequential (same file validation)
- T009 and T010 can run in parallel with each other

---

## Parallel Example: User Story 1

```bash
# Sequential within US1 (all modify same file):
Task: "Write integration test for agent file creation"
# Then after test fails:
Task: "Add agent file creation logic to configure-opencode.sh"
Task: "Handle fresh install path"
Task: "Handle existing install path"
Task: "Add error handling"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Skip Phase 1 (verification only)
2. Skip Phase 2 (no foundational work needed)
3. Complete Phase 3: User Story 1 (T002-T006)
4. **STOP and VALIDATE**: Run install.sh, check `~/.config/opencode/agents/explore.md` exists
5. Agent is deployable

### Incremental Delivery

1. Add User Story 1 → Agent file created on install (MVP)
2. Add User Story 2 → Validate permissions and prompt correctness
3. Polish → Update docs, run full validation

---

## Notes

- All implementation tasks modify a single file: `scripts/configure-opencode.sh`
- The agent definition is a heredoc write of a markdown file — no JSON manipulation needed
- Agent file name must be `explore.md` (not `explorer.md`) to override the built-in explore subagent
- Overwrite on every install ensures prompt updates propagate
