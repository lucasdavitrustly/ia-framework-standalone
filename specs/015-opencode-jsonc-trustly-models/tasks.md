# Tasks: OpenCode JSONC Config & Trustly LLM Models

**Input**: Design documents from `/specs/015-opencode-jsonc-trustly-models/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Not explicitly requested in spec. Integration testing via manual installer runs per quickstart.md.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **This project**: Shell scripts in `scripts/`, main installer at root `install.sh`, docs at root `README.md`
- IDE descriptors in `scripts/ide-descriptors/`

---

## Phase 1: Setup

**Purpose**: IDE descriptor update and JSONC read/write helpers

- [X] T001 Update IDE_DETECT_PATH and IDE_MCP_CONFIG to reference opencode.jsonc in scripts/ide-descriptors/opencode.sh
- [X] T002 Add JSONC read helper function (strip comments before JSON.parse) in scripts/configure-mcp.sh

---

## Phase 2: Foundational (Dual-Write Infrastructure)

**Purpose**: Core dual-write mechanism that ALL user stories depend on. MUST complete before any story work begins.

**⚠️ CRITICAL**: The MCP dual-write is the foundation for both US1 (Trustly provider) and US2 (migration)

- [X] T003 Add migration logic to install_mcp_opencode(): seed opencode.jsonc from opencode.json if .jsonc absent in scripts/configure-mcp.sh
- [X] T004 Modify install_mcp_opencode() to dual-write MCP entries to both opencode.json and opencode.jsonc in scripts/configure-mcp.sh
- [X] T005 Add backup logic for malformed opencode.jsonc (backup as .bak.timestamp, create fresh) in scripts/configure-mcp.sh
- [X] T006 Update uninstall_mcp() to remove entries from both opencode.json and opencode.jsonc in scripts/configure-mcp.sh
- [X] T007 Update detect_mcp_state() to check opencode.jsonc (primary) with fallback to opencode.json in scripts/configure-mcp.sh

**Checkpoint**: Dual-write infrastructure ready. MCPs now written to both config files. User story implementation can begin.

---

## Phase 3: User Story 1 - Install with Trustly Models Auto-Configured (Priority: P1) 🎯 MVP

**Goal**: New installations get opencode.jsonc with Trustly-Claude provider and all three Bedrock models configured. User is prompted for API token (empty is valid).

**Independent Test**: Run `./install.sh` on a system with no `~/.config/opencode/opencode.jsonc`, verify file is created with Trustly-Claude provider containing all 3 models and the user-provided (or empty) token.

### Implementation for User Story 1

- [X] T008 [US1] Create configure_trustly_provider() function skeleton in scripts/install-opencode.sh
- [X] T009 [US1] Implement JSONC config path resolution (respect XDG_CONFIG_HOME) in configure_trustly_provider() in scripts/install-opencode.sh
- [X] T010 [US1] Implement existing Trustly-Claude provider detection (skip if present, prompt keep/overwrite) in scripts/install-opencode.sh
- [X] T011 [US1] Implement API token prompt (interactive: read from TTY; non-interactive: skip with empty string) in scripts/install-opencode.sh
- [X] T012 [US1] Implement Trustly-Claude provider merge into opencode.jsonc using inline Node.js (add $schema if missing) in scripts/install-opencode.sh
- [X] T013 [US1] Implement dual-write of Trustly-Claude provider to opencode.json in scripts/install-opencode.sh
- [X] T014 [US1] Add Step 5.3 call to configure_trustly_provider in install.sh (after Step 5.2 skills, before Step 6 services)

**Checkpoint**: Fresh installs produce opencode.jsonc with Trustly models. Token prompt works interactively and non-interactively.

---

## Phase 4: User Story 2 - Existing opencode.json Settings Migrated to JSONC (Priority: P2)

**Goal**: Users with existing opencode.json get full content migrated to opencode.jsonc (all MCPs, permissions, providers, plugins) plus the new Trustly provider added.

**Independent Test**: Create a mock `opencode.json` with MCP entries and permissions, run installer, verify `opencode.jsonc` contains ALL original content plus Trustly-Claude provider. Verify original `opencode.json` is NOT deleted.

### Implementation for User Story 2

- [X] T015 [US2] Ensure configure_trustly_provider() calls the migration seed logic from T003 before adding provider in scripts/install-opencode.sh
- [X] T016 [US2] Verify existing opencode.json is never deleted or truncated (add defensive check) in scripts/install-opencode.sh
- [X] T017 [US2] Handle edge case: opencode.jsonc already exists with partial content — merge, don't overwrite in scripts/install-opencode.sh

**Checkpoint**: Upgrade path works. Existing users get full config migration with zero data loss.

---

## Phase 5: User Story 3 - README Documents Trustly Configuration (Priority: P3)

**Goal**: README.md contains a clear section documenting Trustly Bedrock models, opencode.jsonc format, available models, gateway URL, and how to obtain/update the API token.

**Independent Test**: Read the README section and manually configure opencode.jsonc with Trustly models following only the documented instructions (without running the installer).

### Implementation for User Story 3

- [X] T018 [P] [US3] Add "Trustly LLM Gateway (Amazon Bedrock)" section to README.md documenting provider config, models, and gateway URL
- [X] T019 [P] [US3] Add "OpenCode JSONC Configuration" subsection to README.md explaining the new config format and its relationship to opencode.json
- [X] T020 [US3] Update "Step 8: Connect to OpenCode" section in README.md to reference opencode.jsonc as the primary config file

**Checkpoint**: README provides complete self-service documentation for Trustly model configuration.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Validation, consistency, and cleanup across all stories

- [X] T021 [P] Update any references to opencode.json in README.md "Manually configuring MCP servers" section to mention both files
- [X] T022 [P] Verify install.sh banner/summary output mentions Trustly models configuration
- [X] T023 Run full installer end-to-end (fresh install scenario) and verify per quickstart.md validation commands
- [X] T024 Run upgrade scenario (existing opencode.json → verify migration + Trustly added)
- [X] T025 Run non-interactive scenario (NON_INTERACTIVE=1) and verify empty token written without prompt

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 (IDE descriptor must point to .jsonc before dual-write logic)
- **User Story 1 (Phase 3)**: Depends on Phase 2 (needs dual-write infrastructure)
- **User Story 2 (Phase 4)**: Depends on Phase 2 + Phase 3 (migration logic reuses dual-write; T015 calls T003's logic)
- **User Story 3 (Phase 5)**: No code dependencies — can run in parallel with Phase 3/4 (only README changes)
- **Polish (Phase 6)**: Depends on Phases 3, 4, 5 all complete

### User Story Dependencies

- **User Story 1 (P1)**: Depends on Foundational (Phase 2) — standalone after that
- **User Story 2 (P2)**: Depends on Phase 2 + integrates with US1's configure_trustly_provider() 
- **User Story 3 (P3)**: Independent of US1/US2 code — can start after Phase 1 (only needs knowledge of the config structure)

### Within Each User Story

- Config path resolution before provider detection
- Provider detection before token prompt
- Token prompt before merge/write
- JSONC write before JSON dual-write

### Parallel Opportunities

- T001 and T002 can run in parallel (different files)
- T018, T019 can run in parallel (different README sections)
- User Story 3 (README) can be done entirely in parallel with US1/US2

---

## Parallel Example: User Story 1

```bash
# Sequential within US1 (each step depends on the previous):
Task: "T008 - Create configure_trustly_provider() function skeleton"
Task: "T009 - Implement JSONC config path resolution"
Task: "T010 - Implement existing provider detection"
Task: "T011 - Implement API token prompt"
Task: "T012 - Implement Trustly-Claude provider merge into opencode.jsonc"
Task: "T013 - Implement dual-write to opencode.json"
Task: "T014 - Add Step 5.3 call in install.sh"
```

```bash
# Parallel: US3 can run alongside US1/US2:
Task: "T018 - Add Trustly LLM Gateway section to README.md"
Task: "T019 - Add OpenCode JSONC Configuration subsection to README.md"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (IDE descriptor update + JSONC helper)
2. Complete Phase 2: Foundational (dual-write mechanism)
3. Complete Phase 3: User Story 1 (Trustly provider in Step 5.3)
4. **STOP and VALIDATE**: Run `./install.sh`, check `~/.config/opencode/opencode.jsonc` has Trustly provider
5. Verify both `.json` and `.jsonc` have MCP entries

### Incremental Delivery

1. Setup + Foundational → Dual-write working
2. Add User Story 1 → Fresh installs get Trustly models (MVP!)
3. Add User Story 2 → Upgrade path works for existing users
4. Add User Story 3 → README documentation complete
5. Polish → Full validation across all scenarios

---

## Notes

- All changes are in bash scripts (no TypeScript source) — outside Vitest scope
- The inline `node --input-type=module` pattern is established in configure-mcp.sh — reuse it
- Non-interactive mode: check `is_noninteractive` from installer-helpers.sh
- The `$schema` field (`https://opencode.ai/config.json`) should be added to new files for editor autocompletion
- Commit after each phase checkpoint for clean history
