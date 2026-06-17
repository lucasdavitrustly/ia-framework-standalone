# Implementation Plan: IDE-Agnostic MCP & Skills Installation

**Branch**: `012-mcp-skills-ide-agnostic` | **Date**: 2026-06-17 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/012-mcp-skills-ide-agnostic/spec.md`

---

## Summary

Refactor `install.sh` and its supporting scripts to replace the current hardcoded, OpenCode-only, silent MCP and skills installation with an interactive, descriptor-driven, IDE-agnostic system. ia-framework becomes the single source of truth for 4 skills and 5 MCPs; skills are distributed to IDEs via filesystem symlinks (live links) so any `git pull` on ia-framework propagates instantly. A new `scripts/uninstall.sh` provides full teardown. SpecKit installation is removed from the installer.

---

## Technical Context

**Language/Version**: Bash (POSIX-compatible, targeting macOS zsh + Linux bash). Inline `node --input-type=module` for JSON manipulation (Node.js ≥ 22, already required by ia-framework). Python3 for Codex `.toml` agent transformation (available on all supported platforms).

**Primary Dependencies**:

- `bash` / `zsh` — POSIX shell, installer scripts
- `node` ≥ 22 — JSON config merging (inline heredoc scripts)
- `python3` ≥ 3.11 — Markdown frontmatter → TOML conversion for Codex agents
- `ln`, `readlink`, `test` — symlink creation and state detection
- Existing: `install.sh` modular sourced-script pattern

**Storage**: No manifest file. State detected purely from filesystem at runtime using `test -L`, `test -e`, `readlink`.

**Testing**: Manual integration testing per IDE (OpenCode confirmed present; others tested via descriptor detection). Shell scripts have no automated test framework; correctness verified via dry-run output and post-install state checks.

**Target Platform**: macOS (primary, Apple Silicon + Intel), Linux. Windows out of scope.

**Project Type**: Installer/tooling scripts — not a TypeScript package. Lives entirely in `scripts/` and root `install.sh`. No new pnpm packages required.

**Performance Goals**: Full interactive install (2 IDEs, 4 skills, 5 MCPs) completes in under 5 minutes (SC-001). Symlink operations are near-instant.

**Constraints**:

- No manifest file — filesystem-only state detection
- No network during `install.sh` — all skills read from local `skills/` dir
- POSIX shell only — no bash 4+ arrays in zsh compatibility paths; use `read` loops
- `configure-opencode.sh` kept (deprecated, not deleted) during transition
- Constitution principles I (TDD) and II (TypeScript-Only) do not apply — this is shell scripting, not TypeScript source code

**Scale/Scope**: 4 skills × up to 7 IDEs = up to 28 symlink targets. 5 MCPs × up to 7 IDEs = up to 35 config entries. All operations are local filesystem only.

---

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                  | Status | Notes                                                                                                                                    |
| -------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| I. TDD                     | N/A    | Shell scripts — no Vitest. Manual integration testing only. No TypeScript code introduced.                                               |
| II. TypeScript-Only        | N/A    | This feature is entirely shell scripts + JSON/TOML descriptors. No new TypeScript source files.                                          |
| III. Local-First           | PASS   | All skills installed from local `skills/` dir. No network calls during install. `fetch-skill.sh` is an explicit opt-in maintenance tool. |
| IV. Monorepo Architecture  | PASS   | No new packages. Changes confined to `scripts/`, `skills/`, `mcps/`, and root `install.sh`.                                              |
| V. Simplicity              | PASS   | Descriptor-driven design avoids hardcoding. Each new file (descriptor, script) has a single purpose. No clever abstractions.             |
| VI. Incremental by Default | N/A    | Not applicable to installer scripts.                                                                                                     |
| VII. MCP-First Interface   | PASS   | This feature configures MCP integrations for all IDEs, strengthening the MCP-first model across the ecosystem.                           |

**Gate Result**: ALL applicable principles PASS — proceed to implementation.

---

## Project Structure

### Documentation (this feature)

```text
specs/012-mcp-skills-ide-agnostic/
├── plan.md              ← this file
├── research.md          ← Phase 0 output
├── data-model.md        ← Phase 1 output (descriptor schemas)
├── quickstart.md        ← Phase 1 output
└── tasks.md             ← Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
skills/                              ← NEW (from PR #59, normalized)
  grill-with-docs/
    SKILL.md
    skill.json                       ← NEW
    ADR-FORMAT.md
    CONTEXT-FORMAT.md
  tab-refuter/
    SKILL.md
    skill.json                       ← NEW
    README.md
    agents/                          ← MOVED (was tab-refuter-src/agents/)
      tab-refuter-orchestrator.md
      tab-refuter-analyst.md
      tab-refuter-report-writer.md
    commands/                        ← MOVED (was tab-refuter-src/commands/)
      tab-refuter.md
    hooks/                           ← MOVED (was tab-refuter-src/hooks/)
      tab-refuter-audit-trail.js
      tab-refuter-citation-verifier.js
      tab-refuter-convergence.js
      tab-refuter-drift-detector.js
      tab-refuter-evidence-guard.js
      tab-refuter-learning-append.js
      tab-refuter-orchestration-complete.js
    templates/                       ← MOVED (was tab-refuter-src/templates/)
  tab-ticket-reader/
    SKILL.md
    skill.json                       ← NEW
    README.md
    agents/                          ← MOVED (was tab-spec-formatter-src/agents/)
      tab-spec-formatter.md
    commands/                        ← MOVED (was tab-spec-formatter-src/commands/)
      tab.format-spec.md
    hooks/                           ← MOVED (was tab-spec-formatter-src/hooks/)
      tab-spec-formatter-jira-guard.js
      tab-spec-formatter-output-guard.js
    templates/                       ← MOVED (was tab-spec-formatter-src/templates/)
  tlc-spec-driven/
    SKILL.md                         ← POPULATED (from tech-leads-club/agent-skills v2.0.0)
    skill.json                       ← NEW
    README.md
    references/                      ← POPULATED

mcps/                                ← NEW (stubs from PR #59 replaced with real descriptors)
  ia-framework-mcp/
    mcp.json
  context7-mcp/
    mcp.json
  sequential-thinking-mcp/
    mcp.json
  jira-mcp/
    mcp.json
  postgres-mcp/
    mcp.json

scripts/
  ide-descriptors/                   ← NEW directory
    opencode.sh
    claude-code.sh
    codex.sh
    vscode-copilot.sh
    cursor.sh
    gemini.sh
    windsurf.sh
  configure-mcp.sh                   ← NEW (replaces configure-opencode.sh)
  install-skills.sh                  ← NEW (replaces PR #59's silent version)
  fetch-skill.sh                     ← NEW
  uninstall.sh                       ← NEW
  configure-opencode.sh              ← DEPRECATED (kept, not deleted)
  install-speckit.sh                 ← RETIRED (sourced line removed from install.sh)

install.sh                           ← MODIFIED (step restructure + SpecKit removal)
```

---

## Phase 0: Research

_All research completed. Findings consolidated below._

### Decision Log

**D-01: Symlink state detection**

- Decision: `test -L "$path"` (symlink exists) + `test -e "$path"` (target resolves) combination
- Rationale: POSIX-portable, no external tools, works identically on macOS and Linux
- States: `linked` = `-L && -e`; `broken` = `-L && !-e`; `copied` = `!-L && -d`; `absent` = `!-L && !-d`

**D-02: JSON config merging**

- Decision: Inline `node --input-type=module` heredoc with env-var data passing
- Rationale: Already used in `configure-opencode.sh`; consistent pattern; Node ≥ 22 guaranteed
- Pattern: Pass file path and new entry via env vars to avoid heredoc quoting issues

**D-03: Claude Code global hooks registration**

- Decision: Merge into `~/.claude/settings.json` under `"hooks"` key using Node inline script
- Rationale: Global scope (not project-local); append-only with deduplication check by command path
- Hook events used: `PostToolUse` (with matcher), `Stop` (no matcher)

**D-04: Codex agent transformation**

- Decision: Python3 inline script to parse MD frontmatter + body → TOML
- Rationale: Python3 available on all supported platforms; `node` doesn't have TOML write support built-in; TOML structure is simple enough for string formatting
- Required TOML fields: `name`, `description`, `developer_instructions`

**D-05: IDE detection**

- Decision: `command -v <binary>` for CLI-based IDEs; `test -f <config-path>` for config-based IDEs
- Rationale: `command -v` is POSIX-portable and handles shell builtins; config-path check is reliable for IDEs that don't have a CLI binary in PATH

**D-06: Interactive prompts**

- Decision: `read -rp` for bash/zsh; `[ -t 0 ]` stdin-terminal check for CI detection
- Pattern: `read -rp "Label [Default]: " VAR; VAR="${VAR:-Default}"`
- CI fallback: when `! [ -t 0 ]`, skip all prompts and use defaults silently

**D-08: Toggle-loop selection UI**

- Decision: Shared `prompt_toggle_select` helper replaces separate `prompt_ide_select` and `prompt_mcp_select` numeric-input prompts
- Rationale: Checkbox-style toggle list is more intuitive than comma-separated number entry; pre-selected defaults are visually obvious; invalid input is caught inline without losing state
- Behaviour:
  - Display `[✓]`/`[ ]` checkbox list with item name + description
  - `read` single input per loop iteration: number → toggle; `A` → select all; `N` → clear all; Enter → confirm
  - Invalid input: inline warning, stay in loop
  - Empty selection + Enter: warning + set `_confirm_empty` flag; second Enter confirms zero-selection
  - ANSI cursor-up redraw when stdout is TTY (`[ -t 1 ]`); plain reprint fallback otherwise
- Signature: callers populate `_PTS_IDS`, `_PTS_NAMES`, `_PTS_DESCS`, `_PTS_PRESEL` globals then call `prompt_toggle_select PROMPT RESULT_VAR`
- Applied to: IDE selection, MCP selection, skill selection
- Compatibility: bash 3.2+ and zsh (no `local -n` namerefs; uses `eval` for result writing)

**D-09: Skill selection is per-skill, not per-skill×IDE**

- Decision: User selects which skills to install once; selected skills are installed to all selected IDEs automatically with no per-IDE prompts
- Rationale: Asking "which skills for OpenCode" then "which skills for Claude Code" is redundant — if you want a skill, you want it everywhere you selected
- Lifecycle prompt: one prompt per skill, based on aggregated state across all selected IDEs; action applied silently to all IDEs
- Aggregation priority: `broken` > `copied` > `absent` (incl. mixed linked+absent) > `linked`
- Mixed state (linked in some IDEs, absent in others): treated as `absent` (Option B) — install action applies to all IDEs, re-linking existing ones

---

## Phase 1: Design & Contracts

### Descriptor Schemas

#### `skills/<name>/skill.json`

```json
{
  "name": "tab-refuter",
  "version": "1.0.0",
  "description": "Adversarial spec reviewer — finds ambiguities and gaps in technical docs",
  "upstream": "https://github.com/rafaelmgoncalves/ia-framework",
  "requires_mcps": [],
  "assets": {
    "skill": true,
    "agents": true,
    "commands": true,
    "hooks": true
  }
}
```

Fields:

- `name` — matches directory name under `skills/`
- `version` — semver string; updated by `fetch-skill.sh`
- `description` — shown during install prompt
- `upstream` — URL used by `fetch-skill.sh` to refresh content
- `requires_mcps` — array of MCP `id` values this skill depends on (used for dependency warning FR-032)
- `assets` — flags indicating which sub-folders exist; installer skips missing asset types

Skill inventory with `requires_mcps`:

| Skill               | requires_mcps                  |
| ------------------- | ------------------------------ |
| `grill-with-docs`   | `[]`                           |
| `tab-refuter`       | `["ia-framework", "context7"]` |
| `tab-ticket-reader` | `["jira", "ia-framework"]`     |
| `tlc-spec-driven`   | `[]`                           |

#### `mcps/<name>/mcp.json`

```json
{
  "id": "context7",
  "name": "Context7",
  "description": "Up-to-date library documentation for LLMs",
  "default": true,
  "requires_build": false,
  "command": ["npx", "-y", "@upstash/context7-mcp@latest"],
  "environment": {},
  "per_ide": {
    "opencode": { "type": "local" }
  }
}
```

Special `ia-framework-mcp/mcp.json`:

```json
{
  "id": "ia-framework",
  "name": "ia-framework",
  "description": "ia-framework RAG/search MCP server (built locally)",
  "default": true,
  "requires_build": true,
  "command_template": ["sh", "-c", "node {{MCP_BIN}} 2>> {{LOG_FILE}}"],
  "environment": {
    "IA_FRAMEWORK_CONFIG": "{{CONFIG_PATH}}"
  },
  "per_ide": {
    "opencode": { "type": "local" }
  }
}
```

`{{MCP_BIN}}`, `{{LOG_FILE}}`, `{{CONFIG_PATH}}` are substituted at install time with resolved absolute paths.

#### `scripts/ide-descriptors/<ide>.sh`

Each file sources cleanly and exports these variables (no side effects on source):

```bash
# Example: scripts/ide-descriptors/opencode.sh
IDE_ID="opencode"
IDE_NAME="OpenCode"
IDE_DETECT_PATH="${XDG_CONFIG_HOME:-${HOME}/.config}/opencode/opencode.json"
IDE_GLOBAL_DIR="${XDG_CONFIG_HOME:-${HOME}/.config}/opencode"
IDE_SKILLS_DIR="${IDE_GLOBAL_DIR}/skills"
IDE_AGENTS_DIR="${IDE_GLOBAL_DIR}/agents"
IDE_COMMANDS_DIR="${IDE_GLOBAL_DIR}/command"   # singular — confirmed
IDE_HOOKS_DIR="${IDE_GLOBAL_DIR}/hooks"
IDE_MCP_CONFIG="${IDE_GLOBAL_DIR}/opencode.json"
IDE_MCP_FORMAT="opencode-json"   # opencode-json | claude-json | codex-toml | vscode-json
IDE_AGENT_FORMAT="md"            # md | toml
IDE_SUPPORTS_SYMLINK="true"
IDE_SUPPORTS_HOOKS="true"
IDE_SUPPORTS_COMMANDS="true"
```

All 7 descriptors follow the same variable names — installer sources one at a time and reads the same variable set.

### Script Architecture

#### `scripts/install-skills.sh` — core logic

```
setup_skills()
  ├── detect_ides()              → array of IDE_IDs with detect_path present
  ├── prompt_ide_select()        → user picks IDEs; OpenCode pre-selected as default
  ├── scan_skills()              → find all skills/ with valid skill.json
  ├── prompt_skill_select()      → toggle-loop; user picks which skills to install (all pre-selected)
  └── for each selected_skill:
        check_mcp_deps(skill)    → warn if requires_mcps not installed
        state = aggregate_skill_state(skill, SELECTED_IDES)  → single worst-case state
        action = prompt_skill_action(state, skill)            → one prompt per skill only
        for each selected_ide:                                → silent execution per IDE
          execute_action(action, skill, ide)
        print summary line: "✓ <skill> <action> to: <IDE1>, <IDE2>"

aggregate_skill_state(skill_name, ide_list)
  # Check state in each IDE, return worst-case by priority:
  # broken > copied > absent (incl. mixed linked+absent) > linked
  worst="absent"
  for each ide in ide_list:
    source ide-descriptor for ide
    state = detect_link_state("${IDE_SKILLS_DIR}/${skill_name}")
    if state == "broken"             → return "broken" immediately
    if state == "copied"             → worst = "copied"
    if state == "absent" && worst == "linked" → worst = "absent"  # mixed → absent
    if state == "linked" && worst == "absent" → worst = "absent"  # mixed → absent
    if state == "linked" && worst == "absent (pure)" → worst = "linked"
  return worst

detect_link_state(path)           → linked | broken | copied | absent  (unchanged)

install_skill(skill_dir, ide_id)  → unchanged (symlink creation per IDE)
unlink_skill(skill_name, ide_id)  → unchanged (removal per IDE)
```

**Key design principle (D-09)**: The user selects _which skills_ once. The skill-to-IDE mapping is automatic — every selected skill goes to every selected IDE. No per-IDE skill prompts. The lifecycle prompt (skip/re-link/unlink) appears once per skill, based on the aggregated state across all selected IDEs, and the action is applied silently to all IDEs.

install_skill(skill_dir, ide_id)
source ide-descriptor for ide_id

# 1. Skill directory symlink

mkdir -p "$IDE_SKILLS_DIR"
  ln -sfn "$skill_dir" "${IDE_SKILLS_DIR}/${skill_name}"

# 2. Agents (per file)

if assets.agents && IDE*AGENT_FORMAT=md:
for f in agents/*.md:
ln -sfn "$skill_dir/agents/$f" "${IDE_AGENTS_DIR}/$f"
elif assets.agents && IDE*AGENT_FORMAT=toml:
for f in agents/*.md:
transform_md_to_toml "$skill_dir/agents/$f" "${IDE_AGENTS_DIR}/${f%.md}.toml"

# 3. Commands (per file, if IDE_SUPPORTS_COMMANDS=true)

for f in commands/\*.md:
ln -sfn "$skill_dir/commands/$f" "${IDE_COMMANDS_DIR}/$f"

# 4. Hooks (per file, if IDE_SUPPORTS_HOOKS=true)

for f in hooks/\*.js:
ln -sfn "$skill_dir/hooks/$f" "${IDE_HOOKS_DIR}/$f"
register_hooks_for_ide(skill_dir, ide_id)

register_hooks_for_ide(skill_dir, ide_id)

# Reads hooks/\*.js, merges into IDE hook registry

# OpenCode: no registry needed (hooks referenced in agent frontmatter)

# Claude Code: merge into ~/.claude/settings.json "hooks" key via node inline

# Codex: write/merge ~/.codex/hooks.json via node inline

transform_md_to_toml(src_md, dest_toml)

# Python3 inline: parse ---frontmatter--- + body → TOML

python3 -c "..." < "$src_md" > "$dest_toml"

```

#### `scripts/configure-mcp.sh` — MCP installation

```

configure_mcps()
├── detect_ides() → same helper as install-skills.sh
├── prompt_ide_select() → same helper
├── scan_mcps() → find all mcps/ with valid mcp.json
├── prompt_mcp_select() → default MCPs pre-ticked; show description
└── for each mcp × IDE:
state = detect_mcp_state(mcp_id, ide_mcp_config)
prompt_mcp_action(state) → skip / reinstall / uninstall
execute_mcp_action(action, mcp, ide)

detect_mcp_state(mcp_id, config_file)

# Use node inline to parse config_file JSON/TOML

# Check if mcp_id key exists under "mcp" section

# Returns: "configured" | "absent"

install_mcp(mcp_json, ide_id)
source ide-descriptor for ide_id
case $IDE_MCP_FORMAT in
    opencode-json) merge_mcp_opencode "$mcp_json" "$IDE_MCP_CONFIG" ;;
    claude-json)   merge_mcp_claude   "$mcp_json" "$IDE_MCP_CONFIG" ;;
    codex-toml)    merge_mcp_codex    "$mcp_json" "$IDE_MCP_CONFIG" ;;
    vscode-json)   merge_mcp_vscode   "$mcp_json" "$IDE_MCP_CONFIG" ;;
esac

# ia-framework special case: substitute {{MCP_BIN}}, {{LOG_FILE}}, {{CONFIG_PATH}}

```

#### `scripts/uninstall.sh` — full teardown

```

uninstall_all()

# 1. Detect all IDEs (all descriptors, not just present ones)

# 2. Show what will be removed (dry-run summary)

# 3. Prompt confirmation: "Remove all MCPs and skill links? [y/N]"

# 4. For each IDE × each skill: remove symlinks (skill dir + agents + commands + hooks)

# 5. For each IDE × each MCP: remove config entry via node inline

# 6. For Claude Code: remove hook registrations from ~/.claude/settings.json

# 7. For Codex: remove ~/.codex/hooks.json entries

# 8. Report summary: N symlinks removed, M MCP entries removed

```

#### `scripts/fetch-skill.sh` — upstream refresh

```

fetch_skill(skill_name)
skill_dir="$SCRIPT_DIR/skills/$skill_name"
upstream=$(jq -r .upstream "$skill_dir/skill.json")

# Full replace: remove dir contents, download fresh, update version

tmpdir=$(mktemp -d)
  git clone --depth 1 "$upstream" "$tmpdir"   # or curl for single file skills
  rm -rf "$skill_dir"/\*
cp -r "$tmpdir/<skill-path>/." "$skill_dir/"

# Update skill.json version from fetched metadata

cleanup "$tmpdir"

````

#### `install.sh` changes

```diff
- source "${SCRIPT_DIR}/scripts/install-speckit.sh"    ← REMOVED
- setup_speckit || ...                                  ← REMOVED (Step 1)

- # Step 5: Start services                             ← moved to Step 6
- # Step 6: Configure OpenCode MCP                     ← REPLACED

+ # Step 5: Harness Configuration                      ← interactive prompts first
+ echo -e "${BOLD}Step 5: Harness Configuration${NC}"
+ # Step 5.1: Configure MCPs
+ source "${SCRIPT_DIR}/scripts/configure-mcp.sh"
+ configure_mcps "${SCRIPT_DIR}" "${CONFIG_FILE}"
+ # Step 5.2: Install Skills
+ source "${SCRIPT_DIR}/scripts/install-skills.sh"
+ setup_skills "${SCRIPT_DIR}"
+ # Step 6: Start services (Qdrant + dashboard)        ← after all prompts complete
````

### Shared Helper Functions

Both `configure-mcp.sh` and `install-skills.sh` source a shared set of helpers. These live in a new `scripts/installer-helpers.sh`:

```bash
# IDE detection and selection
detect_ides()              # sources all ide-descriptors, checks IDE_DETECT_PATH
prompt_ide_select()        # calls prompt_toggle_select; pre-selects OpenCode
prompt_toggle_select()     # generic toggle-loop checkbox UI (D-08)

# Prompt utilities
prompt_yn()                # [Y/n] with default Y
is_noninteractive()        # [ ! -t 0 ] || [ -n "$CI" ]

# JSON helpers (node inline)
json_set_mcp()             # upsert MCP entry into IDE config JSON
json_remove_mcp()          # remove MCP entry from IDE config JSON
json_merge_hooks()         # append hook registration to settings.json

# Symlink state
detect_link_state()        # linked | broken | copied | absent
```

### `install.sh` step map (final)

```
Step 1: Prerequisites      (docker, node, ollama, opencode)   ← SpecKit REMOVED
Step 2: Package manager    (pnpm)
Step 3: Build              (pnpm install + pnpm build)
Step 3.5: Install CLI      (npm link)
Step 4: Configure          (init_config)
Step 5: Harness Configuration                                  ← moved before services
  Step 5.1: Configure MCPs
  Step 5.2: Install Skills
Step 6: Start services     (Qdrant + dashboard)               ← was Step 5
Step 6.5: Agent docs inject
Success summary
```

Rationale for reorder: all interactive prompts (IDE selection, MCP toggles, skill toggles) complete in Step 5 before the ~60s dashboard wait in Step 6. User experience is continuous conversation → then wait, not wait interrupted by prompts.

---

## Phase 1: Data Model

See [`data-model.md`](./data-model.md) for full entity definitions.

---

## Phase 1: Quickstart

See [`quickstart.md`](./quickstart.md) for developer setup and testing guide.
