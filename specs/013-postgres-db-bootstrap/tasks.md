---
description: 'Task list for PostgreSQL db.json Bootstrap + MCP Descriptor Alignment + README Refresh'
---

# Tasks: PostgreSQL db.json Bootstrap + MCP Descriptor Alignment + README Refresh

**Input**: Design documents from `/specs/013-postgres-db-bootstrap/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Included for the TypeScript change (CLI `db configure` hardening) because the constitution mandates TDD (Principle I). Bash installer changes are verified via `quickstart.md` manual/CI steps.

**Organization**: Tasks grouped by user story. US1 (db.json bootstrap, P1) and US2 (MCP descriptor alignment, P1) are the MVP; US3 (README, P2) follows.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1, US2, US3
- Exact file paths included

## Path Conventions

pnpm monorepo. Relevant paths: `install.sh`, `scripts/`, `mcps/`, `packages/cli/src/commands/`, `packages/db-context/src/`, `README.md`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm build/test baseline before changes

- [x] T001 Verify baseline builds and record the pre-existing strict error: run `pnpm --filter @ia-framework/cli build` and note the `packages/cli/src/commands/db.command.ts:160` `string | undefined` error (documented in research.md R1)
- [x] T002 [P] Confirm current MCP descriptors on disk: list `mcps/` and read `mcps/postgres-mcp/mcp.json` and `mcps/jira-mcp/mcp.json` to confirm they match the "before" state in data-model.md

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Harden the single `db.json` writer so both the installer flow (US1) and CLI users share correct behavior. This BLOCKS US1.

**⚠️ CRITICAL**: US1 depends on the CLI writing `db.json` even when `.ia-framework/` is absent.

- [x] T003 [US1] Write failing test in `packages/cli/src/commands/db.command.test.ts`: `db configure` writes `db.json` to a target framework dir whose `.ia-framework/` parent does NOT yet exist (asserts folder is created and file matches `DatabaseConfigSchema`)
- [x] T004 [US1] Fix pre-existing strict-mode error at `packages/cli/src/commands/db.command.ts:160` (guard `config.targetProjectPath` being `string | undefined` in the `index` subcommand) so `pnpm build` stays green
- [x] T005 [US1] Harden `configureSubcommand` in `packages/cli/src/commands/db.command.ts`: `mkdir -p` (via `node:fs/promises` `mkdir` with `{recursive:true}`) the `dirname(dbConfigPath)` before `writeFile` so T003 passes
- [x] T006 [US1] Run `pnpm --filter @ia-framework/cli test` and `pnpm --filter @ia-framework/cli build`; confirm T003 passes and no strict errors remain

**Checkpoint**: `ia-framework db configure` creates `.ia-framework/` and writes valid `db.json`.

---

## Phase 3: User Story 1 - Configure PostgreSQL & persist db.json during install (Priority: P1) 🎯 MVP

**Goal**: When the user selects the PostgreSQL MCP in install Step 5.1, the installer prompts for connection details, creates `.ia-framework/` if missing, and writes `db.json`, with a keep/overwrite guard.

**Independent Test**: On a clean checkout with no `.ia-framework/`, run `./install.sh`, select PostgreSQL, enter details → `.ia-framework/db.json` exists with entered values; folder auto-created.

### Implementation for User Story 1

- [x] T007 [US1] In `scripts/configure-mcp.sh`, add a `configure_postgres_db_json()` helper that: checks whether `postgres` is in `SELECTED_MCPS`; if `db.json` exists, uses `prompt_yn "db.json already exists — overwrite?" N` (from `installer-helpers.sh`) defaulting to keep; otherwise invokes the built CLI `node "${ia_dir}/packages/cli/dist/bin.js" db configure --config "${config_path}"` to prompt + write (single source of truth per research.md R1/R4)
- [x] T008 [US1] In `scripts/configure-mcp.sh` `configure_mcps()`, call `configure_postgres_db_json` when `postgres` is among `SELECTED_MCPS`, before installing the postgres MCP into each IDE (so the DSN is available for substitution in US2)
- [x] T009 [US1] Ensure non-interactive safety: in `configure_postgres_db_json`, when `is_noninteractive` is true, skip prompting/writing `db.json` (do not hang) and emit a `⚠` note — satisfies FR-012
- [x] T010 [US1] Guard against missing CLI binary: if `packages/cli/dist/bin.js` is absent, print a clear `⚠` message telling the user to run `pnpm build` then `ia-framework db configure`, and continue install without failing (mirrors existing installer soft-fail style)

**Checkpoint**: Selecting PostgreSQL in the installer produces a valid `.ia-framework/db.json`, folder auto-created, idempotent on re-run. Validate via quickstart.md §1 and §3.

---

## Phase 4: User Story 2 - Install actual PostgreSQL & Atlassian MCP connections with placeholders (Priority: P1)

**Goal**: Installer writes IDE MCP entries matching the user's working setup — PostgreSQL via `@modelcontextprotocol/server-postgres` with a DSN built from `db.json`; Atlassian via `mcp-remote` replacing Jira — with only placeholders committed.

**Independent Test**: Select PostgreSQL + Atlassian in installer → OpenCode config has a `postgres` entry ending in a valid `postgresql://` DSN and an `atlassian` entry running `mcp-remote@latest https://mcp.atlassian.com/v1/mcp/authv2`; committed descriptors carry no credentials.

### Implementation for User Story 2

- [x] T011 [P] [US2] Rewrite `mcps/postgres-mcp/mcp.json` to the contract in `contracts/postgres-mcp.contract.md`: command `["npx","-y","@modelcontextprotocol/server-postgres","{{POSTGRES_CONNECTION_STRING}}"]`, empty `environment`, drop `POSTGRES_CONNECTION_STRING` env
- [x] T012 [P] [US2] Create `mcps/atlassian-mcp/mcp.json` per `contracts/atlassian-mcp.contract.md` (id `atlassian`, command `["npx","-y","mcp-remote@latest","https://mcp.atlassian.com/v1/mcp/authv2"]`)
- [x] T013 [P] [US2] Delete `mcps/jira-mcp/` directory (replaced by atlassian-mcp) — satisfies FR-009 / CK-A1
- [x] T014 [US2] Add a DSN builder in `scripts/configure-mcp.sh` (Node one-liner) that reads `.ia-framework/db.json` and outputs `postgresql://<user>:<encodeURIComponent(password)>@<host>:<port>/<database>` with `?sslmode=require` when `ssl` is true (FR-011, research.md R3)
- [x] T015 [US2] Extend `_resolve_mcp_command` in `scripts/configure-mcp.sh` to substitute `{{POSTGRES_CONNECTION_STRING}}` with the DSN from T014 when the descriptor id is `postgres`; keep existing `{{MCP_BIN}}`/`{{LOG_FILE}}`/`{{CONFIG_PATH}}` substitutions unchanged (contract postgres-mcp §Substitution)
- [x] T016 [US2] Verify placeholder-only invariant: confirm committed `mcps/postgres-mcp/mcp.json` contains `{{POSTGRES_CONNECTION_STRING}}` and no credentials; `mcps/atlassian-mcp/mcp.json` contains only the public endpoint URL (FR-010 / SC-002)

**Checkpoint**: US1 + US2 both work: installer writes working postgres (DSN) + atlassian MCP entries; validate via quickstart.md §2 and §4.

---

## Phase 5: User Story 3 - README reflects current usage, MCPs, configuration, commands (Priority: P2)

**Goal**: `README.md` documents the current install flow (db.json bootstrap + folder auto-create), the full MCP set (PostgreSQL + Atlassian, placeholder DSN examples, no stale Jira), configuration, and commands.

**Independent Test**: Read README end-to-end; every documented install step, MCP, config key, and command matches actual behavior (0 mismatches for covered sections).

### Implementation for User Story 3

- [x] T017 [US3] Update install-flow sections of `README.md` (Quick Start / Manual Setup / Database Context) to document the PostgreSQL db.json bootstrap triggered by selecting the PostgreSQL MCP and the automatic creation of `.ia-framework/` (FR-013)
- [x] T018 [US3] Update the "Extending with MCP Servers" / MCP list in `README.md`: add PostgreSQL (with placeholder `postgresql://USER:PASSWORD@HOST:5432/DB` example) and Atlassian (remote MCP), and remove/correct the stale Jira entry (FR-014)
- [x] T019 [US3] Reconcile the CLI Reference and MCP Tools sections of `README.md` with the actual current command surface (including `ia-framework db configure|connect|index|status`) so documented behavior matches actual (FR-015)
- [x] T020 [US3] Grep-verify docs: `rg "jira" README.md` returns no stale "current integration" references; `rg "db.json|atlassian|@modelcontextprotocol/server-postgres" README.md` confirms the new content is present (quickstart.md §6 / SC-004)

**Checkpoint**: README matches delivered behavior.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final validation across all stories

- [x] T021 Run full `pnpm build` and `pnpm test` at repo root; confirm green (Quality Gate)
- [x] T022 Execute `quickstart.md` end-to-end (§1–§6) against a scratch framework dir; confirm all expected outcomes, including non-interactive `CI=1 ./install.sh` does not hang (FR-012)
- [x] T023 [P] Final credential sweep: `rg -n "paywithmybank|password.*=|postgresql://[^{]" mcps/ install.sh scripts/` returns no real credentials in committed files (SC-002)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup; BLOCKS US1 (CLI must write db.json + build green)
- **US1 (Phase 3)**: Depends on Foundational (needs hardened `db configure`)
- **US2 (Phase 4)**: Depends on US1 for the runtime DSN (T014/T015 read the `db.json` US1 produces), but descriptor edits (T011–T013) are independent and can start after Setup
- **US3 (Phase 5)**: Depends on US1 + US2 being decided (documents their behavior); can be drafted in parallel but verified after
- **Polish (Phase 6)**: Depends on all stories

### User Story Dependencies

- **US1 (P1)**: After Foundational. MVP core.
- **US2 (P1)**: Descriptor tasks independent; DSN-substitution tasks depend on US1's db.json.
- **US3 (P2)**: After US1 + US2.

### Within Each User Story

- Foundational tests (T003) FAIL before implementation (T004/T005)
- DSN builder (T014) before substitution wiring (T015)
- Descriptor files (T011–T013) before/independent of substitution

### Parallel Opportunities

- T002 [P] alongside T001
- T011, T012, T013 [P] — different files/dirs under `mcps/`
- T023 [P] in polish
- US3 doc drafting can overlap US2 once behavior is fixed

---

## Parallel Example: User Story 2 descriptor edits

```bash
# These touch different files and have no interdependencies:
Task: "Rewrite mcps/postgres-mcp/mcp.json (T011)"
Task: "Create mcps/atlassian-mcp/mcp.json (T012)"
Task: "Delete mcps/jira-mcp/ (T013)"
```

---

## Implementation Strategy

### MVP First (US1 + US2)

1. Phase 1: Setup
2. Phase 2: Foundational (harden `db configure`, fix build) — CRITICAL
3. Phase 3: US1 (installer writes db.json)
4. Phase 4: US2 (descriptor alignment + DSN substitution)
5. **STOP and VALIDATE** via quickstart §1–§4
6. Demo: installer produces a working PostgreSQL + Atlassian MCP setup

### Incremental Delivery

1. Foundational → CLI writes db.json reliably
2. US1 → installer bootstrap (test via quickstart §1/§3)
3. US2 → working MCP entries (test via quickstart §2/§4)
4. US3 → docs match (test via quickstart §6)

---

## Notes

- [P] tasks = different files, no dependencies
- Constitution: TDD for the TS change (T003 before T004/T005); commit after each logical unit
- Keep placeholders only in committed files; never commit real credentials
- Verify `pnpm build` stays green after touching `db.command.ts` (fixes pre-existing L160 error)
