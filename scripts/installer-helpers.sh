#!/usr/bin/env bash
# installer-helpers.sh — shared functions for configure-mcp.sh, install-skills.sh, uninstall.sh
# Source this file; do not execute directly.
#
# Provides:
#   is_noninteractive()       — detect CI / piped stdin
#   prompt_yn()               — [Y/n] or [y/N] prompt with default
#   prompt_toggle_select()    — checkbox toggle-loop (number/A/N/Enter)
#   detect_ides()             — populate DETECTED_IDES array
#   prompt_ide_select()       — let user pick from detected IDEs
#   detect_link_state()       — linked | broken | copied | absent
#   json_merge_hooks()        — append hooks to IDE hook registry

# ──────────────────────────────────────────────────────────────────────────────
# Color helpers (inherit from install.sh if already set, else define)
# ──────────────────────────────────────────────────────────────────────────────
RED="${RED:-\033[0;31m}"
GREEN="${GREEN:-\033[0;32m}"
YELLOW="${YELLOW:-\033[1;33m}"
BLUE="${BLUE:-\033[0;34m}"
BOLD="${BOLD:-\033[1m}"
DIM="${DIM:-\033[2m}"
WHITE="${WHITE:-\033[0;37m}"
NC="${NC:-\033[0m}"

# ──────────────────────────────────────────────────────────────────────────────
# is_noninteractive
# Returns 0 (true) when running in CI or with no TTY attached.
# ──────────────────────────────────────────────────────────────────────────────
is_noninteractive() {
  ! [ -t 0 ] || [ -n "${CI:-}" ] || [ -n "${NON_INTERACTIVE:-}" ]
}

# ──────────────────────────────────────────────────────────────────────────────
# prompt_yn PROMPT [DEFAULT]
# DEFAULT: "Y" (default yes) or "N" (default no). Defaults to "Y".
# Returns 0 for yes, 1 for no.
# ──────────────────────────────────────────────────────────────────────────────
prompt_yn() {
  local prompt="$1"
  local default="${2:-Y}"
  if is_noninteractive; then
    [[ "${default}" == "Y" ]] && return 0 || return 1
  fi
  local label
  [[ "${default}" == "Y" ]] && label="[Y/n]" || label="[y/N]"
  local yn
  read -rp "  ${prompt} ${label}: " yn
  yn="${yn:-${default}}"
  [[ "${yn}" =~ ^[Yy] ]]
}

# ──────────────────────────────────────────────────────────────────────────────
# prompt_toggle_select PROMPT RESULT_VAR
#
# Reads from these caller-populated globals before calling:
#   _PTS_IDS    — array of item ID strings (used as result values)
#   _PTS_NAMES  — array of display names (same length as _PTS_IDS)
#   _PTS_DESCS  — array of description strings (same length, may be empty strings)
#   _PTS_PRESEL — array of 0-based indices to pre-select
#
# Writes space-separated selected IDs into RESULT_VAR.
#
# Controls:
#   <number>  — toggle that item on/off
#   A / a     — select all
#   N / n     — clear all
#   Enter     — confirm (empty selection requires second Enter)
#
# In non-interactive mode: uses pre-selected items only, no display.
# Compatible with bash 3.2+ and zsh.
# ──────────────────────────────────────────────────────────────────────────────
prompt_toggle_select() {
  local prompt_text="$1"
  local result_var="$2"
  local count="${#_PTS_IDS[@]}"

  # Build selected state (space-separated 0/1 per item)
  local selected=()
  for (( i=0; i<count; i++ )); do
    selected+=( 0 )
  done
  for idx in "${_PTS_PRESEL[@]:-}"; do
    if [ -n "$idx" ] && [ "$idx" -lt "$count" ]; then
      selected[$idx]=1
    fi
  done

  # Non-interactive: return pre-selected directly
  if is_noninteractive; then
    local res=""
    for (( i=0; i<count; i++ )); do
      [ "${selected[$i]}" -eq 1 ] && res="${res}${_PTS_IDS[$i]} "
    done
    eval "${result_var}='${res% }'"
    return 0
  fi

  local confirm_empty=0
  local last_error=""

  # ── draw ────────────────────────────────────────────────────────────────────
  _pts_draw() {
    echo ""
    echo -e "  ${BOLD}${prompt_text}${NC}"
    echo -e "  Toggle: number  |  A = all  |  N = none  |  Enter = confirm"
    echo ""
    for (( i=0; i<count; i++ )); do
      local box
      if [ "${selected[$i]}" -eq 1 ]; then
        box="[${GREEN}✓${NC}]"
      else
        box="[ ]"
      fi
      local label="${_PTS_NAMES[$i]}"
      local desc="${_PTS_DESCS[$i]:-}"
      if [ -n "$desc" ]; then
        printf "    %b %d. %s\n      %b%s%b\n" "$box" "$((i+1))" "$label" "${DIM:-}" "$desc" "${NC}"
      else
        printf "    %b %d. %s\n" "$box" "$((i+1))" "$label"
      fi
    done
    echo ""
    if [ -n "$last_error" ]; then
      echo -e "  ${YELLOW}⚠${NC}  ${last_error}"
      echo ""
    fi
  }

  # ── erase (cursor-up + clear-to-end) ────────────────────────────────────────
  _pts_erase() {
    if [ -t 1 ]; then
      # Count lines drawn: header(3) + items + trailing newline + optional error(2)
      local lines=$(( 3 + count + 1 ))
      for (( i=0; i<count; i++ )); do
        [ -n "${_PTS_DESCS[$i]:-}" ] && lines=$(( lines + 1 ))
      done
      [ -n "$last_error" ] && lines=$(( lines + 2 ))
      printf "\033[%dA\033[J" "$lines"
    fi
  }

  # Initial draw
  _pts_draw

  while true; do
    local input
    read -rp "  > " input

    # ── Enter ────────────────────────────────────────────────────────────────
    if [ -z "$input" ]; then
      local any=0
      for (( i=0; i<count; i++ )); do
        [ "${selected[$i]}" -eq 1 ] && any=1 && break
      done
      if [ "$any" -eq 1 ]; then
        break
      else
        if [ "$confirm_empty" -eq 1 ]; then
          break  # second Enter on empty confirms zero
        else
          confirm_empty=1
          last_error="Nothing selected — press Enter again to confirm zero, or enter a number to select"
          _pts_erase; _pts_draw
          continue
        fi
      fi
    fi

    confirm_empty=0
    local input_lc
    input_lc=$(echo "$input" | tr '[:upper:]' '[:lower:]')

    # ── A → select all ──────────────────────────────────────────────────────
    if [ "$input_lc" = "a" ]; then
      for (( i=0; i<count; i++ )); do selected[$i]=1; done
      last_error=""; _pts_erase; _pts_draw; continue
    fi

    # ── N → clear all ───────────────────────────────────────────────────────
    if [ "$input_lc" = "n" ]; then
      for (( i=0; i<count; i++ )); do selected[$i]=0; done
      last_error=""; _pts_erase; _pts_draw; continue
    fi

    # ── number → toggle ─────────────────────────────────────────────────────
    if [[ "$input" =~ ^[0-9]+$ ]] && [ "$input" -ge 1 ] && [ "$input" -le "$count" ]; then
      local idx=$(( input - 1 ))
      if [ "${selected[$idx]}" -eq 1 ]; then
        selected[$idx]=0
      else
        selected[$idx]=1
      fi
      last_error=""; _pts_erase; _pts_draw; continue
    fi

    # ── invalid ──────────────────────────────────────────────────────────────
    last_error="Invalid — enter 1-${count}, A (all), N (none), or Enter to confirm"
    _pts_erase; _pts_draw
  done

  # Write result
  local res=""
  for (( i=0; i<count; i++ )); do
    [ "${selected[$i]}" -eq 1 ] && res="${res}${_PTS_IDS[$i]} "
  done
  eval "${result_var}='${res% }'"
}

# ──────────────────────────────────────────────────────────────────────────────
# prompt_choice PROMPT OPTION1 OPTION2 ... — returns selected index (1-based) in REPLY
# In non-interactive mode returns 1 (first option = default).
# ──────────────────────────────────────────────────────────────────────────────
prompt_choice() {
  local prompt="$1"; shift
  local options=("$@")
  if is_noninteractive; then
    REPLY=1
    return 0
  fi
  echo ""
  local i=1
  for opt in "${options[@]}"; do
    echo -e "    [$i] $opt"
    i=$((i+1))
  done
  echo ""
  local choice
  read -rp "  ${prompt} [1]: " choice
  choice="${choice:-1}"
  if ! [[ "$choice" =~ ^[0-9]+$ ]] || [ "$choice" -lt 1 ] || [ "$choice" -gt "${#options[@]}" ]; then
    echo -e "  ${YELLOW}⚠${NC} Invalid choice, defaulting to 1"
    REPLY=1
  else
    REPLY="$choice"
  fi
}

# ──────────────────────────────────────────────────────────────────────────────
# detect_ides
# Sources each ide-descriptor, checks IDE_DETECT_PATH, populates DETECTED_IDES.
# Also populates DETECTED_IDE_NAMES for display.
# ──────────────────────────────────────────────────────────────────────────────
detect_ides() {
  DETECTED_IDES=()
  DETECTED_IDE_NAMES=()

  # Ensure OpenCode is always first if present
  local descriptor_dir="${SCRIPT_DIR}/scripts/ide-descriptors"
  if [ ! -d "$descriptor_dir" ]; then
    echo -e "  ${YELLOW}⚠${NC} No IDE descriptors found at ${descriptor_dir}"
    return 0
  fi

  # Build ordered list: opencode first, then alphabetical
  local descriptors=()
  [ -f "${descriptor_dir}/opencode.sh" ] && descriptors+=("${descriptor_dir}/opencode.sh")
  for f in "${descriptor_dir}"/*.sh; do
    [[ "$f" == "${descriptor_dir}/opencode.sh" ]] && continue
    descriptors+=("$f")
  done

  for descriptor in "${descriptors[@]}"; do
    # Source and check
    # shellcheck source=/dev/null
    source "$descriptor"
    # Check primary detect path OR legacy path (for backward compat with opencode.json)
    local _detected=false
    if [ -f "${IDE_DETECT_PATH}" ] || [ -d "${IDE_DETECT_PATH}" ]; then
      _detected=true
    elif [ -n "${IDE_DETECT_PATH_LEGACY:-}" ]; then
      if [ -f "${IDE_DETECT_PATH_LEGACY}" ] || [ -d "${IDE_DETECT_PATH_LEGACY}" ]; then
        _detected=true
      fi
    fi
    if [ "$_detected" = "true" ]; then
      DETECTED_IDES+=("${IDE_ID}")
      DETECTED_IDE_NAMES+=("${IDE_NAME}")
    fi
    # Unset all IDE_* vars to prevent leakage between descriptors
    unset IDE_ID IDE_NAME IDE_DETECT_PATH IDE_GLOBAL_DIR \
          IDE_SKILLS_DIR IDE_AGENTS_DIR IDE_COMMANDS_DIR IDE_HOOKS_DIR \
          IDE_MCP_CONFIG IDE_MCP_FORMAT IDE_AGENT_FORMAT \
          IDE_SUPPORTS_SYMLINK IDE_SUPPORTS_HOOKS IDE_SUPPORTS_COMMANDS
  done
}

# ──────────────────────────────────────────────────────────────────────────────
# prompt_ide_select
# Displays detected IDEs as a toggle list; populates SELECTED_IDES.
# Pre-selects OpenCode (index 0, since it's always sorted first).
# In non-interactive mode: selects OpenCode only (if present) or first detected.
# ──────────────────────────────────────────────────────────────────────────────
prompt_ide_select() {
  SELECTED_IDES=()

  if [ "${#DETECTED_IDES[@]}" -eq 0 ]; then
    echo -e "  ${YELLOW}⚠${NC} No supported IDEs detected."
    if ! is_noninteractive; then
      echo -e "  Supported IDEs: OpenCode, Claude Code, Codex, VSCode/Copilot, Cursor, Gemini, Windsurf"
    fi
    return 0
  fi

  if is_noninteractive; then
    if [[ " ${DETECTED_IDES[*]} " == *" opencode "* ]]; then
      SELECTED_IDES=("opencode")
    else
      SELECTED_IDES=("${DETECTED_IDES[0]}")
    fi
    echo -e "  ${BLUE}→${NC} Non-interactive: using ${SELECTED_IDES[0]}"
    return 0
  fi

  # Build description array (empty strings — IDE names are self-descriptive)
  local ide_descs=()
  for (( i=0; i<${#DETECTED_IDES[@]}; i++ )); do
    ide_descs+=("")
  done

  # Pre-select OpenCode (index 0, always first)
  local presel=(0)

  # Populate _PTS_* globals for prompt_toggle_select
  _PTS_IDS=("${DETECTED_IDES[@]}")
  _PTS_NAMES=("${DETECTED_IDE_NAMES[@]}")
  _PTS_DESCS=("${ide_descs[@]}")
  _PTS_PRESEL=("${presel[@]}")

  local _ide_result=""
  prompt_toggle_select "Select IDEs to configure" "_ide_result"

  if [ -n "$_ide_result" ]; then
    read -ra SELECTED_IDES <<< "$_ide_result"
  else
    echo -e "  ${YELLOW}⚠${NC} No IDEs selected — skipping IDE configuration."
  fi
}

# ──────────────────────────────────────────────────────────────────────────────
# source_ide_descriptor IDE_ID
# Sources the correct descriptor and exports IDE_* vars.
# ──────────────────────────────────────────────────────────────────────────────
source_ide_descriptor() {
  local ide_id="$1"
  local descriptor="${SCRIPT_DIR}/scripts/ide-descriptors/${ide_id}.sh"
  if [ ! -f "$descriptor" ]; then
    echo -e "  ${RED}✗${NC} No descriptor found for IDE: ${ide_id}"
    return 1
  fi
  # shellcheck source=/dev/null
  source "$descriptor"
}

# ──────────────────────────────────────────────────────────────────────────────
# detect_link_state PATH
# Outputs one of: linked | broken | copied | absent
# ──────────────────────────────────────────────────────────────────────────────
detect_link_state() {
  local path="$1"
  if [ -L "$path" ] && [ -e "$path" ]; then
    echo "linked"
  elif [ -L "$path" ]; then
    echo "broken"
  elif [ -d "$path" ] || [ -f "$path" ]; then
    echo "copied"
  else
    echo "absent"
  fi
}

# ──────────────────────────────────────────────────────────────────────────────
# json_merge_hooks IDE_ID HOOK_EVENT MATCHER HOOK_COMMAND
# Merges a hook entry into the IDE's hook registry.
# For Claude Code: merges into ~/.claude/settings.json
# For Codex: merges into ~/.codex/hooks.json
# MATCHER can be "" for events that don't support matchers (Stop, SessionStart, etc.)
# ──────────────────────────────────────────────────────────────────────────────
json_merge_hooks() {
  local ide_id="$1"
  local event="$2"
  local matcher="$3"
  local hook_command="$4"

  case "$ide_id" in
    claude-code)
      _json_merge_hooks_claude "$event" "$matcher" "$hook_command"
      ;;
    codex)
      _json_merge_hooks_codex "$event" "$matcher" "$hook_command"
      ;;
    *)
      # OpenCode, Cursor, etc.: hooks referenced in agent frontmatter, no registry needed
      return 0
      ;;
  esac
}

_json_merge_hooks_claude() {
  local event="$1" matcher="$2" hook_command="$3"
  local settings_file="${HOME}/.claude/settings.json"
  mkdir -p "$(dirname "$settings_file")"
  [ -f "$settings_file" ] || echo '{}' > "$settings_file"

  CLAUDE_HOOKS_EVENT="$event" \
  CLAUDE_HOOKS_MATCHER="$matcher" \
  CLAUDE_HOOKS_COMMAND="$hook_command" \
  node --input-type=module <<'EOF'
import { readFileSync, writeFileSync } from 'fs';
const f = process.env.HOME + '/.claude/settings.json';
const event = process.env.CLAUDE_HOOKS_EVENT;
const matcher = process.env.CLAUDE_HOOKS_MATCHER;
const cmd = process.env.CLAUDE_HOOKS_COMMAND;

let cfg = {};
try { cfg = JSON.parse(readFileSync(f, 'utf8')); } catch {}
cfg.hooks ??= {};
cfg.hooks[event] ??= [];

// Check for duplicate by command
const already = cfg.hooks[event]
  .flatMap(g => g.hooks ?? [])
  .some(h => h.command === cmd);
if (!already) {
  const entry = { hooks: [{ type: 'command', command: cmd }] };
  if (matcher) entry.matcher = matcher;
  cfg.hooks[event].push(entry);
}
writeFileSync(f, JSON.stringify(cfg, null, 2) + '\n');
EOF
}

_json_merge_hooks_codex() {
  local event="$1" matcher="$2" hook_command="$3"
  local hooks_file="${HOME}/.codex/hooks.json"
  mkdir -p "$(dirname "$hooks_file")"
  [ -f "$hooks_file" ] || echo '{"hooks":{}}' > "$hooks_file"

  CODEX_HOOKS_EVENT="$event" \
  CODEX_HOOKS_MATCHER="$matcher" \
  CODEX_HOOKS_COMMAND="$hook_command" \
  node --input-type=module <<'EOF'
import { readFileSync, writeFileSync } from 'fs';
const f = process.env.HOME + '/.codex/hooks.json';
const event = process.env.CODEX_HOOKS_EVENT;
const matcher = process.env.CODEX_HOOKS_MATCHER;
const cmd = process.env.CODEX_HOOKS_COMMAND;

let cfg = { hooks: {} };
try { cfg = JSON.parse(readFileSync(f, 'utf8')); } catch {}
cfg.hooks ??= {};
cfg.hooks[event] ??= [];

const already = cfg.hooks[event]
  .flatMap(g => g.hooks ?? [])
  .some(h => h.command === cmd);
if (!already) {
  const entry = { hooks: [{ type: 'command', command: cmd }] };
  if (matcher) entry.matcher = matcher;
  cfg.hooks[event].push(entry);
}
writeFileSync(f, JSON.stringify(cfg, null, 2) + '\n');
EOF
}

# ──────────────────────────────────────────────────────────────────────────────
# json_remove_hooks IDE_ID HOOK_COMMAND
# Removes all hook entries referencing HOOK_COMMAND from the IDE's hook registry.
# ──────────────────────────────────────────────────────────────────────────────
json_remove_hooks() {
  local ide_id="$1"
  local hook_command="$2"

  local settings_file=""
  case "$ide_id" in
    claude-code) settings_file="${HOME}/.claude/settings.json" ;;
    codex)       settings_file="${HOME}/.codex/hooks.json" ;;
    *)           return 0 ;;
  esac

  [ -f "$settings_file" ] || return 0

  HOOKS_SETTINGS_FILE="$settings_file" \
  HOOKS_REMOVE_COMMAND="$hook_command" \
  node --input-type=module <<'EOF'
import { readFileSync, writeFileSync } from 'fs';
const f = process.env.HOOKS_SETTINGS_FILE;
const removeCmd = process.env.HOOKS_REMOVE_COMMAND;
let cfg = {};
try { cfg = JSON.parse(readFileSync(f, 'utf8')); } catch { process.exit(0); }
const hooks = cfg.hooks ?? {};
for (const event of Object.keys(hooks)) {
  hooks[event] = hooks[event]
    .map(group => ({
      ...group,
      hooks: (group.hooks ?? []).filter(h => h.command !== removeCmd)
    }))
    .filter(group => (group.hooks ?? []).length > 0);
}
writeFileSync(f, JSON.stringify(cfg, null, 2) + '\n');
EOF
}
