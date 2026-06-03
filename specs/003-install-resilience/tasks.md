# Tasks: Install Script Resilience & Defaults

**Input**: Design documents from `/specs/003-install-resilience/`

**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Included per constitution (TDD required — Vitest for TS packages).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization, log directory setup, shared utilities

- [x] T001 Create `.ia-framework/logs/` directory setup in install.sh
- [x] T002 [P] Add log file truncation logic at start of install.sh

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core changes that MUST be complete before user story phases (shared script structure, route registration)

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T003 Register logs route in packages/dashboard-api/src/app.ts
- [x] T004 [P] Add Logs nav item and `/logs` route in apps/dashboard/src/App.tsx
- [x] T005 [P] Create API client module in apps/dashboard/src/api/logs.ts

**Checkpoint**: Foundation ready — user story implementation can now begin

---

## Phase 3: User Story 1 — Node Version Gate (Priority: P1) 🎯 MVP

**Goal**: The installer immediately verifies Node.js 22+ is active and halts with clear guidance if not.

**Independent Test**: Run `./install.sh` with Node 18 active — installer displays a clear message, offers to install, and exits cleanly without executing any build steps.

### Tests for User Story 1

- [x] T006 [US1] Manual test script documenting scenarios (Node missing, Node 18, Node 22) in specs/003-install-resilience/quickstart.md validation

### Implementation for User Story 1

- [x] T007 [US1] Implement `check_node_active()` gate function in scripts/check-prerequisites.sh — checks `node --version` ≥ 22, displays formatted error box if not
- [x] T008 [US1] Implement interactive install offer in scripts/check-prerequisites.sh — prompts user, calls existing `install_node`, re-verifies active version
- [x] T009 [US1] Integrate Node gate as first step in install.sh — call `check_node_active` before any build steps, exit 1 on failure
- [x] T010 [US1] Display "please activate" message when Node 22 is installed but not active in scripts/check-prerequisites.sh

**Checkpoint**: Node version gate fully functional — installer fails fast on wrong version

---

## Phase 4: User Story 2 — MCP Log Visibility in Dashboard (Priority: P2)

**Goal**: Developers can view MCP server logs in the dashboard Logs page for debugging startup failures.

**Independent Test**: Misconfigure MCP server, open dashboard at `/logs`, verify error log lines appear with timestamps, levels, and messages.

### Tests for User Story 2

- [x] T011 [P] [US2] Write Vitest tests for logs route in packages/dashboard-api/src/routes/logs.test.ts — covers: empty file, valid entries, level filtering, limit, malformed lines skipped, file not found
- [x] T012 [P] [US2] Write Vitest tests for LogsPage component in apps/dashboard/src/pages/LogsPage.test.tsx — covers: renders entries, level filter, refresh button, empty state

### Implementation for User Story 2

- [x] T013 [US2] Implement `logsRouter` in packages/dashboard-api/src/routes/logs.ts — reads `.ia-framework/logs/mcp-server.log`, parses pino JSON lines, filters by level, limits entries, returns LogEntry[] response per contract
- [x] T014 [US2] Modify MCP server command in scripts/configure-opencode.sh — add stderr redirect `2>> .ia-framework/logs/mcp-server.log`
- [x] T015 [US2] Implement LogsPage UI in apps/dashboard/src/pages/LogsPage.tsx — table with timestamp/level/component/message, level filter dropdown, refresh button, auto-refresh toggle (5s polling), "No logs yet" empty state
- [x] T016 [US2] Wire API client in apps/dashboard/src/api/logs.ts to call GET /api/logs with level and limit params

**Checkpoint**: MCP logs viewable in dashboard — errors visible within 5 seconds of page load

---

## Phase 5: User Story 3 — Correct Defaults Out of the Box (Priority: P3)

**Goal**: Fresh installs produce a valid `project.json` with correct embedding model, prefixes, multi-repo format, and localhost vector store host.

**Independent Test**: Run `./install.sh` on a fresh setup, inspect `.ia-framework/project.json` — verify repos array, embedding model/prefixes/dimensions, vectorStore host.

### Implementation for User Story 3

- [x] T017 [US3] Update fallback config template in scripts/init-config.sh — use `repos` array format with derived name, set embedding to `qwen3-embedding:0.6b` with dimensions 1024 and prefixes object, set vectorStore host to `localhost`
- [x] T018 [US3] Implement config merge logic in scripts/init-config.sh — backup to `.bak`, merge missing fields (prefixes, host, repos conversion) without overwriting existing values using inline Node script
- [x] T019 [US3] Update Ollama default model selection in scripts/init-config.sh — set `SELECTED_EMBED_MODEL=qwen3-embedding:0.6b` and `SELECTED_EMBED_DIMS=1024`, pull automatically
- [x] T020 [US3] Add multi-repo hint message after config creation in scripts/init-config.sh — print instructions on adding more repos to the array

**Checkpoint**: Fresh install produces fully valid project.json — no manual edits needed

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Validation and cleanup across all stories

- [x] T021 [P] Run quickstart.md validation — execute all test scenarios end-to-end
- [x] T022 Verify install.sh full flow: Node gate → config write → log setup → MCP redirect all work together

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS user stories 2 & 3 (US1 is bash-only, can start after Phase 1)
- **User Story 1 (Phase 3)**: Depends on Phase 1 only (bash scripts, no dashboard)
- **User Story 2 (Phase 4)**: Depends on Phase 2 (needs route registration and nav)
- **User Story 3 (Phase 5)**: Depends on Phase 1 only (bash scripts)
- **Polish (Phase 6)**: Depends on all user stories complete

### User Story Dependencies

- **US1 (Node Gate)**: Independent — bash only, no cross-story deps
- **US2 (MCP Logs)**: Independent — dashboard only, no cross-story deps
- **US3 (Defaults)**: Independent — bash only, no cross-story deps

### Parallel Opportunities

- US1 and US3 can run fully in parallel (both bash, different files)
- US2 tests (T011, T012) can run in parallel
- Phase 2 tasks T003, T004, T005 can run in parallel

---

## Parallel Example: User Story 2

```bash
# Launch tests in parallel:
Task: "Vitest tests for logs route in packages/dashboard-api/src/routes/logs.test.ts"
Task: "Vitest tests for LogsPage in apps/dashboard/src/pages/LogsPage.test.tsx"

# After tests written, implementation:
Task: "Implement logsRouter in packages/dashboard-api/src/routes/logs.ts"
Task: "Implement LogsPage UI in apps/dashboard/src/pages/LogsPage.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001, T002)
2. Complete Phase 3: User Story 1 (T007–T010)
3. **STOP and VALIDATE**: Test Node gate independently
4. Installer now fails fast on wrong Node version

### Incremental Delivery

1. Setup → US1 (Node Gate) → Validate (MVP!)
2. Foundational → US2 (MCP Logs) → Validate
3. US3 (Defaults) → Validate
4. Polish → Full integration test

### Parallel Strategy

- Developer A: US1 + US3 (both bash, different files)
- Developer B: Foundational → US2 (dashboard)
