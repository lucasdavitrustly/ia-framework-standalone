#!/usr/bin/env bash
# install-skills.sh — Interactive, symlink-based skills distribution
# Provides: setup_skills() function
#
# ia-framework is the single source of truth for skills.
# Skills are installed via filesystem symlinks so any update in the repo
# (git pull, fetch-skill.sh) propagates instantly to all linked IDEs.
#
# Usage: source this file then call setup_skills "$SCRIPT_DIR"

# ──────────────────────────────────────────────────────────────────────────────
# scan_skills
# Populates AVAILABLE_SKILLS (names) array from skills/*/skill.json.
# ──────────────────────────────────────────────────────────────────────────────
scan_skills() {
  local skills_dir="${SCRIPT_DIR}/skills"
  AVAILABLE_SKILLS=()

  if [ ! -d "$skills_dir" ]; then
    echo -e "  ${YELLOW:-}⚠${NC:-} No skills/ directory found at ${skills_dir}"
    return 0
  fi

  for skill_json in "${skills_dir}"/*/skill.json; do
    [ -f "$skill_json" ] || continue
    local name
    name=$(node --input-type=module 2>/dev/null <<EOF
import { readFileSync } from 'fs';
try {
  const s = JSON.parse(readFileSync('${skill_json}','utf8'));
  process.stdout.write(s.name || '');
} catch {}
EOF
)
    [ -n "$name" ] && AVAILABLE_SKILLS+=("$name")
  done
}

# ──────────────────────────────────────────────────────────────────────────────
# prompt_skill_select
# Prompts user to select skills using toggle-loop UI. Populates SELECTED_SKILLS.
# All skills are pre-selected by default. In CI mode: selects all silently.
# ──────────────────────────────────────────────────────────────────────────────
prompt_skill_select() {
  SELECTED_SKILLS=()

  if [ "${#AVAILABLE_SKILLS[@]}" -eq 0 ]; then
    echo -e "  ${YELLOW:-}⚠${NC:-} No skills found."
    return 0
  fi

  if is_noninteractive; then
    SELECTED_SKILLS=("${AVAILABLE_SKILLS[@]}")
    echo -e "  ${BLUE:-}→${NC:-} Non-interactive: installing all skills: ${SELECTED_SKILLS[*]}"
    return 0
  fi

  # Build descriptions array (name + version)
  local skill_descs=()
  local skill_display_names=()
  for i in "${!AVAILABLE_SKILLS[@]}"; do
    local skill="${AVAILABLE_SKILLS[$i]}"
    local skill_json="${SCRIPT_DIR}/skills/${skill}/skill.json"
    local version
    version=$(node --input-type=module 2>/dev/null <<EOF
import { readFileSync } from 'fs';
try { const s = JSON.parse(readFileSync('${skill_json}','utf8')); process.stdout.write(s.version||''); } catch {}
EOF
)
    local desc
    desc=$(node --input-type=module 2>/dev/null <<EOF
import { readFileSync } from 'fs';
try { const s = JSON.parse(readFileSync('${skill_json}','utf8')); process.stdout.write(s.description||''); } catch {}
EOF
)
    skill_display_names+=("${skill} (v${version:-?})")
    skill_descs+=("${desc:-}")
  done

  # Pre-select all skills by default
  local skill_presel=()
  for i in "${!AVAILABLE_SKILLS[@]}"; do
    skill_presel+=("$i")
  done

  local _skill_result=""
  _PTS_IDS=("${AVAILABLE_SKILLS[@]}")
  _PTS_NAMES=("${skill_display_names[@]}")
  _PTS_DESCS=("${skill_descs[@]}")
  _PTS_PRESEL=("${skill_presel[@]}")
  prompt_toggle_select "Select skills to install" "_skill_result"

  if [ -n "$_skill_result" ]; then
    read -ra SELECTED_SKILLS <<< "$_skill_result"
  fi
}

# ──────────────────────────────────────────────────────────────────────────────
# check_mcp_deps SKILL_NAME
# Compares skill's requires_mcps against SELECTED_MCPS.
# Prints warning for any missing dependency (does not block install).
# ──────────────────────────────────────────────────────────────────────────────
check_mcp_deps() {
  local skill_name="$1"
  local skill_json="${SCRIPT_DIR}/skills/${skill_name}/skill.json"

  SKILL_MCP_DEPS_WARN=""

  SKILL_JSON_PATH="$skill_json" \
  SELECTED_MCPS_STR="${SELECTED_MCPS[*]:-}" \
  node --input-type=module <<'EOF'
import { readFileSync } from 'fs';
try {
  const s = JSON.parse(readFileSync(process.env.SKILL_JSON_PATH, 'utf8'));
  const requires = s.requires_mcps ?? [];
  const selected = (process.env.SELECTED_MCPS_STR || '').split(' ').filter(Boolean);
  const missing = requires.filter(r => !selected.includes(r));
  if (missing.length > 0) {
    process.stdout.write(`WARN:${missing.join(',')}`);
  }
} catch {}
EOF
  # Capture output and emit warning
  local result
  result=$(SKILL_JSON_PATH="$skill_json" \
  SELECTED_MCPS_STR="${SELECTED_MCPS[*]:-}" \
  node --input-type=module <<'EOF'
import { readFileSync } from 'fs';
try {
  const s = JSON.parse(readFileSync(process.env.SKILL_JSON_PATH, 'utf8'));
  const requires = s.requires_mcps ?? [];
  const selected = (process.env.SELECTED_MCPS_STR || '').split(' ').filter(Boolean);
  const missing = requires.filter(r => !selected.includes(r));
  if (missing.length > 0) process.stdout.write(missing.join(', '));
} catch {}
EOF
)
  if [ -n "$result" ]; then
    echo -e "  ${YELLOW:-}⚠${NC:-} ${skill_name} requires MCPs not installed in this session: ${result}"
    echo -e "    Run ${BOLD:-}./install.sh${NC:-} again and select the missing MCPs, or configure them manually."
  fi
}

# ──────────────────────────────────────────────────────────────────────────────
# transform_md_to_toml SRC_MD DEST_TOML
# Converts a Markdown file with YAML frontmatter to Codex TOML agent format.
# ──────────────────────────────────────────────────────────────────────────────
transform_md_to_toml() {
  local src="$1"
  local dest="$2"

  python3 - "$src" "$dest" <<'PYEOF'
import sys, re
src_path, dest_path = sys.argv[1], sys.argv[2]
try:
    text = open(src_path).read()
    m = re.match(r'^---\n(.*?)\n---\n(.*)', text, re.DOTALL)
    if not m:
        # No frontmatter — use filename as name and full content as instructions
        name = src_path.split('/')[-1].replace('.md','')
        body = text.strip()
        front = {}
    else:
        front = {}
        for line in m.group(1).splitlines():
            if ':' in line:
                k, _, v = line.partition(':')
                front[k.strip()] = v.strip().strip('"').strip("'")
        body = m.group(2).strip()

    name = front.get('name', src_path.split('/')[-1].replace('.md',''))
    desc = front.get('description', '')
    # Escape triple-quote sequences in body
    body = body.replace('"""', '\\"\\"\\"')
    toml = f'name = "{name}"\ndescription = "{desc}"\ndeveloper_instructions = """\n{body}\n"""\n'
    open(dest_path, 'w').write(toml)
    print(f"  transformed: {dest_path}")
except Exception as e:
    print(f"  WARNING: transform failed for {src_path}: {e}", file=sys.stderr)
PYEOF
}

# ──────────────────────────────────────────────────────────────────────────────
# install_skill SKILL_NAME IDE_ID
# Creates all necessary symlinks for one skill in one IDE.
# ──────────────────────────────────────────────────────────────────────────────
install_skill() {
  local skill_name="$1"
  local ide_id="$2"

  local skill_dir="${SCRIPT_DIR}/skills/${skill_name}"
  local skill_json="${skill_dir}/skill.json"

  if [ ! -f "$skill_json" ]; then
    echo -e "  ${RED:-}✗${NC:-} ${skill_name}: skill.json not found"
    return 1
  fi

  source_ide_descriptor "$ide_id" || return 1

  # Display source path (FR-017)
  echo -e "    ${BLUE:-}→${NC:-} Source: ${skill_dir}"

  # 1. Skill directory symlink (always, if IDE_SUPPORTS_SYMLINK=true and skills dir defined)
  if [ "${IDE_SUPPORTS_SYMLINK:-false}" = "true" ] && [ -n "${IDE_SKILLS_DIR:-}" ]; then
    mkdir -p "$IDE_SKILLS_DIR"
    ln -sfn "$skill_dir" "${IDE_SKILLS_DIR}/${skill_name}"
    echo -e "    ${GREEN:-}✓${NC:-} skill → ${IDE_SKILLS_DIR}/${skill_name}"
  fi

  # Read assets flags
  local has_agents has_commands has_hooks
  has_agents=$(node --input-type=module <<EOF
import { readFileSync } from 'fs';
try { const s = JSON.parse(readFileSync('${skill_json}','utf8')); process.stdout.write(s.assets?.agents ? 'true' : 'false'); } catch { process.stdout.write('false'); }
EOF
)
  has_commands=$(node --input-type=module <<EOF
import { readFileSync } from 'fs';
try { const s = JSON.parse(readFileSync('${skill_json}','utf8')); process.stdout.write(s.assets?.commands ? 'true' : 'false'); } catch { process.stdout.write('false'); }
EOF
)
  has_hooks=$(node --input-type=module <<EOF
import { readFileSync } from 'fs';
try { const s = JSON.parse(readFileSync('${skill_json}','utf8')); process.stdout.write(s.assets?.hooks ? 'true' : 'false'); } catch { process.stdout.write('false'); }
EOF
)

  # 2. Agents — symlink per file (or copy+transform for Codex)
  if [ "$has_agents" = "true" ] && [ -d "${skill_dir}/agents" ] && [ -n "${IDE_AGENTS_DIR:-}" ]; then
    mkdir -p "$IDE_AGENTS_DIR"
    if [ "${IDE_AGENT_FORMAT:-md}" = "toml" ]; then
      for f in "${skill_dir}/agents/"*.md; do
        [ -f "$f" ] || continue
        local basename
        basename=$(basename "$f" .md)
        transform_md_to_toml "$f" "${IDE_AGENTS_DIR}/${basename}.toml"
      done
    else
      for f in "${skill_dir}/agents/"*.md; do
        [ -f "$f" ] || continue
        local fname
        fname=$(basename "$f")
        ln -sfn "$f" "${IDE_AGENTS_DIR}/${fname}"
        echo -e "    ${GREEN:-}✓${NC:-} agent → ${IDE_AGENTS_DIR}/${fname}"
      done
    fi
  fi

  # 3. Commands — symlink per file (if IDE supports commands)
  if [ "$has_commands" = "true" ] && [ -d "${skill_dir}/commands" ] && \
     [ "${IDE_SUPPORTS_COMMANDS:-false}" = "true" ] && [ -n "${IDE_COMMANDS_DIR:-}" ]; then
    mkdir -p "$IDE_COMMANDS_DIR"
    for f in "${skill_dir}/commands/"*.md; do
      [ -f "$f" ] || continue
      local fname
      fname=$(basename "$f")
      ln -sfn "$f" "${IDE_COMMANDS_DIR}/${fname}"
      echo -e "    ${GREEN:-}✓${NC:-} command → ${IDE_COMMANDS_DIR}/${fname}"
    done
  fi

  # 4. Hooks — symlink per file + register (if IDE supports hooks)
  if [ "$has_hooks" = "true" ] && [ -d "${skill_dir}/hooks" ] && \
     [ "${IDE_SUPPORTS_HOOKS:-false}" = "true" ] && [ -n "${IDE_HOOKS_DIR:-}" ]; then
    mkdir -p "$IDE_HOOKS_DIR"
    for f in "${skill_dir}/hooks/"*.js; do
      [ -f "$f" ] || continue
      local fname
      fname=$(basename "$f")
      ln -sfn "$f" "${IDE_HOOKS_DIR}/${fname}"
      chmod +x "$f" 2>/dev/null || true
      echo -e "    ${GREEN:-}✓${NC:-} hook → ${IDE_HOOKS_DIR}/${fname}"

      # Register hooks in IDE's hook registry
      _register_hook_for_ide "$ide_id" "${IDE_HOOKS_DIR}/${fname}"
    done
  fi

  unset IDE_ID IDE_NAME IDE_DETECT_PATH IDE_GLOBAL_DIR \
        IDE_SKILLS_DIR IDE_AGENTS_DIR IDE_COMMANDS_DIR IDE_HOOKS_DIR \
        IDE_MCP_CONFIG IDE_MCP_FORMAT IDE_AGENT_FORMAT \
        IDE_SUPPORTS_SYMLINK IDE_SUPPORTS_HOOKS IDE_SUPPORTS_COMMANDS
}

# ──────────────────────────────────────────────────────────────────────────────
# _register_hook_for_ide IDE_ID HOOK_ABSOLUTE_PATH
# Registers a hook script in the IDE's event system.
# Infers event type from hook filename conventions.
# ──────────────────────────────────────────────────────────────────────────────
_register_hook_for_ide() {
  local ide_id="$1"
  local hook_path="$2"
  local fname
  fname=$(basename "$hook_path")

  # Infer event and matcher from hook filename
  local event="PostToolUse"
  local matcher=""

  case "$fname" in
    *audit-trail*|*learning-append*)   event="PostToolUse"; matcher="Write|Edit" ;;
    *drift-detector*)                   event="PostToolUse"; matcher="Read" ;;
    *evidence-guard*|*convergence*|*orchestration-complete*|*citation-verifier*)
                                        event="Stop" ;;
    *jira-guard*|*output-guard*)        event="PostToolUse"; matcher="" ;;
    *)                                  event="PostToolUse"; matcher="" ;;
  esac

  json_merge_hooks "$ide_id" "$event" "$matcher" "$hook_path"
}

# ──────────────────────────────────────────────────────────────────────────────
# unlink_skill SKILL_NAME IDE_ID
# Removes all symlinks and hook registrations for a skill in an IDE.
# ──────────────────────────────────────────────────────────────────────────────
unlink_skill() {
  local skill_name="$1"
  local ide_id="$2"

  local skill_dir="${SCRIPT_DIR}/skills/${skill_name}"
  source_ide_descriptor "$ide_id" || return 1

  # Remove skill directory symlink
  if [ -n "${IDE_SKILLS_DIR:-}" ]; then
    local link="${IDE_SKILLS_DIR}/${skill_name}"
    if [ -L "$link" ] || [ -d "$link" ]; then
      rm -rf "$link"
      echo -e "    ${GREEN:-}✓${NC:-} removed skill link: ${link}"
    fi
  fi

  # Remove per-file agent symlinks
  if [ -n "${IDE_AGENTS_DIR:-}" ] && [ -d "${skill_dir}/agents" ]; then
    for f in "${skill_dir}/agents/"*.md; do
      [ -f "$f" ] || continue
      local fname
      fname=$(basename "$f")
      local target_md="${IDE_AGENTS_DIR}/${fname}"
      local target_toml="${IDE_AGENTS_DIR}/$(basename "$f" .md).toml"
      [ -L "$target_md" ] || [ -f "$target_md" ] && rm -f "$target_md" && echo -e "    ${GREEN:-}✓${NC:-} removed agent: ${fname}"
      [ -f "$target_toml" ] && rm -f "$target_toml" && echo -e "    ${GREEN:-}✓${NC:-} removed agent: $(basename "$target_toml")"
    done
  fi

  # Remove per-file command symlinks
  if [ -n "${IDE_COMMANDS_DIR:-}" ] && [ -d "${skill_dir}/commands" ]; then
    for f in "${skill_dir}/commands/"*.md; do
      [ -f "$f" ] || continue
      local fname link
      fname=$(basename "$f")
      link="${IDE_COMMANDS_DIR}/${fname}"
      [ -L "$link" ] || [ -f "$link" ] && rm -f "$link" && echo -e "    ${GREEN:-}✓${NC:-} removed command: ${fname}"
    done
  fi

  # Remove per-file hook symlinks and deregister
  if [ -n "${IDE_HOOKS_DIR:-}" ] && [ -d "${skill_dir}/hooks" ]; then
    for f in "${skill_dir}/hooks/"*.js; do
      [ -f "$f" ] || continue
      local fname hook_path
      fname=$(basename "$f")
      hook_path="${IDE_HOOKS_DIR}/${fname}"
      if [ -L "$hook_path" ] || [ -f "$hook_path" ]; then
        json_remove_hooks "$ide_id" "$hook_path"
        rm -f "$hook_path"
        echo -e "    ${GREEN:-}✓${NC:-} removed hook: ${fname}"
      fi
    done
  fi

  unset IDE_ID IDE_NAME IDE_DETECT_PATH IDE_GLOBAL_DIR \
        IDE_SKILLS_DIR IDE_AGENTS_DIR IDE_COMMANDS_DIR IDE_HOOKS_DIR \
        IDE_MCP_CONFIG IDE_MCP_FORMAT IDE_AGENT_FORMAT \
        IDE_SUPPORTS_SYMLINK IDE_SUPPORTS_HOOKS IDE_SUPPORTS_COMMANDS
}

# ──────────────────────────────────────────────────────────────────────────────
# aggregate_skill_state SKILL_NAME
# Checks the link state of SKILL_NAME across all SELECTED_IDES.
# Returns a single worst-case state by priority:
#   broken > copied > absent (incl. mixed linked+absent) > linked
# ──────────────────────────────────────────────────────────────────────────────
aggregate_skill_state() {
  local skill_name="$1"
  local worst="linked"   # start optimistic; gets overridden immediately if absent anywhere
  local has_linked=0
  local has_absent=0

  for ide_id in "${SELECTED_IDES[@]}"; do
    source_ide_descriptor "$ide_id" 2>/dev/null || continue
    local skills_dir="${IDE_SKILLS_DIR:-}"
    unset IDE_ID IDE_NAME IDE_DETECT_PATH IDE_GLOBAL_DIR \
          IDE_SKILLS_DIR IDE_AGENTS_DIR IDE_COMMANDS_DIR IDE_HOOKS_DIR \
          IDE_MCP_CONFIG IDE_MCP_FORMAT IDE_AGENT_FORMAT \
          IDE_SUPPORTS_SYMLINK IDE_SUPPORTS_HOOKS IDE_SUPPORTS_COMMANDS

    local link_path=""
    [ -n "$skills_dir" ] && link_path="${skills_dir}/${skill_name}"
    local state="absent"
    [ -n "$link_path" ] && state=$(detect_link_state "$link_path")

    case "$state" in
      broken)
        echo "broken"
        return 0
        ;;
      copied)
        worst="copied"
        ;;
      absent)
        has_absent=1
        ;;
      linked)
        has_linked=1
        ;;
    esac
  done

  # copied wins over mixed/absent/linked
  [ "$worst" = "copied" ] && { echo "copied"; return 0; }

  # mixed (some linked, some absent) → treat as absent (Option B)
  if [ "$has_absent" -eq 1 ]; then
    echo "absent"
    return 0
  fi

  # pure absent
  [ "$has_linked" -eq 0 ] && { echo "absent"; return 0; }

  # all linked
  echo "linked"
}

# ──────────────────────────────────────────────────────────────────────────────
# prompt_skill_action STATE SKILL_NAME — outputs action to take
# One prompt per skill (not per IDE). State is the aggregated state.
# linked   → prompts skip/re-link/unlink
# broken   → warns + prompts re-link/unlink
# copied   → prompts upgrade/skip/remove
# absent   → returns "install" silently
# ──────────────────────────────────────────────────────────────────────────────
prompt_skill_action() {
  local state="$1"
  local skill_name="$2"

  if is_noninteractive; then
    case "$state" in
      absent)  echo "install" ;;
      linked)  echo "skip" ;;
      broken)  echo "relink" ;;
      copied)  echo "upgrade" ;;
    esac
    return 0
  fi

  case "$state" in
    linked)
      echo -e "  ${BLUE:-}•${NC:-} ${skill_name} — already linked in all IDEs"
      local action
      read -rp "    [skip/re-link/unlink] (skip): " action
      action="${action:-skip}"
      case "$(echo "$action" | tr '[:upper:]' '[:lower:]')" in
        re-link|relink) echo "relink" ;;
        unlink)         echo "unlink" ;;
        *)              echo "skip" ;;
      esac
      ;;
    broken)
      echo -e "  ${YELLOW:-}⚠${NC:-} ${skill_name} — broken link detected (source moved?)"
      local action
      read -rp "    [re-link/unlink] (re-link): " action
      action="${action:-re-link}"
      case "$(echo "$action" | tr '[:upper:]' '[:lower:]')" in
        unlink) echo "unlink" ;;
        *)      echo "relink" ;;
      esac
      ;;
    copied)
      echo -e "  ${YELLOW:-}•${NC:-} ${skill_name} — legacy file-copy install detected"
      local action
      read -rp "    [upgrade-to-link/skip/remove] (upgrade-to-link): " action
      action="${action:-upgrade-to-link}"
      case "$(echo "$action" | tr '[:upper:]' '[:lower:]')" in
        skip)   echo "skip" ;;
        remove) echo "unlink" ;;
        *)      echo "upgrade" ;;
      esac
      ;;
    absent)
      echo "install"
      ;;
  esac
}

# ──────────────────────────────────────────────────────────────────────────────
# setup_skills IA_FRAMEWORK_DIR
# Main entry point. Called from install.sh Step 5.2.
# User selects which skills once; each selected skill is installed to all
# selected IDEs automatically. One lifecycle prompt per skill, not per IDE.
# ──────────────────────────────────────────────────────────────────────────────
setup_skills() {
  local ia_dir="${1:-${SCRIPT_DIR:-$(pwd)}}"

  echo -e "${BOLD:-}Step 5.2: Install Skills${NC:-}"

  # Source shared helpers
  # shellcheck source=scripts/installer-helpers.sh
  source "${ia_dir}/scripts/installer-helpers.sh"

  # Detect and select IDEs
  detect_ides
  if [ "${#DETECTED_IDES[@]}" -eq 0 ]; then
    echo -e "  ${YELLOW:-}⚠${NC:-} No IDEs detected — skills installation skipped."
    return 0
  fi

  echo -e "  ${YELLOW:-}→${NC:-} Select which IDE(s) to install skills for:"
  prompt_ide_select

  if [ "${#SELECTED_IDES[@]}" -eq 0 ]; then
    echo -e "  ${YELLOW:-}⚠${NC:-} No IDEs selected — skipping skills installation."
    return 0
  fi

  # Scan and select skills
  scan_skills
  if [ "${#AVAILABLE_SKILLS[@]}" -eq 0 ]; then
    echo -e "  ${YELLOW:-}⚠${NC:-} No skills found in skills/ — skipping."
    return 0
  fi

  echo -e "  ${YELLOW:-}→${NC:-} Select skills to install:"
  prompt_skill_select

  if [ "${#SELECTED_SKILLS[@]}" -eq 0 ]; then
    echo -e "  ${YELLOW:-}⚠${NC:-} No skills selected."
    return 0
  fi

  # Build IDE display names for summary output
  local ide_display_names=()
  for ide_id in "${SELECTED_IDES[@]}"; do
    source_ide_descriptor "$ide_id" 2>/dev/null || true
    ide_display_names+=("${IDE_NAME:-$ide_id}")
    unset IDE_ID IDE_NAME IDE_DETECT_PATH IDE_GLOBAL_DIR \
          IDE_SKILLS_DIR IDE_AGENTS_DIR IDE_COMMANDS_DIR IDE_HOOKS_DIR \
          IDE_MCP_CONFIG IDE_MCP_FORMAT IDE_AGENT_FORMAT \
          IDE_SUPPORTS_SYMLINK IDE_SUPPORTS_HOOKS IDE_SUPPORTS_COMMANDS
  done
  local ides_label
  ides_label=$(IFS=', '; echo "${ide_display_names[*]}")

  echo ""

  # ── Per-skill loop ──────────────────────────────────────────────────────────
  for skill_name in "${SELECTED_SKILLS[@]}"; do

    # Check MCP dependencies (warn only, do not block)
    check_mcp_deps "$skill_name"

    # Aggregate state across all selected IDEs → one prompt per skill
    local state
    state=$(aggregate_skill_state "$skill_name")

    local action
    action=$(prompt_skill_action "$state" "$skill_name")

    # ── Silent inner loop: apply action to every selected IDE ────────────────
    local affected_ides=()
    for ide_id in "${SELECTED_IDES[@]}"; do
      source_ide_descriptor "$ide_id" 2>/dev/null || continue
      local ide_name="${IDE_NAME:-$ide_id}"
      unset IDE_ID IDE_NAME IDE_DETECT_PATH IDE_GLOBAL_DIR \
            IDE_SKILLS_DIR IDE_AGENTS_DIR IDE_COMMANDS_DIR IDE_HOOKS_DIR \
            IDE_MCP_CONFIG IDE_MCP_FORMAT IDE_AGENT_FORMAT \
            IDE_SUPPORTS_SYMLINK IDE_SUPPORTS_HOOKS IDE_SUPPORTS_COMMANDS

      case "$action" in
        install)
          install_skill "$skill_name" "$ide_id" 2>/dev/null
          affected_ides+=("$ide_name")
          ;;
        relink|upgrade)
          unlink_skill "$skill_name" "$ide_id" 2>/dev/null
          install_skill "$skill_name" "$ide_id" 2>/dev/null
          affected_ides+=("$ide_name")
          ;;
        unlink)
          unlink_skill "$skill_name" "$ide_id" 2>/dev/null
          affected_ides+=("$ide_name")
          ;;
        skip)
          : # nothing to do
          ;;
      esac
    done

    # ── Summary line ─────────────────────────────────────────────────────────
    local affected_label
    affected_label=$(IFS=', '; echo "${affected_ides[*]:-}")

    case "$action" in
      install)
        echo -e "  ${GREEN:-}✓${NC:-} ${skill_name} → ${BOLD:-}${ia_dir}/skills/${skill_name}${NC:-}"
        [ -n "$affected_label" ] && echo -e "    installed to: ${affected_label}"
        ;;
      relink|upgrade)
        [ -n "$affected_label" ] && echo -e "  ${GREEN:-}✓${NC:-} ${skill_name} re-linked in: ${affected_label}"
        ;;
      unlink)
        [ -n "$affected_label" ] && echo -e "  ${GREEN:-}✓${NC:-} ${skill_name} unlinked from: ${affected_label}"
        ;;
      skip)
        echo -e "  ${BLUE:-}→${NC:-} ${skill_name} skipped"
        ;;
    esac
    echo ""
  done

  echo -e "  ${GREEN:-}✓${NC:-} Skills done. Updates to ${BOLD:-}${ia_dir}/skills/${NC:-} propagate immediately to all linked IDEs."
}
