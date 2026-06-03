# Tasks: Fix MCP Stderr Configuration

**Input**: Design documents from `/specs/004-fix-mcp-stderr-config/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md

**Tests**: Not explicitly requested. Verification is manual (start OpenCode, check logs).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Ensure log directory exists

- [x] T001 Verify logs directory creation in install.sh at scripts/configure-opencode.sh (confirm `mkdir -p` for `.ia-framework/logs/` is already present)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: No foundational tasks needed — this is a single-file fix with no new infrastructure.

**Checkpoint**: Proceed directly to user story implementation.

---

## Phase 3: User Story 1 - OpenCode Starts Successfully (Priority: P1) 🎯 MVP

**Goal**: Fix the broken `stderr` field so OpenCode starts without errors after installation.

**Independent Test**: Run `opencode` after the fix and verify it starts and the ia-framework MCP server connects.

### Implementation for User Story 1

- [x] T002 [US1] Remove the `stderr` property from the new-config creation block (heredoc at line ~119-143) in scripts/configure-opencode.sh — replace `"command": ["node", "${mcp_bin}"]` + `"stderr": "..."` with `"command": ["sh", "-c", "node ${mcp_bin} 2>> ${ia_framework_dir}/.ia-framework/logs/mcp-server.log"]`
- [x] T003 [US1] Update the Node.js merge script (existing-config branch, line ~68-85) in scripts/configure-opencode.sh — when creating a new `ia-framework` entry, use the shell wrapper command format and do NOT include the `stderr` field
- [x] T004 [US1] Add migration logic in the Node.js merge script in scripts/configure-opencode.sh — if existing `config.mcp['ia-framework']` has a `stderr` field, delete it and rewrite `command` to the shell wrapper format
- [x] T005 [US1] Remove the "ensure stderr redirect" block (lines ~80-83) that adds `stderr` to existing configs without it in scripts/configure-opencode.sh

**Checkpoint**: After this phase, running `install.sh` produces a valid `opencode.json` and OpenCode starts successfully.

---

## Phase 4: User Story 2 - MCP Logs Captured to File (Priority: P2)

**Goal**: Ensure stderr output from the MCP server is actually written to the log file via the shell wrapper.

**Independent Test**: Start OpenCode, trigger an MCP tool call, then `cat .ia-framework/logs/mcp-server.log` shows JSON log entries.

### Implementation for User Story 2

- [x] T006 [US2] Verify the shell wrapper command format correctly redirects stderr by testing locally — run `sh -c "node packages/mcp-server/dist/bin.js 2>> .ia-framework/logs/mcp-server.log"` with appropriate env vars and confirm log output
- [x] T007 [US2] Ensure the logs directory is created with `mkdir -p` in install.sh before `configure_opencode` is called (verify existing logic at install.sh line ~235)

**Checkpoint**: MCP server logs appear in `.ia-framework/logs/mcp-server.log` when OpenCode runs.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Documentation and cleanup

- [x] T008 [P] Update quickstart.md verification steps if any details changed during implementation
- [x] T009 Run full verification: `bash install.sh` → start `opencode` → trigger MCP tool → check log file

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **User Story 1 (Phase 3)**: Depends on Phase 1
- **User Story 2 (Phase 4)**: Depends on Phase 3 (needs the correct command format to test log output)
- **Polish (Phase 5)**: Depends on Phase 3 and Phase 4

### Within User Story 1

- T002, T003, T004, T005 are sequential (all modify the same file `scripts/configure-opencode.sh`)

### Parallel Opportunities

- T006 and T007 (User Story 2) can run in parallel
- T008 and T009 (Polish) are sequential (T008 before T009)

---

## Parallel Example: User Story 2

```bash
# These can run in parallel:
Task: "T006 - Verify shell wrapper command format locally"
Task: "T007 - Ensure logs directory creation in install.sh"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete T001: Verify existing log directory setup
2. Complete T002-T005: Fix configure-opencode.sh
3. **STOP and VALIDATE**: Run `install.sh`, then start `opencode` — confirm startup succeeds
4. Deploy immediately if startup works

### Incremental Delivery

1. Fix config format (US1) → OpenCode starts → Immediate value
2. Verify log capture (US2) → Dashboard logs work → Full feature restored
3. Polish → Documentation current → Clean handoff

---

## Notes

- All US1 tasks modify the same file — must be sequential
- The fix is small (single file) but must handle 3 states: fresh install, broken existing, already-fixed
- Commit after T005 for a clean "fix" commit
