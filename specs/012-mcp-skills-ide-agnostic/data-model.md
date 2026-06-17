# Data Model: IDE-Agnostic MCP & Skills Installation

**Feature**: `012-mcp-skills-ide-agnostic` | **Date**: 2026-06-17

This feature introduces no database tables or TypeScript domain entities — it is a shell scripting feature. This document defines the **file-based descriptor schemas** and **runtime state model** that serve as the data model.

---

## Entities

### 1. Skill Descriptor (`skills/<name>/skill.json`)

Represents one vendored skill in the ia-framework repository.

| Field             | Type            | Required | Description                                                |
| ----------------- | --------------- | -------- | ---------------------------------------------------------- |
| `name`            | string          | yes      | Matches parent directory name under `skills/`              |
| `version`         | string (semver) | yes      | Current vendored version; updated by `fetch-skill.sh`      |
| `description`     | string          | yes      | Shown to user during install prompt                        |
| `upstream`        | string (URL)    | yes      | Source URL for `fetch-skill.sh` to refresh content         |
| `requires_mcps`   | string[]        | yes      | MCP `id` values this skill depends on (may be empty array) |
| `assets.skill`    | boolean         | yes      | Whether a `SKILL.md` file exists                           |
| `assets.agents`   | boolean         | yes      | Whether an `agents/` subfolder exists                      |
| `assets.commands` | boolean         | yes      | Whether a `commands/` subfolder exists                     |
| `assets.hooks`    | boolean         | yes      | Whether a `hooks/` subfolder exists                        |

**Example**:

```json
{
  "name": "tab-ticket-reader",
  "version": "0.1.0",
  "description": "JIRA ticket → structured input for spec-driven development",
  "upstream": "https://github.com/rafaelmgoncalves/ia-framework",
  "requires_mcps": ["jira", "ia-framework"],
  "assets": {
    "skill": true,
    "agents": true,
    "commands": true,
    "hooks": true
  }
}
```

**Validation rules**:

- `name` must match `^[a-z0-9-]+$` and equal the parent directory name
- `version` must be a valid semver string
- `upstream` must be a valid URL
- `requires_mcps` entries must match existing MCP `id` values in `mcps/`
- At least `assets.skill` must be `true`

---

### 2. MCP Descriptor (`mcps/<name>/mcp.json`)

Represents one MCP integration available for installation.

| Field              | Type     | Required | Description                                                              |
| ------------------ | -------- | -------- | ------------------------------------------------------------------------ |
| `id`               | string   | yes      | Unique identifier; used as config key in IDE config files                |
| `name`             | string   | yes      | Human-readable display name                                              |
| `description`      | string   | yes      | Shown to user during install prompt                                      |
| `default`          | boolean  | yes      | Pre-selected in interactive mode; installed in CI mode                   |
| `requires_build`   | boolean  | yes      | If true, binary must be built before config is written                   |
| `command`          | string[] | no       | Command array for standard MCPs                                          |
| `command_template` | string[] | no       | Command with `{{PLACEHOLDER}}` substitutions (used instead of `command`) |
| `environment`      | object   | no       | Environment variables; values may contain `{{PLACEHOLDER}}`              |
| `per_ide`          | object   | no       | IDE-specific config overrides, keyed by `IDE_ID`                         |

**Placeholders** (substituted at install time for `ia-framework` MCP):

- `{{MCP_BIN}}` → absolute path to `packages/mcp-server/dist/bin.js`
- `{{LOG_FILE}}` → absolute path to `.ia-framework/logs/mcp-server.log`
- `{{CONFIG_PATH}}` → absolute path to `.ia-framework/project.json`

**Example — standard MCP**:

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

**Example — ia-framework MCP (with template)**:

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

---

### 3. IDE Descriptor (`scripts/ide-descriptors/<ide>.sh`)

A shell script that, when sourced, exports variables describing one IDE's filesystem layout and capabilities.

| Variable                | Type   | Description                                                         |
| ----------------------- | ------ | ------------------------------------------------------------------- |
| `IDE_ID`                | string | Unique identifier (e.g., `opencode`, `claude-code`)                 |
| `IDE_NAME`              | string | Human-readable display name                                         |
| `IDE_DETECT_PATH`       | string | File or directory whose existence indicates IDE is installed        |
| `IDE_GLOBAL_DIR`        | string | Root of IDE's global config directory                               |
| `IDE_SKILLS_DIR`        | string | Where skill directories are linked                                  |
| `IDE_AGENTS_DIR`        | string | Where agent `.md` files are linked                                  |
| `IDE_COMMANDS_DIR`      | string | Where command `.md` files are linked                                |
| `IDE_HOOKS_DIR`         | string | Where hook `.js` files are linked                                   |
| `IDE_MCP_CONFIG`        | string | Path to IDE's MCP configuration file                                |
| `IDE_MCP_FORMAT`        | string | One of: `opencode-json`, `claude-json`, `codex-toml`, `vscode-json` |
| `IDE_AGENT_FORMAT`      | string | One of: `md` (symlink) or `toml` (copy+transform)                   |
| `IDE_SUPPORTS_SYMLINK`  | string | `"true"` or `"false"` — whether skill/agent links are supported     |
| `IDE_SUPPORTS_HOOKS`    | string | `"true"` or `"false"` — whether hooks are supported                 |
| `IDE_SUPPORTS_COMMANDS` | string | `"true"` or `"false"` — whether commands are supported              |

**All 7 IDE descriptors** (path values):

| IDE            | `IDE_DETECT_PATH`                  | `IDE_SKILLS_DIR`              | `IDE_COMMANDS_DIR`            | `IDE_MCP_FORMAT` | `IDE_AGENT_FORMAT` |
| -------------- | ---------------------------------- | ----------------------------- | ----------------------------- | ---------------- | ------------------ |
| opencode       | `~/.config/opencode/opencode.json` | `~/.config/opencode/skills/`  | `~/.config/opencode/command/` | `opencode-json`  | `md`               |
| claude-code    | `~/.claude/`                       | `~/.claude/skills/`           | `~/.claude/commands/`         | `claude-json`    | `md`               |
| codex          | `~/.codex/config.toml`             | `~/.agents/skills/`           | —                             | `codex-toml`     | `toml`             |
| vscode-copilot | `~/.vscode/`                       | —                             | —                             | `vscode-json`    | `md`               |
| cursor         | `~/.cursor/`                       | `~/.cursor/skills/`           | —                             | `vscode-json`    | `md`               |
| gemini         | `~/.gemini/`                       | `~/.gemini/skills/`           | —                             | —                | `md`               |
| windsurf       | `~/.codeium/windsurf/`             | `~/.codeium/windsurf/skills/` | —                             | —                | `md`               |

---

### 4. Link Lifecycle State

Runtime-only value. Not persisted. Detected at runtime by `detect_link_state()`.

| State    | Condition                                   | Available Actions               |
| -------- | ------------------------------------------- | ------------------------------- |
| `linked` | Path is symlink AND target resolves         | skip / re-link / unlink         |
| `broken` | Path is symlink AND target does NOT resolve | re-link / unlink (+ warning)    |
| `copied` | Path is a real directory (not symlink)      | upgrade-to-link / skip / remove |
| `absent` | Path does not exist                         | install                         |

---

### 5. Installer State (Runtime)

Transient, in-memory only during a single `install.sh` run.

| Variable           | Type     | Description                                                                |
| ------------------ | -------- | -------------------------------------------------------------------------- |
| `DETECTED_IDES`    | string[] | IDE IDs whose detect path was found                                        |
| `SELECTED_IDES`    | string[] | IDE IDs chosen by user (or CI default)                                     |
| `AVAILABLE_SKILLS` | string[] | Skill names with valid `skill.json` in `skills/`                           |
| `SELECTED_SKILLS`  | string[] | Skill names chosen by user (or CI default: all)                            |
| `AVAILABLE_MCPS`   | string[] | MCP IDs with valid `mcp.json` in `mcps/`                                   |
| `SELECTED_MCPS`    | string[] | MCP IDs chosen by user (or CI default: all `default: true`)                |
| `INSTALL_WARNINGS` | string[] | Accumulated non-fatal warnings shown at end (e.g., missing MCP dependency) |

---

## Relationships

```
Skill (skill.json)
  └── requires_mcps → MCP (mcp.json) [0..N]
  └── assets → installed into → IDE via IDE Descriptor
                                ├── skills dir (symlink, always)
                                ├── agents dir (symlink or copy+toml)
                                ├── commands dir (symlink, if supported)
                                └── hooks dir (symlink + registered, if supported)

MCP (mcp.json)
  └── installed into → IDE via IDE Descriptor
                        └── IDE_MCP_CONFIG (format per IDE_MCP_FORMAT)
```

---

## State Transitions

### Skill installation state machine

```
absent
  → [install]    → linked
  → (no action)  → absent

linked
  → [skip]       → linked
  → [re-link]    → linked (symlink recreated)
  → [unlink]     → absent

broken
  → [re-link]    → linked
  → [unlink]     → absent

copied
  → [upgrade]    → linked (directory replaced by symlink)
  → [skip]       → copied
  → [remove]     → absent
```

### MCP installation state machine

```
absent
  → [install]    → configured
  → (no action)  → absent

configured
  → [skip]       → configured
  → [reinstall]  → configured (entry updated)
  → [uninstall]  → absent
```
