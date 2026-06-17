# Tasks: IDE-Agnostic MCP & Skills Installation

**Input**: Design documents from `specs/012-mcp-skills-ide-agnostic/`

**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, quickstart.md ✓

**Organization**: Tasks grouped by user story for independent implementation and testing. No automated tests generated (shell scripting feature — verified manually per quickstart.md).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no shared dependencies)
- **[Story]**: User story label (US1–US5)
- Exact file paths in every description

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Bring PR #59 content into the branch, normalize skill layouts, create the descriptor file skeleton, and establish the shared helper script that all installer scripts depend on.

- [x] T001 Merge PR #59 content into branch — import `skills/`, `mcps/` placeholder dirs, and PR's `scripts/install-skills.sh` (will be replaced in later tasks)
- [x] T002 Remove `skills/tab-spec-driven/` directory
- [x] T003 [P] Flatten `skills/tab-refuter/tab-refuter-src/` — move `agents/`, `commands/`, `hooks/`, `templates/` directly under `skills/tab-refuter/` and delete `tab-refuter-src/`
- [x] T004 [P] Flatten `skills/tab-ticket-reader/tab-spec-formatter-src/` — move `agents/`, `commands/`, `hooks/`, `templates/` directly under `skills/tab-ticket-reader/` and delete `tab-spec-formatter-src/`
- [x] T005 [P] Fetch `tlc-spec-driven` content from upstream (`tech-leads-club/agent-skills` v2.0.0) — populate `skills/tlc-spec-driven/SKILL.md`, `README.md`, `references/`
- [x] T006 Create `scripts/ide-descriptors/` directory
- [x] T007 Create `scripts/installer-helpers.sh` — shared functions: `detect_ides()`, `prompt_ide_select()`, `is_noninteractive()`, `prompt_yn()`, `detect_link_state()`, `json_merge_hooks()` (implementations per research.md D-01, D-02, D-06, D-07)

**Checkpoint**: Skills normalized, descriptor dir created, helpers available for sourcing

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: All descriptor files and skill/MCP JSON metadata that installer scripts depend on. Nothing in Phase 3+ can work until all descriptors and `skill.json`/`mcp.json` files exist.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### IDE Descriptors

- [x] T008 [P] Create `scripts/ide-descriptors/opencode.sh` — variables per data-model.md IDE Descriptor table (detect: `~/.config/opencode/opencode.json`, commands dir: `command` singular, MCP format: `opencode-json`, agent format: `md`)
- [x] T009 [P] Create `scripts/ide-descriptors/claude-code.sh` — (detect: `~/.claude/`, MCP format: `claude-json`, hooks global: `~/.claude/hooks/`, agent format: `md`)
- [x] T010 [P] Create `scripts/ide-descriptors/codex.sh` — (detect: `~/.codex/config.toml`, MCP format: `codex-toml`, agent format: `toml`, `IDE_SUPPORTS_COMMANDS="false"`)
- [x] T011 [P] Create `scripts/ide-descriptors/vscode-copilot.sh` — (detect: `~/.vscode/`, MCP format: `vscode-json`, `IDE_SUPPORTS_HOOKS="false"`, `IDE_SUPPORTS_COMMANDS="false"`)
- [x] T012 [P] Create `scripts/ide-descriptors/cursor.sh` — (detect: `~/.cursor/`, agent format: `md`, `IDE_SUPPORTS_HOOKS="false"`, `IDE_SUPPORTS_COMMANDS="false"`)
- [x] T013 [P] Create `scripts/ide-descriptors/gemini.sh` — (detect: `~/.gemini/`, skills dir: `~/.gemini/skills/`, `IDE_SUPPORTS_HOOKS="false"`, `IDE_SUPPORTS_COMMANDS="false"`)
- [x] T014 [P] Create `scripts/ide-descriptors/windsurf.sh` — (detect: `~/.codeium/windsurf/`, skills dir: `~/.codeium/windsurf/skills/`, `IDE_SUPPORTS_HOOKS="false"`, `IDE_SUPPORTS_COMMANDS="false"`)

### Skill Descriptors

- [x] T015 [P] Create `skills/grill-with-docs/skill.json` — `name`, `version`, `description`, `upstream`, `requires_mcps: []`, `assets: {skill:true, agents:false, commands:false, hooks:false}`
- [x] T016 [P] Create `skills/tab-refuter/skill.json` — `requires_mcps: ["ia-framework","context7"]`, `assets: {skill:true, agents:true, commands:true, hooks:true}`
- [x] T017 [P] Create `skills/tab-ticket-reader/skill.json` — `requires_mcps: ["jira","ia-framework"]`, `assets: {skill:true, agents:true, commands:true, hooks:true}`
- [x] T018 [P] Create `skills/tlc-spec-driven/skill.json` — `version: "2.0.0"`, `upstream: "https://github.com/tech-leads-club/agent-skills"`, `requires_mcps: []`, `assets: {skill:true, agents:false, commands:false, hooks:false}`

### MCP Descriptors

- [x] T019 [P] Create `mcps/ia-framework-mcp/mcp.json` — `default:true`, `requires_build:true`, `command_template` with `{{MCP_BIN}}`, `{{LOG_FILE}}`, `{{CONFIG_PATH}}` placeholders (absorbs logic from `scripts/configure-opencode.sh`)
- [x] T020 [P] Create `mcps/context7-mcp/mcp.json` — `default:true`, `command: ["npx","-y","@upstash/context7-mcp@latest"]`
- [x] T021 [P] Create `mcps/sequential-thinking-mcp/mcp.json` — `default:true`, `command: ["npx","-y","@modelcontextprotocol/server-sequential-thinking"]`
- [x] T022 [P] Create `mcps/jira-mcp/mcp.json` — `default:false`, `command: ["npx","-y","@anthropic-ai/mcp-server-jira"]`
- [x] T023 [P] Create `mcps/postgres-mcp/mcp.json` — `default:false`, `command: ["npx","-y","@anthropic-ai/mcp-server-postgres"]`

**Checkpoint**: All descriptors exist and are valid JSON/shell. Installer scripts can now be written against them.

---

## Phase 3: User Story 1 — Interactive MCP Selection (Priority: P1) 🎯 MVP

**Goal**: Replace the current silent `configure-opencode.sh` with an interactive, descriptor-driven MCP installer that prompts per MCP and per IDE, with skip/reinstall/uninstall on re-run.

**Independent Test**: `./install.sh` on clean system → select OpenCode → accept only `context7` → verify only `context7` in `~/.config/opencode/opencode.json`. Re-run → "already configured" prompt appears for `context7`.

### Implementation

- [x] T024 [US1] Create `scripts/configure-mcp.sh` — `scan_mcps()` reads all `mcps/*/mcp.json`, builds ordered list with `default` flag; entry point `configure_mcps()` sources helpers and orchestrates flow
- [x] T025 [US1] Add `detect_mcp_state()` to `scripts/configure-mcp.sh` — uses `node --input-type=module` inline to check if MCP `id` key exists in IDE's MCP config file; returns `configured` or `absent`
- [x] T026 [US1] Add `prompt_mcp_select()` to `scripts/configure-mcp.sh` — interactive numbered list, default MCPs pre-ticked; CI mode silently selects all `default:true` MCPs
- [x] T027 [US1] Add `install_mcp_opencode()` to `scripts/configure-mcp.sh` — `node --input-type=module` merges MCP entry into `~/.config/opencode/opencode.json`; handles `ia-framework` placeholder substitution (`{{MCP_BIN}}`, `{{LOG_FILE}}`, `{{CONFIG_PATH}}`)
- [x] T028 [US1] Add `install_mcp_claude()` to `scripts/configure-mcp.sh` — merges into `~/.claude/settings.json` under `"mcp"` key using same node pattern
- [x] T029 [US1] Add `install_mcp_codex()` to `scripts/configure-mcp.sh` — writes/updates `~/.codex/config.toml` TOML format for MCP entries
- [x] T030 [US1] Add `install_mcp_vscode()` to `scripts/configure-mcp.sh` — writes/updates `.vscode/mcp.json` format
- [x] T031 [US1] Add `uninstall_mcp()` and `reinstall_mcp()` to `scripts/configure-mcp.sh` — remove/replace MCP entry per IDE format
- [x] T032 [US1] Add `prompt_mcp_action()` to `scripts/configure-mcp.sh` — given state `configured`|`absent`, presents correct prompt: skip/reinstall/uninstall or install; CI mode: always installs missing, skips present
- [x] T033 [US1] Add MCP dependency warning in `install_skill()` — after skill MCP deps resolved, print `⚠ <skill> requires <mcp> which was not installed in this session` if any `requires_mcps` entry not in `SELECTED_MCPS` (FR-032)

**Checkpoint**: `./install.sh` Step 6.1 fully interactive with correct prompts, idempotent on re-run, works for OpenCode at minimum.

---

## Phase 4: User Story 2 — Skills as Live Links (Priority: P1) 🎯 MVP

**Goal**: Replace PR #59's silent `install-skills.sh` with an interactive, symlink-based skill installer. Skills directory symlinked; agents/commands/hooks individually symlinked per IDE capability.

**Independent Test**: `./install.sh` → select OpenCode + `tlc-spec-driven` → verify `readlink ~/.config/opencode/skills/tlc-spec-driven` points to `<ia-framework>/skills/tlc-spec-driven`. Modify a file in `skills/tlc-spec-driven/`, verify change immediately visible in linked path.

### Implementation

- [x] T034 [US2] Create `scripts/install-skills.sh` — `scan_skills()` reads all `skills/*/skill.json`; entry point `setup_skills()` sources helpers and orchestrates flow
- [x] T035 [US2] Add `prompt_skill_select()` to `scripts/install-skills.sh` — numbered list with "Install all? [Y/n]" shortcut; CI mode silently selects all skills
- [x] T036 [US2] Add `install_skill()` to `scripts/install-skills.sh` — Step 1: `mkdir -p "$IDE_SKILLS_DIR" && ln -sfn "$skill_dir" "${IDE_SKILLS_DIR}/${skill_name}"`; Step 2: if `assets.agents=true` and `IDE_AGENT_FORMAT=md`: per-file symlinks into `$IDE_AGENTS_DIR`; Step 3: if `assets.commands=true` and `IDE_SUPPORTS_COMMANDS=true`: per-file symlinks into `$IDE_COMMANDS_DIR`; Step 4: if `assets.hooks=true` and `IDE_SUPPORTS_HOOKS=true`: per-file symlinks into `$IDE_HOOKS_DIR`; display source path during install (FR-017)
- [x] T037 [US2] Add `transform_md_to_toml()` to `scripts/install-skills.sh` — Python3 inline script converting MD frontmatter + body → Codex TOML format (research.md D-05); used when `IDE_AGENT_FORMAT=toml`
- [x] T038 [US2] Add `register_hooks_for_ide()` to `scripts/install-skills.sh` — OpenCode: no-op (hooks referenced in agent frontmatter); Claude Code: node inline merges `~/.claude/settings.json` `"hooks"` key with deduplication by command path (research.md D-04); Codex: writes/merges `~/.codex/hooks.json`
- [x] T039 [US2] Add MCP dependency check to `setup_skills()` in `scripts/install-skills.sh` — after skill selected, call `check_mcp_deps(skill_json)` to compare `requires_mcps` vs `SELECTED_MCPS`; print warning if mismatch, continue installation (FR-032)

**Checkpoint**: `./install.sh` Step 6.2 fully interactive; skills symlinked; agents/commands/hooks individually linked; live-link propagation verified.

---

## Phase 5: User Story 3 — Lifecycle Management (Priority: P1)

**Goal**: Full skip/re-link/unlink/reinstall/uninstall lifecycle on re-run for both skills and MCPs. Broken symlink detection and warning.

**Independent Test**: Install one MCP + one skill. Re-run `./install.sh` → correct lifecycle prompts appear. Move ia-framework path, re-run → broken link detected, warning shown. Choose re-link → symlink recreated correctly.

### Implementation

- [x] T040 [US3] Add `detect_skill_state()` to `scripts/install-skills.sh` — POSIX: `test -L && test -e` → `linked`; `test -L && ! test -e` → `broken`; `test -d` → `copied`; else → `absent` (research.md D-01)
- [x] T041 [US3] Add `prompt_skill_action()` to `scripts/install-skills.sh` — per state: `linked` → skip/re-link/unlink; `broken` → ⚠ warning + re-link/unlink; `copied` → upgrade-to-link/skip/remove; `absent` → install; CI mode: always installs absent, skips linked/broken/copied
- [x] T042 [US3] Add `unlink_skill()` to `scripts/install-skills.sh` — removes skill dir symlink, per-file agent/command/hook symlinks, and hook registrations for the given IDE
- [x] T043 [US3] Add `relink_skill()` to `scripts/install-skills.sh` — calls `unlink_skill()` then `install_skill()` to recreate all symlinks from current `SCRIPT_DIR`
- [x] T044 [US3] Add upgrade-to-link path in `prompt_skill_action()` for `copied` state — calls `rm -rf "$link_path"` then `install_skill()` replacing the real directory with a symlink

**Checkpoint**: All lifecycle states handled correctly for skills. MCP lifecycle already handled in T031/T032.

---

## Phase 6: User Story 4 — IDE-Agnostic Configuration (Priority: P2)

**Goal**: All 7 IDE descriptors functional. Installer detects present IDEs and configures each correctly. Adding a new IDE requires only a new descriptor.

**Independent Test**: Add `scripts/ide-descriptors/test-ide.sh` descriptor, create `~/.test-ide/config.json` to simulate detection. Run `./install.sh` → Test IDE appears in list automatically without any script changes.

### Implementation

- [x] T045 [US4] Wire `detect_ides()` in `scripts/installer-helpers.sh` — sources each `scripts/ide-descriptors/*.sh` in turn, checks `IDE_DETECT_PATH` with `test -f` or `test -d`, appends to `DETECTED_IDES`; unsets all `IDE_*` vars after each descriptor to prevent leakage
- [x] T046 [US4] Wire `prompt_ide_select()` in `scripts/installer-helpers.sh` — displays `DETECTED_IDES` with OpenCode first/pre-selected; non-interactive defaults to OpenCode only
- [x] T047 [US4] Add `install_mcp_for_ide()` dispatcher in `scripts/configure-mcp.sh` — routes to correct format handler based on `IDE_MCP_FORMAT` (`opencode-json` → T027, `claude-json` → T028, `codex-toml` → T029, `vscode-json` → T030)
- [x] T048 [US4] Add `install_skill_for_ide()` dispatcher in `scripts/install-skills.sh` — sources the correct descriptor for the given `ide_id` before calling `install_skill()`, ensuring correct `IDE_*` vars are set
- [x] T049 [US4] Validate all 7 IDE descriptors are syntactically correct and export all required variables — manual check: `source scripts/ide-descriptors/opencode.sh && echo $IDE_ID $IDE_GLOBAL_DIR` etc. for each

**Checkpoint**: New descriptor file alone is sufficient to add IDE support. Verified via test-ide.sh extensibility test from quickstart.md.

---

## Phase 7: User Story 5 — Skills Versioning & Upstream Fetch (Priority: P3)

**Goal**: `fetch-skill.sh` updates a vendored skill via full replace, updates `skill.json` version, propagates immediately to all linked IDEs.

**Independent Test**: Run `scripts/fetch-skill.sh tlc-spec-driven` → `skills/tlc-spec-driven/` content updated, `skill.json` version bumped, linked IDE path immediately reflects new content without reinstall.

### Implementation

- [x] T050 [US5] Create `scripts/fetch-skill.sh` — reads `skills/<name>/skill.json` for `upstream` URL; clones/downloads content to temp dir; calls `rm -rf "$skill_dir"/*` then copies fetched content in; updates `version` in `skill.json` via Python3 or node inline; prints "Live links will reflect update immediately" message
- [x] T051 [US5] Add version reporting to `setup_skills()` in `scripts/install-skills.sh` — when displaying each skill during selection, append `(v<version>)` read from `skill.json`

**Checkpoint**: `fetch-skill.sh tlc-spec-driven` works end-to-end. Linked IDEs see update immediately.

---

## Phase 8: Full Teardown — `uninstall.sh` (Priority: P1, Clarification C1)

**Goal**: A single `scripts/uninstall.sh` script removes all MCPs and skill links for all IDEs, with confirmation prompt and summary report.

**Independent Test**: After full install, run `scripts/uninstall.sh` → confirm prompt → all symlinks removed, all MCP entries removed from IDE configs, summary printed.

### Implementation

- [x] T052 [US3] Create `scripts/uninstall.sh` — sources all IDE descriptors + `installer-helpers.sh`; for each IDE × each skill: call `unlink_skill()` if any link state exists; for each IDE × each MCP: call `uninstall_mcp()` if configured; for Claude Code: remove hook registrations from `~/.claude/settings.json`; for Codex: clear `~/.codex/hooks.json` entries
- [x] T053 [US3] Add dry-run summary display to `scripts/uninstall.sh` — before removing anything, print all items that will be affected: "Will remove: N skill links, M MCP entries across K IDEs"
- [x] T054 [US3] Add confirmation prompt to `scripts/uninstall.sh` — `prompt_yn "Remove all ia-framework MCPs and skill links?" "N"` (default NO for safety); CI mode: respect `NON_INTERACTIVE` — if set, defaults to N and exits without removing

---

## Phase 9: install.sh Restructure & SpecKit Removal (Cross-cutting)

**Goal**: Update `install.sh` to remove SpecKit, rename Step 6 to "Harness Configuration", add sub-steps 6.1 and 6.2.

**Independent Test**: Run `./install.sh` — "Step 1" no longer installs SpecKit. "Step 6: Harness Configuration" appears with "Step 6.1: Configure MCPs" and "Step 6.2: Install Skills".

- [x] T055 Remove SpecKit source line from `install.sh` — delete `source "${SCRIPT_DIR}/scripts/install-speckit.sh"` and the `setup_speckit` call in Step 1
- [x] T056 Replace Step 6 in `install.sh` — remove `configure-opencode.sh` source + `configure_opencode` call; add `source "${SCRIPT_DIR}/scripts/configure-mcp.sh"` and `source "${SCRIPT_DIR}/scripts/install-skills.sh"`; rename section header to "Step 6: Harness Configuration" with sub-headers "Step 6.1: Configure MCPs" and "Step 6.2: Install Skills"
- [x] T057 [P] Update `install.sh` banner comment — change "AI codebase context for OpenCode" to "AI codebase context for all IDEs" to reflect IDE-agnostic scope
- [x] T058 [P] Mark `scripts/configure-opencode.sh` deprecated — add comment header `# DEPRECATED: superseded by scripts/configure-mcp.sh. Kept for transition only.`
- [x] T059 [P] Mark `scripts/install-speckit.sh` retired — add comment header `# RETIRED: SpecKit installation removed. tlc-spec-driven skill replaces it. Do not source.`

**Checkpoint**: `./install.sh` runs end-to-end with new Step 6 structure. SpecKit no longer installed.

---

## Phase 10: Polish & Cross-Cutting Concerns

- [x] T060 [P] Run all 8 quickstart.md manual test scenarios and confirm each passes
- [x] T061 [P] Update `README.md` — add section describing the skills system, available skills, and how to use `fetch-skill.sh`
- [x] T062 [P] Add `--help` output to `scripts/fetch-skill.sh` — usage: `fetch-skill.sh <skill-name>`, lists available skill names if no argument given
- [x] T063 [P] Add `--help` output to `scripts/uninstall.sh` — usage, scope description, `--dry-run` flag (display what would be removed without removing)
- [x] T064 Verify all 5 `mcps/*/mcp.json` files conform to data-model.md schema (all required fields present, no `tbd.txt` files remain)
- [x] T065 Verify all 4 `skills/*/skill.json` files conform to data-model.md schema (version, upstream, assets, requires_mcps all present)
- [x] T066 [P] Confirm `AGENTS.md` points to `specs/012-mcp-skills-ide-agnostic/plan.md` (already done in planning phase — verify still correct)

---

## Phase 11: UX — Toggle-Loop Selection & Step Reorder

**Purpose**: Replace the comma-separated number-entry prompts with an intuitive toggle-loop checkbox UI, and move Harness Configuration before Start Services in `install.sh`.

- [x] T067 Add `prompt_toggle_select()` to `scripts/installer-helpers.sh` — toggle-loop: displays `[✓]`/`[ ]` checkbox list; single input per iteration: number toggles item, `A` selects all, `N` clears all, Enter confirms; invalid input prints inline warning and stays in loop; empty selection + Enter shows warning + sets flag, second Enter confirms zero; ANSI cursor-up redraw when `[ -t 1 ]`, plain reprint fallback
- [x] T068 [P] Refactor `prompt_ide_select()` in `scripts/installer-helpers.sh` to call `prompt_toggle_select()` — pre-selected: OpenCode index only; remove current comma-separated number-entry logic
- [x] T068b [P] Refactor `prompt_mcp_select()` in `scripts/configure-mcp.sh` to call `prompt_toggle_select()` — pre-selected: all indices where `default=true`; remove current `A`/`D`/number-entry logic
- [x] T068c [P] Refactor `prompt_skill_select()` in `scripts/install-skills.sh` to call `prompt_toggle_select()` — pre-selected: all skills (default install-all); remove current `Y/n` + number-entry logic
- [x] T069 Reorder steps in `install.sh` — move Step 6 (Harness Configuration) block before Step 5 (Start services) block; renumber headers: Step 5 = Harness Configuration (5.1 MCPs, 5.2 Skills), Step 6 = Start services

**Checkpoint**: Run `./install.sh` — all selection prompts show checkbox-style toggles; interactive prompts complete before dashboard wait begins.

---

## Phase 12: Skills — One Prompt Per Skill, Install to All IDEs

**Purpose**: Refactor `setup_skills()` loop so the user is asked once per skill (not once per skill × IDE). Add `aggregate_skill_state()` to determine the worst-case state across all selected IDEs. Apply the chosen action silently to all IDEs.

- [x] T070 Add `aggregate_skill_state()` to `scripts/install-skills.sh` — iterates all `SELECTED_IDES`, calls `detect_link_state()` per IDE for the skill dir, returns worst-case state by priority: `broken` > `copied` > `absent` (including mixed linked+absent) > `linked`
- [x] T071 Refactor `prompt_skill_action()` in `scripts/install-skills.sh` — remove `ide_name` parameter; prompt is now per-skill only (not per IDE); `absent` still auto-returns `"install"` with no prompt
- [x] T072 Refactor `setup_skills()` in `scripts/install-skills.sh` — outer loop per skill: call `aggregate_skill_state()` once, call `prompt_skill_action()` once, then inner silent loop per IDE executing the action; print one summary line per skill showing which IDEs were affected

**Checkpoint**: Run `./install.sh` with two IDEs selected and four skills — exactly 4 lifecycle prompts appear (one per skill), never 8. Each action applies to both IDEs.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately; T003 and T004 can run in parallel after T001/T002
- **Foundational (Phase 2)**: Depends on Phase 1 completion — BLOCKS all user story phases; all T008–T023 can run in parallel with each other
- **Phase 3 (US1 — MCPs)**: Depends on Phase 2 (needs descriptors + `mcp.json` files + helpers)
- **Phase 4 (US2 — Skills)**: Depends on Phase 2 (needs descriptors + `skill.json` files + helpers); can run in parallel with Phase 3
- **Phase 5 (US3 — Lifecycle)**: Depends on Phase 4 (extends `install-skills.sh`); MCP lifecycle already in Phase 3
- **Phase 6 (US4 — IDE Agnostic)**: Depends on Phase 2 (descriptors), Phase 3, Phase 4; wires everything together
- **Phase 7 (US5 — Fetch)**: Depends on Phase 2 (`skill.json` files); independent of Phases 3–6
- **Phase 8 (Uninstall)**: Depends on Phase 3 and Phase 4 (reuses `uninstall_mcp`, `unlink_skill`)
- **Phase 9 (install.sh)**: Depends on Phases 3 and 4 being complete (scripts must exist before sourcing)
- **Phase 10 (Polish)**: Depends on all prior phases

### User Story Dependencies

- **US1 (MCPs) + US2 (Skills)**: Can run in parallel after Phase 2 — independent scripts
- **US3 (Lifecycle)**: Depends on US2 complete (extends same script)
- **US4 (IDE Agnostic)**: Depends on US1 + US2 complete (wires dispatchers)
- **US5 (Fetch)**: Independent — only needs Phase 2 descriptors

### Parallel Opportunities Within Phases

- **Phase 1**: T003 + T004 + T005 in parallel (different skill dirs)
- **Phase 2**: T008–T014 in parallel (different descriptor files); T015–T018 in parallel (different skill.json); T019–T023 in parallel (different mcp.json)
- **Phase 3**: T027–T030 in parallel (different IDE format handlers)
- **Phase 9**: T057 + T058 + T059 in parallel

---

## Parallel Execution Examples

### Phase 2 — All descriptors and metadata in parallel

```
Task: "Create scripts/ide-descriptors/opencode.sh"          [T008]
Task: "Create scripts/ide-descriptors/claude-code.sh"       [T009]
Task: "Create scripts/ide-descriptors/codex.sh"             [T010]
Task: "Create scripts/ide-descriptors/vscode-copilot.sh"    [T011]
Task: "Create skills/grill-with-docs/skill.json"            [T015]
Task: "Create skills/tab-refuter/skill.json"                [T016]
Task: "Create mcps/ia-framework-mcp/mcp.json"               [T019]
Task: "Create mcps/context7-mcp/mcp.json"                   [T020]
```

### Phase 3+4 — MCP and Skills scripts in parallel

```
Task: "Create scripts/configure-mcp.sh"     [T024–T033]
Task: "Create scripts/install-skills.sh"    [T034–T039]
```

---

## Implementation Strategy

### MVP (User Stories 1 + 2 only — OpenCode)

1. Phase 1: Setup + normalize skills
2. Phase 2: Foundational descriptors (OpenCode descriptor + all skill/mcp JSON)
3. Phase 3: `configure-mcp.sh` for OpenCode
4. Phase 4: `install-skills.sh` for OpenCode
5. Phase 9: Update `install.sh`
6. **STOP and VALIDATE**: Run quickstart.md Tests 1, 2, 4, 5 manually against OpenCode

### Full Delivery

7. Phase 5: Lifecycle (all states)
8. Phase 6: All IDEs wired
9. Phase 7: `fetch-skill.sh`
10. Phase 8: `uninstall.sh`
11. Phase 10: Polish + all 8 quickstart tests

---

## Notes

- [P] tasks = different files, no conflicting dependencies — safe to run in parallel
- No automated tests generated — feature is shell scripting; validation via quickstart.md manual scenarios
- `configure-opencode.sh` is superseded but NOT deleted — kept for transition (T058)
- `install-speckit.sh` is retired but NOT deleted — source line removed from `install.sh` (T055, T059)
- All `node --input-type=module` JSON manipulation uses env-var data passing to avoid heredoc quoting issues (research.md D-02)
- Codex agent `.toml` files are copies (not symlinks) — updates require running the installer again or `uninstall.sh` + reinstall
- Hook registration in `~/.claude/settings.json` and `~/.codex/hooks.json` uses deduplication by command path to prevent duplicate entries on re-run
