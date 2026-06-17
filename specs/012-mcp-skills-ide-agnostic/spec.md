# Feature Specification: IDE-Agnostic MCP & Skills Installation

**Feature Branch**: `012-mcp-skills-ide-agnostic`

**Created**: 2026-06-17

**Status**: Draft — implementation-ready (planning complete)

**Input**: User description: "Reorganize MCP installation to be optional and interactive during install.sh execution. Make all MCP and skills installation IDE-agnostic (Claude Code, OpenCode, Cursor, Codex, etc.) with OpenCode as the default. Store skills in a repository `skills/` folder, install via live links so that any update to the framework is immediately reflected in all IDEs. Always prompt to uninstall or reinstall when already present."

---

## Decisions Made During Planning

The following decisions were confirmed during the planning conversation and are reflected throughout this spec:

- **D1 — Skill layout normalized**: All skills use flat `agents/`, `commands/`, `hooks/`, `templates/` directly under `skills/<name>/`. The `<skill>-src/` subdirectory pattern (e.g., `tab-refuter-src/`) from PR #59 is eliminated.
- **D2 — Codex agents are copied, not symlinked**: Codex requires `.toml` format for agents; the installer transforms `.md` → `.toml` and copies. All other IDEs receive symlinks. Codex follows the same skip/reinstall/remove lifecycle as other IDEs.
- **D3 — Claude Code hooks are global**: Hooks are installed to `~/.claude/hooks/` and registered in `~/.claude/settings.json` under the `"hooks"` key. Not project-local.
- **D4 — install.sh step structure**: MCP configuration and skills installation remain separate sub-steps, grouped under a renamed **"Step 6: Harness Configuration"** (Step 6.1: Configure MCPs, Step 6.2: Install Skills).
- **D5 — `tab-spec-driven` removed**: Only 4 skills exist: `grill-with-docs`, `tab-refuter`, `tab-ticket-reader`, `tlc-spec-driven`.
- **D6 — `configure-opencode.sh` superseded**: Replaced by `configure-mcp.sh` (descriptor-driven, IDE-agnostic). The old file is kept during transition but deprecated.
- **D7 — PR #59 is the starting point**: `skills/` and `mcps/` placeholder directories from PR #59 (`rafaelmgoncalves/ia-framework`) are merged in; this spec refines and extends that work.

---

## User Scenarios & Testing _(mandatory)_

### User Story 1 — First-Time Install: Interactive MCP Selection (Priority: P1)

A developer runs `./install.sh` for the first time. Under "Step 6: Harness Configuration", they are first prompted to select their IDE(s), then presented with each available MCP as an individual opt-in choice with a description. They select only the MCPs relevant to their setup. The installer writes the correct config for each selected IDE.

**Why this priority**: This is the core workflow change — turning silent auto-installation into explicit, user-driven selection. It reduces surprises and supports diverse IDE environments.

**Independent Test**: Run `./install.sh` on a clean system, select OpenCode, accept only `context7`, and verify only the `context7` entry appears in `~/.config/opencode/opencode.json`.

**Acceptance Scenarios**:

1. **Given** no MCPs are configured, **When** the user runs `./install.sh` and reaches Step 6.1, **Then** each MCP is presented individually and only accepted ones are installed.
2. **Given** the user selects no MCPs, **When** Step 6.1 completes, **Then** the base framework is still fully installed and operational.
3. **Given** a non-interactive environment (no TTY), **When** the installer runs, **Then** all `"default": true` MCPs are installed for OpenCode without any prompts.

---

### User Story 2 — Skills Installed as Live Links (Priority: P1)

A developer runs `./install.sh` and opts to install skills during Step 6.2. The installer creates a symlink from `<ia-framework>/skills/<skill-name>/` to each selected IDE's skill directory. Any subsequent update to the skill files in ia-framework — including a `git pull` — is immediately visible to all linked IDEs with no reinstall required. ia-framework is the single source of truth.

**Why this priority**: Live links eliminate version drift. All IDEs always use the current version of the skill automatically.

**Independent Test**: Install `tlc-spec-driven` to OpenCode. Modify a file in `skills/tlc-spec-driven/`. Confirm the change is immediately visible in OpenCode's skill directory without any reinstall.

**Acceptance Scenarios**:

1. **Given** a skill is not yet installed, **When** the user selects it, **Then** a symlink is created from `<ia-framework>/skills/<name>/` to the IDE's skill directory.
2. **Given** a live link exists, **When** skill files in ia-framework are updated, **Then** the IDE immediately uses the updated content with no reinstall.
3. **Given** a skill has `agents/`, `commands/`, `hooks/` sub-folders, **When** it is installed, **Then** individual symlinks are created per file into the IDE's `agents/`, `command/`, and `hooks/` directories respectively — in addition to the skill directory symlink.
4. **Given** a knowledge-only skill (no `agents/`/`commands/`/`hooks/`), **When** it is installed, **Then** only the skill directory symlink is created.
5. **Given** the installer runs offline, **When** the user selects a skill, **Then** the skill is linked from the local `skills/` directory without any network call.

---

### User Story 3 — Lifecycle Management: Skip / Re-link / Uninstall (Priority: P1)

A developer re-runs `./install.sh`. The installer detects the current state of each MCP and skill installation — distinguishing between active link, broken link, legacy file copy, or absent — and presents the correct choices for each.

**Why this priority**: Idempotency and safe re-runs are critical. The installer must never corrupt existing config or silently overwrite.

**Independent Test**: Install one MCP + one skill to two IDEs. Re-run `./install.sh` → exactly one lifecycle prompt appears per skill (not one per IDE), and the chosen action is applied to all IDEs.

**Acceptance Scenarios**:

1. **Given** an MCP is already configured, **When** `./install.sh` runs, **Then** the user is prompted to [skip / reinstall / uninstall].
2. **Given** a skill is live-linked in all selected IDEs, **When** `./install.sh` runs, **Then** the user sees one prompt for that skill: [skip / re-link / unlink].
3. **Given** a skill is live-linked in one IDE but absent in another, **When** `./install.sh` runs, **Then** the aggregated state is `absent` (mixed treated as not-fully-installed) and one install prompt appears; the action is applied to all IDEs.
4. **Given** a skill link is broken in any selected IDE, **When** `./install.sh` runs, **Then** the installer warns and offers [re-link / unlink] once; the action is applied to all IDEs.
5. **Given** the user chooses "unlink" or "uninstall", **Then** the item is fully removed from all selected IDE configs with no side effects on other items.

---

### User Story 4 — IDE-Agnostic Configuration (Priority: P2)

A developer using Cursor, Claude Code, or Codex runs `./install.sh`. The installer detects which IDEs are present, offers them as choices (OpenCode first/default), and installs MCPs and skills using the correct format and paths for each selected IDE. All IDE-specific paths and config formats are read from descriptor files — nothing is hardcoded in the installer scripts.

**Why this priority**: The framework is currently OpenCode-only. Supporting other IDEs increases reach without breaking existing users.

**Independent Test**: Run `./install.sh` with Claude Code present but not OpenCode. Select Claude Code. Verify `~/.claude/agents/` and `~/.claude/skills/` receive the correct files.

**Acceptance Scenarios**:

1. **Given** OpenCode is installed, **When** the user selects it, **Then** MCPs are written to `~/.config/opencode/opencode.json` and skills are linked to `~/.config/opencode/skills/`.
2. **Given** Claude Code is installed, **When** the user selects it, **Then** MCPs are written to `~/.claude/settings.json`, skills linked to `~/.claude/skills/`, agents symlinked to `~/.claude/agents/`, commands to `~/.claude/commands/`, and hooks to `~/.claude/hooks/` with registration in `~/.claude/settings.json`.
3. **Given** Codex is installed, **When** the user selects it, **Then** MCPs are written to `~/.codex/config.toml`, skills linked to `~/.agents/skills/`, agents **copied as `.toml`** to `~/.codex/agents/`, and hooks copied to `~/.codex/hooks/` with a `hooks.json` event registry.
4. **Given** multiple IDEs are selected, **Then** each receives its own correct configuration in parallel.
5. **Given** no IDE is detected, **Then** the user is informed and offered a manual path entry or the option to skip.
6. **Given** a new IDE is added in the future, **Then** adding its descriptor file alone is sufficient — no changes to installer scripts are required.

---

### User Story 5 — Skills Versioning and Upstream Fetch (Priority: P3)

A maintainer updates `tlc-spec-driven` to a newer version by running the provided fetch utility. The utility downloads the latest content from the upstream source (`tech-leads-club/agent-skills`), updates `skills/tlc-spec-driven/` in-place, and updates the version metadata. Because all IDEs are live-linked, the update is immediately visible everywhere — no per-IDE reinstall needed.

**Why this priority**: Without a fetch utility and version metadata, skill updates require manual filesystem work and there is no way to know if the vendored content is stale.

**Independent Test**: Run `scripts/fetch-skill.sh tlc-spec-driven`. Verify `skills/tlc-spec-driven/` is updated and `skill.json` version is bumped. Verify an OpenCode session immediately sees the new content.

**Acceptance Scenarios**:

1. **Given** `skill.json` contains an `upstream` URL, **When** `fetch-skill.sh <name>` is run, **Then** the skill files are updated in-place and `skill.json` version is updated.
2. **Given** IDEs are live-linked to the skill, **When** the fetch completes, **Then** no reinstall step is required — IDEs see the new content immediately.
3. **Given** the skill version in `skills/` differs from the upstream, **When** `./install.sh` runs, **Then** the installer reports the current vendored version alongside the skill name.

---

### Edge Cases

- What happens when the IDE's target directory does not exist? → The installer creates it before writing any config or establishing a symlink.
- What happens when a symlink is partially created (install interrupted)? → Detected as `broken` state; treated as needing re-link, not as installed.
- What happens when a new IDE is added? → Add a descriptor file in `scripts/ide-descriptors/`; no core installer logic changes required.
- What happens in CI / non-interactive mode? → Installer detects no TTY and falls back to: OpenCode only, all `"default": true` MCPs, all skills, no prompts.
- What happens when ia-framework is on a remote filesystem? → Installer warns that symlinks may not resolve and offers to proceed or fall back to file-copy mode.
- What happens when two ia-framework installations exist on the same machine? → Installer displays the source path during setup so the user can confirm the correct ia-framework is being linked.
- What happens when Codex agent transformation fails? → Installer logs the error, skips that agent file, and continues. User is warned at the end.
- What happens when `~/.claude/settings.json` already has a `"hooks"` key from another skill? → Hook registration is merged (appended), never overwritten.

---

## Requirements _(mandatory)_

### Functional Requirements

#### MCP Installation

- **FR-001**: The installer MUST present each MCP as an individually selectable option during Step 6.1. MCPs with `"default": true` are pre-selected; others require explicit opt-in.
- **FR-002**: Default MCPs are: `ia-framework`, `context7`, `sequential-thinking`. Optional MCPs are: `jira`, `postgres`.
- **FR-003**: For each MCP already configured in an IDE, the installer MUST offer: skip / reinstall / uninstall.
- **FR-004**: MCP configuration MUST be idempotent — re-running never corrupts or duplicates existing entries.
- **FR-005**: Each MCP's configuration payload MUST be read from a `mcps/<name>/mcp.json` descriptor. Nothing about MCP commands, arguments, or environment variables may be hardcoded in installer scripts. If the `ia-framework` MCP binary does not exist at config time, the installer MUST write the config entry regardless and print an informational note that the IDE will fail to start the MCP until `pnpm build` is run.

#### Skills Installation

- **FR-006**: The installer MUST present each skill in `skills/` as an individually selectable option during Step 5.2. The user selects **which skills** to install — not which skills go to which IDE. Selected skills are installed to all selected IDEs automatically.
- **FR-007**: All skills MUST be stored under `skills/` in the ia-framework repository. The installer MUST NOT download skills from external URLs during installation.
- **FR-008**: When a skill is installed, the installer MUST create a symlink from `<ia-framework>/skills/<name>/` to the IDE's skill directory — not a file copy.
- **FR-009**: The symlink MUST be established such that any subsequent change to skill files in ia-framework is immediately reflected in the IDE without any reinstall step.
- **FR-010**: Skills with `agents/`, `commands/`, or `hooks/` sub-folders MUST also have individual symlinks created per file into the IDE's corresponding directories (`agents/`, `command/`, `hooks/`).
- **FR-011**: For Codex, agent files MUST be copied and transformed to `.toml` format rather than symlinked.
- **FR-012**: Hooks for Claude Code MUST be installed globally to `~/.claude/hooks/` and registered in `~/.claude/settings.json` under the `"hooks"` key, not project-locally.
- **FR-013**: The installer MUST detect whether an existing skill installation is: `linked` (active symlink), `broken` (dead symlink), `copied` (legacy file), or `absent` — determined by filesystem inspection at runtime (`readlink`, `test -L`, `test -d`). No manifest file is used.
- **FR-014**: For each skill, the installer MUST determine a single aggregated state across all selected IDEs and present exactly one lifecycle prompt per skill. Aggregation priority (highest wins): `broken` > `copied` > `absent` (including mixed linked+absent) > `linked`. The chosen action is then applied to all selected IDEs silently.
- **FR-015**: When installing to multiple IDEs, a separate symlink MUST be created per IDE — all pointing to the same single source directory in ia-framework.
- **FR-016**: The installer MUST create any missing parent directories before creating a symlink.
- **FR-017**: The symlink source path MUST be displayed to the user during installation for confirmation.
- **FR-034**: After executing a skill action across all selected IDEs, the installer MUST print a single summary line listing which IDEs were affected (e.g. `✓ grill-with-docs installed to: OpenCode, Claude Code`).

#### IDE Agnosticism

- **FR-018**: The installer MUST detect which IDEs are present on the system using each IDE's detection path defined in its descriptor.
- **FR-019**: OpenCode MUST be presented first and treated as the default IDE selection.
- **FR-020**: All IDE-specific paths, config formats, and detection logic MUST be read from descriptor files in `scripts/ide-descriptors/`. Nothing may be hardcoded in installer scripts.
- **FR-021**: Each IDE descriptor MUST declare: detection path, global dir, skills dir, agents dir, commands dir, hooks dir, MCP config path, MCP config format, agent format (`md` or `toml`), symlink support flag, hooks support flag, commands support flag.
- **FR-022**: Adding support for a new IDE MUST require only adding a new descriptor file — zero changes to core installer scripts.

#### Lifecycle and Idempotency

- **FR-023**: The MCP and skills configuration steps MUST be safe to re-run at any time without corrupting existing configuration.
- **FR-024**: The installer MUST detect broken symlinks (symlink exists but target does not resolve) and flag them explicitly — never treat them as active.
- **FR-025**: Hook registration (in `~/.claude/settings.json`, `~/.codex/hooks.json`, etc.) MUST be merged — never overwritten — when multiple skills register hooks for the same IDE.

#### install.sh Structure

- **FR-026**: Harness Configuration (Configure MCPs + Install Skills) MUST be placed **before** Start Services (Qdrant + Dashboard) in `install.sh`, so all interactive prompts complete before the 60-second service-start wait begins. Step numbering: Step 5 = Harness Configuration (5.1 MCPs, 5.2 Skills), Step 6 = Start Services.
- **FR-027**: In non-interactive mode (no TTY), the installer MUST default to: OpenCode only, all `"default": true` MCPs, all skills — without any prompts.
- **FR-030**: SpecKit (`specify` CLI) MUST be removed from `install.sh` entirely. The project is moving to `tlc-spec-driven` as the spec-driven development skill, which is installed via the skills system (FR-006–FR-009). `scripts/install-speckit.sh` MUST be retired.
- **FR-031**: A `scripts/uninstall.sh` script MUST be provided that removes all installed MCPs and skill links for all IDEs in a single operation. It MUST prompt for confirmation before making any changes and report a summary of what was removed.
- **FR-033**: IDE and MCP selection prompts MUST use a toggle-loop interface: a numbered checkbox list is displayed showing current selection state (`[✓]` selected, `[ ]` unselected); the user types a number to toggle an item, `A` to select all, `N` to clear all, or Enter to confirm. The list redraws in-place after each toggle. Invalid input (out-of-range number, non-numeric, unrecognised letter) MUST display an inline warning and keep the prompt open without advancing. Confirming with nothing selected MUST require a second Enter to confirm zero-selection (two-Enter confirmation); a single Enter on an empty selection shows a warning and stays in the loop.

#### Skills Versioning

- **FR-028**: Each skill MUST include a `skill.json` descriptor containing: `name`, `version`, `description`, `upstream` URL, an `assets` object declaring which sub-folders are present (`skill`, `agents`, `commands`, `hooks`), and an optional `requires_mcps` array listing MCP IDs the skill depends on.
- **FR-029**: A `scripts/fetch-skill.sh` utility MUST be provided to download/update a vendored skill from its `upstream` URL. It MUST delete the existing skill directory contents and replace them entirely with the freshly downloaded content, then update the `version` in `skill.json`. No local files are preserved across a fetch.
- **FR-032**: If a skill's `requires_mcps` lists an MCP that was not selected in the current session, the installer MUST print a warning naming the missing MCP(s) and continue installation. It MUST NOT block the skill from being installed.

### Key Entities

- **MCP Descriptor** (`mcps/<name>/mcp.json`): Defines an MCP integration — `id`, `name`, `description`, `default` flag, `command` array, optional `per_ide` overrides. The `ia-framework` MCP additionally includes a `requires_build` flag and dynamic path substitution.
- **Skill** (`skills/<name>/`): Files vendored in ia-framework. Contains `SKILL.md`, `skill.json`, and optionally `agents/`, `commands/`, `hooks/`, `templates/`, `references/`. Is the single source of truth for that skill across all IDEs.
- **`skill.json`**: Descriptor for a skill. Fields: `name`, `version`, `description`, `upstream`, `assets: { skill, agents, commands, hooks }`.
- **IDE Descriptor** (`scripts/ide-descriptors/<ide>.sh`): Shell file exporting variables for one IDE — detection path, directory paths for each asset type, config format, agent format, capability flags.
- **Link Lifecycle State**: One of `linked` (active symlink), `broken` (dead symlink), `copied` (legacy file-copy install), `absent` (not installed).
- **Harness Configuration**: Step 5 in `install.sh` — covers MCP configuration (5.1) and skills installation (5.2). Placed before service startup so all interactive prompts complete before the dashboard wait begins.

---

## Per-IDE Asset Path Mapping _(implementation reference)_

| Asset            | OpenCode                                   | Claude Code                          | Codex                             | VSCode/Copilot      |
| ---------------- | ------------------------------------------ | ------------------------------------ | --------------------------------- | ------------------- |
| Skill dir        | `~/.config/opencode/skills/<name>/`        | `~/.claude/skills/<name>/`           | `~/.agents/skills/<name>/`        | —                   |
| `agents/*.md`    | `~/.config/opencode/agents/`               | `~/.claude/agents/`                  | `~/.codex/agents/` **as `.toml`** | `~/.github/agents/` |
| `commands/*.md`  | `~/.config/opencode/command/` _(singular)_ | `~/.claude/commands/`                | —                                 | —                   |
| `hooks/*.js`     | `~/.config/opencode/hooks/`                | `~/.claude/hooks/` + `settings.json` | `~/.codex/hooks/` + `hooks.json`  | —                   |
| MCP config       | `~/.config/opencode/opencode.json`         | `~/.claude/settings.json`            | `~/.codex/config.toml`            | `.vscode/mcp.json`  |
| Detection        | `opencode.json` exists                     | `~/.claude/` exists                  | `~/.codex/config.toml` exists     | `~/.vscode/` exists |
| Agent format     | `md`                                       | `md`                                 | `toml` (copy+transform)           | `md`                |
| Symlink support  | all assets                                 | all assets                           | skill dir only                    | agents only         |
| Hooks support    | yes                                        | yes (global)                         | yes                               | no                  |
| Commands support | yes                                        | yes                                  | no                                | no                  |

> **Note**: OpenCode's commands directory is `command` (singular), confirmed from live filesystem.
> Cursor support is deferred to a follow-up descriptor; uses `.cursor/rules/` project-level rules.
> Gemini and Windsurf use `~/.gemini/skills/` and `~/.codeium/windsurf/skills/` respectively (descriptor-only, paths sourced from PR #59).

---

## Skill Inventory _(4 skills, `tab-spec-driven` removed)_

| Skill               | Type           | Assets                                                                      |
| ------------------- | -------------- | --------------------------------------------------------------------------- |
| `grill-with-docs`   | Knowledge-only | `SKILL.md`, context docs (no agents/commands/hooks)                         |
| `tab-refuter`       | Full           | `agents/` (3 files), `commands/` (1 file), `hooks/` (7 files), `templates/` |
| `tab-ticket-reader` | Full           | `agents/` (1 file), `commands/` (1 file), `hooks/` (2 files), `templates/`  |
| `tlc-spec-driven`   | Knowledge-only | `SKILL.md` (v2.0.0, CC-BY-4.0), `README.md`, `references/`                  |

> `tlc-spec-driven` content sourced from `tech-leads-club/agent-skills` upstream. Vendored at `skills/tlc-spec-driven/` with `skill.json` version metadata.

---

## MCP Inventory _(5 MCPs)_

| MCP                   | Default | Description                                        |
| --------------------- | ------- | -------------------------------------------------- |
| `ia-framework`        | yes     | ia-framework RAG/search MCP server (built locally) |
| `context7`            | yes     | Up-to-date library documentation for LLMs          |
| `sequential-thinking` | yes     | Sequential reasoning via model context protocol    |
| `jira`                | no      | Jira issue management integration                  |
| `postgres`            | no      | PostgreSQL database access                         |

---

## File Structure _(implementation target)_

```
skills/
  grill-with-docs/
    SKILL.md
    skill.json
    ADR-FORMAT.md
    CONTEXT-FORMAT.md
  tab-refuter/
    SKILL.md
    skill.json
    README.md
    agents/
    commands/
    hooks/
    templates/
  tab-ticket-reader/
    SKILL.md
    skill.json
    README.md
    agents/
    commands/
    hooks/
    templates/
  tlc-spec-driven/
    SKILL.md
    skill.json
    README.md
    references/

mcps/
  ia-framework-mcp/mcp.json
  context7-mcp/mcp.json
  sequential-thinking-mcp/mcp.json
  jira-mcp/mcp.json
  postgres-mcp/mcp.json

scripts/
  ide-descriptors/
    opencode.sh
    claude-code.sh
    codex.sh
    vscode-copilot.sh
    cursor.sh
    gemini.sh
    windsurf.sh
  configure-mcp.sh        ← NEW, replaces configure-opencode.sh
  install-skills.sh       ← NEW, replaces PR #59's silent version
  fetch-skill.sh          ← NEW
  uninstall.sh            ← NEW, full teardown of all MCPs and skill links
  configure-opencode.sh   ← DEPRECATED, kept during transition

install.sh                ← Step 6 restructured
```

---

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A developer completes `./install.sh` — selecting MCPs and skills for two IDEs — in under 5 minutes, with all live links established in a single session.
- **SC-002**: Re-running `./install.sh` on an already-configured system never results in duplicate MCP entries, corrupted config, or misidentified link states.
- **SC-003**: After updating a skill file in ia-framework, 100% of IDEs with a live link reflect the change immediately — no reinstall, no copy, no manual action.
- **SC-004**: 100% of available skills can be installed without network connectivity (link from local `skills/` only).
- **SC-005**: Adding support for a new IDE requires changes only to a new descriptor file — zero changes to core installer scripts.
- **SC-006**: A developer can unlink any individual skill or uninstall any individual MCP without affecting any other configured item.
- **SC-007**: Non-interactive runs (CI) complete without hanging on prompts and produce a working OpenCode + ia-framework default configuration.
- **SC-008**: A developer who moves ia-framework to a new path restores all live links via a single `./install.sh` re-run, choosing "re-link" for each affected skill.
- **SC-009**: 100% of broken symlinks are detected and flagged during an installer run — none silently treated as active.
- **SC-010**: Running `scripts/fetch-skill.sh <name>` updates the vendored skill and all linked IDEs see the new content immediately — no per-IDE reinstall.

---

## Clarifications

### Session 2026-06-17

- Q: What is the approach for full teardown (removing all MCPs and skill links for all IDEs)? → A: Provide a separate `scripts/uninstall.sh` script for full teardown.
- Q: What happens if a user installs a skill whose required MCP was not selected? → A: Warn but allow — installer prints a warning listing the missing dependency MCP(s) and proceeds with installation.
- Q: How does the installer detect link/install state across sessions — filesystem inspection or manifest file? → A: Filesystem-only detection at runtime (`readlink`, `test -L`, `test -d`). No manifest file.
- Q: What happens if the `ia-framework` MCP binary is missing at config time (build not yet run)? → A: Proceed and write the config anyway; the IDE will fail to start the MCP until the binary exists.
- Q: How does `fetch-skill.sh` handle upstream structural changes (added/removed files)? → A: Full replace — delete existing skill directory contents and replace entirely with freshly downloaded content, then update `skill.json` version.

---

## Assumptions

- The current install.sh modular structure (sourced scripts per feature) is preserved.
- "Supported IDEs" for v1: OpenCode, Claude Code, Codex, VSCode/Copilot. Cursor, Gemini, Windsurf have descriptor stubs but are lower priority.
- All v1 IDEs (OpenCode, Claude Code, VSCode/Copilot) support reading skill content through filesystem symlinks. Codex uses copy for agents only.
- The installer determines skill and MCP installation state by inspecting the filesystem at runtime only. No manifest file is written or maintained.
- The ia-framework repository path is expected to be stable. Moving the repo requires re-running `./install.sh` with "re-link"; this is explicitly supported.
- Hook registration merging (for Claude Code `settings.json` and Codex `hooks.json`) does not require a full JSON library — `node --input-type=module` inline scripts are used, consistent with the existing `configure-opencode.sh` pattern.
- `tlc-spec-driven` is vendored from `tech-leads-club/agent-skills` (version 2.0.0, CC-BY-4.0). The fetch utility populates it; it is not auto-downloaded during `./install.sh`.
- Version metadata for skills lives in `skill.json` — no package registry required.
- The installer targets POSIX shells (bash/zsh on macOS and Linux); Windows is out of scope.
- PR #59 (`rafaelmgoncalves/ia-framework`) is the starting point for the `skills/` and `mcps/` directory structures. This spec refines and supersedes the PR's `install-skills.sh` and `configure-opencode.sh` approach.
