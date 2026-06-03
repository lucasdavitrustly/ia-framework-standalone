# Tasks: Fix MCP Stderr Configuration

**Input**: Design documents from `/specs/004-fix-mcp-stderr-config/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story (US1, US2)
- Exact file paths included in descriptions

---

## Phase 1: Setup

**Purpose**: Ensure logs directory and prerequisites exist

- [x] T001 Ensure `.ia-framework/logs/` directory exists (already handled in install.sh line 49, verify)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The OpenCode installation must work before MCP config can be applied

**⚠️ CRITICAL**: MCP configuration depends on OpenCode being installed

- [x] T002 Rewrite `install_opencode()` in scripts/install-opencode.sh to detect platform (`uname -s`) and set platform-aware default method (brew on macOS, curl on Linux)
- [x] T003 Add package manager detection logic in scripts/install-opencode.sh: check availability of brew, npm, bun, paru via `command -v`
- [x] T004 Add interactive method selection menu in scripts/install-opencode.sh: present numbered list of detected methods, read user choice
- [x] T005 Add non-interactive mode support in scripts/install-opencode.sh: skip prompt if `IA_NON_INTERACTIVE=1` or `[ ! -t 0 ]`, auto-select platform default
- [x] T006 Implement each install method in scripts/install-opencode.sh: `curl -fsSL https://opencode.ai/install | bash`, `npm i -g opencode-ai`, `bun add -g opencode-ai`, `brew install anomalyco/tap/opencode`, `paru -S opencode`
- [x] T007 Keep existing skip-if-installed check at top of `install_opencode()` in scripts/install-opencode.sh (already present, verify uses correct binary name)

**Checkpoint**: OpenCode can be installed via any detected method. Foundation ready.

---

## Phase 3: User Story 1 - OpenCode Starts Successfully (Priority: P1) 🎯 MVP

**Goal**: OpenCode starts without errors when ia-framework MCP server is configured

**Independent Test**: Run `opencode` after install and verify startup + MCP connection

### Implementation for User Story 1

- [x] T008 [US1] Verify `configure_opencode()` in scripts/configure-opencode.sh generates correct shell wrapper command `["sh", "-c", "node <bin> 2>> <logfile>"]` for fresh installs (line 131)
- [x] T009 [US1] Verify migration logic in scripts/configure-opencode.sh removes `stderr` field and rewrites `command` for broken existing configs (lines 82-91)
- [x] T010 [US1] Verify `configure_opencode()` skips already-correct configs (command starts with `sh`) in scripts/configure-opencode.sh (line 84)
- [x] T011 [US1] Test end-to-end: run install.sh on system with broken config, verify OpenCode starts

**Checkpoint**: OpenCode starts successfully with corrected MCP config.

---

## Phase 4: User Story 2 - MCP Server Logs Captured (Priority: P2)

**Goal**: MCP server stderr is captured to `.ia-framework/logs/mcp-server.log`

**Independent Test**: Start OpenCode, trigger MCP tool call, verify log entries in `.ia-framework/logs/mcp-server.log`

### Implementation for User Story 2

- [x] T012 [US2] Verify shell wrapper `2>>` redirect in scripts/configure-opencode.sh creates log file if it doesn't exist (shell creates on first write)
- [x] T013 [US2] Verify logs directory creation in install.sh (line 49: `mkdir -p "$LOG_DIR"`) handles the case where directory doesn't exist
- [x] T014 [US2] Test end-to-end: start OpenCode, call an MCP tool, verify JSON log entries appear in `.ia-framework/logs/mcp-server.log`

**Checkpoint**: MCP server logs are captured and visible to dashboard.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [x] T015 [P] Update install.sh banner or help text if needed to mention OpenCode install method choice
- [x] T016 [P] Run quickstart.md validation steps end-to-end
- [x] T017 Remove old package name `@opencode-sh/opencode` references from scripts/install-opencode.sh

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Phase 1
- **US1 (Phase 3)**: Depends on Phase 2 (OpenCode must be installable)
- **US2 (Phase 4)**: Depends on Phase 3 (config must be correct for logs to work)
- **Polish (Phase 5)**: Depends on Phase 3 and 4

### User Story Dependencies

- **US1**: Independent after foundational phase
- **US2**: Depends on US1 (correct config needed for log capture to work)

### Parallel Opportunities

- T002, T003, T005 can be developed in parallel (different concerns in same file but non-overlapping functions)
- T008, T009, T010 are verification tasks that can run in parallel
- T015, T016, T017 are independent polish tasks

---

## Parallel Example: Foundational Phase

```bash
# These modify different sections of install-opencode.sh:
Task: "T002 - Platform detection logic"
Task: "T003 - Package manager detection"
Task: "T005 - Non-interactive mode support"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (verify logs dir)
2. Complete Phase 2: Rewrite install-opencode.sh with multi-method install
3. Complete Phase 3: Verify/fix configure-opencode.sh produces valid config
4. **STOP and VALIDATE**: Run `opencode` — it should start without errors

### Incremental Delivery

1. Phase 2 → OpenCode installs correctly via chosen method
2. Phase 3 → OpenCode starts with correct MCP config (MVP!)
3. Phase 4 → Logs confirmed working
4. Phase 5 → Cleanup and validation

---

## Notes

- Most of the MCP config fix is already implemented in `configure-opencode.sh`
- Primary new work is rewriting `scripts/install-opencode.sh` for multi-method install
- The constitution's TDD principle is N/A for shell scripts (manual verification)
- Commit after each phase completion
