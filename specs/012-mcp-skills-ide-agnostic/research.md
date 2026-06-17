# Research: IDE-Agnostic MCP & Skills Installation

**Feature**: `012-mcp-skills-ide-agnostic` | **Date**: 2026-06-17

All NEEDS CLARIFICATION items from Technical Context resolved. Findings below.

---

## D-01: Symlink State Detection

**Decision**: `test -L` + `test -e` combination, POSIX-portable.

**Pattern**:

```bash
detect_link_state() {
  local path="$1"
  if [ -L "$path" ] && [ -e "$path" ]; then
    echo "linked"
  elif [ -L "$path" ]; then
    echo "broken"
  elif [ -d "$path" ]; then
    echo "copied"
  else
    echo "absent"
  fi
}
```

**Key findings**:

- `test -L` is true even for broken symlinks — the symlink file itself exists
- `test -e` follows the symlink — returns false if the target is gone
- `readlink "$path"` prints the target without following the chain
- On macOS, `readlink -f` (canonical path) requires `coreutils`; use `python3 -c "import os,sys; print(os.path.realpath(sys.argv[1]))"` for portability if needed
- Combine `-L && -e` for active link, `-L && !-e` for broken, `!-L && -d` for copied, `!-L && !-d` for absent

**Alternatives considered**: `stat` command (not portable between macOS BSD stat and GNU stat); manifest file (rejected per D-03).

---

## D-02: JSON Config Merging (Node Inline)

**Decision**: Inline `node --input-type=module` heredoc; data passed via environment variables to avoid quoting issues.

**Pattern**:

```bash
SETTINGS_FILE="$HOME/.claude/settings.json" \
MCP_ID="context7" \
MCP_ENTRY='{"type":"local","command":["npx","-y","@upstash/context7-mcp@latest"],"enabled":true}' \
node --input-type=module <<'EOF'
import { readFileSync, writeFileSync } from 'fs';
const f = process.env.SETTINGS_FILE;
let cfg = {};
try { cfg = JSON.parse(readFileSync(f, 'utf8')); } catch {}
cfg.mcp ??= {};
cfg.mcp[process.env.MCP_ID] = JSON.parse(process.env.MCP_ENTRY);
writeFileSync(f, JSON.stringify(cfg, null, 2) + '\n');
EOF
```

**Key findings**:

- `--input-type=module` requires Node ≥ 12; ia-framework requires Node ≥ 22, so this is safe
- Heredoc with `'EOF'` (single-quoted) prevents shell variable expansion inside the script — critical for JSON strings containing `$`
- Passing data via `export` / env-var prefix avoids all quoting complexity
- Pattern already used successfully in `configure-opencode.sh` — maintain consistency

**Alternatives considered**: `jq` (not always installed on macOS); temp file (more complex, cleanup risk).

---

## D-03: No Manifest File — Filesystem-Only State Detection

**Decision**: State detected entirely at runtime by inspecting filesystem. No `install-manifest.json` written or maintained.

**Rationale**: Manifest files drift out of sync with reality (partial installs, manual changes, IDE updates). Filesystem inspection is always authoritative. Consistent with how `configure-opencode.sh` works today — it reads the opencode.json directly to check if MCPs are configured.

**Implication**: The installer reads each IDE's config file(s) and the symlink targets on every run. This is slightly slower but eliminates an entire class of "manifest vs reality" bugs.

---

## D-04: Claude Code Global Hooks Registration

**Decision**: Hooks installed to `~/.claude/hooks/` (symlinked); registration merged into `~/.claude/settings.json` under `"hooks"` key.

**JSON structure** (confirmed from live Claude Code plugin inspection):

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [{ "type": "command", "command": "/abs/path/to/hook.js" }]
      }
    ],
    "Stop": [
      {
        "hooks": [{ "type": "command", "command": "/abs/path/to/hook.js" }]
      }
    ]
  }
}
```

**Deduplication pattern** (append-only, check by command path):

```javascript
const already = (cfg.hooks[event] ?? [])
  .flatMap((g) => g.hooks ?? [])
  .some((h) => h.command === hookAbsPath);
if (!already) {
  /* append */
}
```

**Key findings**:

- `Stop`, `UserPromptSubmit`, `TaskCreated`, `TaskCompleted` etc. do NOT support `matcher` — omit it for those events
- `PostToolUse` supports `matcher` as a regex string matching tool names
- Hooks registered globally in `~/.claude/settings.json` are active for all Claude Code sessions, not just specific projects
- The hook `command` field requires an absolute path for global hooks (relative paths are project-relative)

---

## D-05: Codex Agent TOML Transformation

**Decision**: Python3 inline script to parse Markdown frontmatter → TOML format. Agents are **copied** (not symlinked) since format transformation is required.

**TOML structure** (confirmed from Codex CLI documentation):

```toml
name = "tab-refuter-orchestrator"
description = "Orchestrates adversarial spec review..."
developer_instructions = """
[body content from markdown, stripped of frontmatter]
"""
```

**Python3 transformer**:

```bash
transform_md_to_toml() {
  local src="$1" dest="$2"
  python3 - "$src" "$dest" <<'PYEOF'
import sys, re
src, dest = sys.argv[1], sys.argv[2]
text = open(src).read()
m = re.match(r'^---\n(.*?)\n---\n(.*)', text, re.DOTALL)
if not m:
    sys.exit(f"No frontmatter in {src}")
import json
# Parse simple key: value frontmatter (no full YAML needed)
front = {}
for line in m.group(1).splitlines():
    if ':' in line:
        k, _, v = line.partition(':')
        front[k.strip()] = v.strip().strip('"')
body = m.group(2).strip().replace('"""', '\\"\\"\\"')
name = front.get('name', '')
desc = front.get('description', '')
toml = f'name = "{name}"\ndescription = "{desc}"\ndeveloper_instructions = """\n{body}\n"""\n'
open(dest, 'w').write(toml)
PYEOF
}
```

**Alternatives considered**: `yq` (not always installed); `node` with TOML library (no built-in TOML in Node, would require installing a dependency); full `python3 yaml` (not always available; simple regex suffices for the frontmatter structure used).

---

## D-06: IDE Detection

**Decision**: `command -v <binary>` for CLI-based detection; `test -f <config-path>` for config-based detection.

**Per-IDE detection**:
| IDE | Detection method | Path/command |
|-----|-----------------|--------------|
| OpenCode | config file | `~/.config/opencode/opencode.json` |
| Claude Code | directory | `~/.claude/` |
| Codex | config file | `~/.codex/config.toml` |
| VSCode/Copilot | directory | `~/.vscode/` |
| Cursor | directory | `~/.cursor/` |
| Gemini CLI | command | `command -v gemini` |
| Windsurf | directory | `~/.codeium/windsurf/` |

**Pattern**:

```bash
detect_ides() {
  DETECTED_IDES=()
  for descriptor in "$SCRIPT_DIR/scripts/ide-descriptors/"*.sh; do
    source "$descriptor"
    if [ -f "$IDE_DETECT_PATH" ] || [ -d "$IDE_DETECT_PATH" ]; then
      DETECTED_IDES+=("$IDE_ID")
    fi
    # Reset vars to avoid leakage between descriptors
    unset IDE_ID IDE_NAME IDE_DETECT_PATH IDE_GLOBAL_DIR \
          IDE_SKILLS_DIR IDE_AGENTS_DIR IDE_COMMANDS_DIR IDE_HOOKS_DIR \
          IDE_MCP_CONFIG IDE_MCP_FORMAT IDE_AGENT_FORMAT \
          IDE_SUPPORTS_SYMLINK IDE_SUPPORTS_HOOKS IDE_SUPPORTS_COMMANDS
  done
}
```

---

## D-07: Interactive Prompt Pattern

**Decision**: `read -rp` for interactive prompts; `[ ! -t 0 ]` for CI/non-interactive detection.

**Standard pattern used throughout**:

```bash
is_noninteractive() {
  ! [ -t 0 ] || [ -n "${CI:-}" ] || [ -n "${NON_INTERACTIVE:-}" ]
}

prompt_yn() {
  local prompt="$1" default="${2:-Y}"
  if is_noninteractive; then
    [[ "$default" == "Y" ]] && return 0 || return 1
  fi
  local label
  [[ "$default" == "Y" ]] && label="[Y/n]" || label="[y/N]"
  read -rp "  $prompt $label: " yn
  yn="${yn:-$default}"
  [[ "$yn" =~ ^[Yy] ]]
}
```

---

## Open Questions (None)

All technical unknowns resolved. No items deferred to planning.
