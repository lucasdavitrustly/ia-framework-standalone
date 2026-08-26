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
# OFFICIAL_SKILLS — allowlist
#
# The single source of truth for which skills may be distributed. A directory
# in skills/ is not offered by scan_skills() unless its skill.json .name field
# appears here. Adding a skill is a deliberate two-place edit (this array).
# ──────────────────────────────────────────────────────────────────────────────
OFFICIAL_SKILLS=("mcp-bench")

# ──────────────────────────────────────────────────────────────────────────────
# Legacy-skill migration registry
#
# When a skill is renamed, the installer/uninstaller can no longer see the old
# name (both derive names by scanning the CURRENT skills/*/skill.json). Old
# symlinks and old hook registrations would therefore leak on machines that were
# installed before the rename. migrate_legacy_skills() cleans them up.
#
# LEGACY_SKILL_RENAMES:  "old-name=new-name" (one per element)
# LEGACY_SKILL_BASENAMES_<old>:  space-separated old asset basenames whose stale
#   links / hook registrations must be removed. Because the renamed repo no
#   longer contains these files, the list is hard-coded here as the permanent
#   migration record. Hook basenames matter most: json_remove_hooks() matches by
#   exact command path, so we must feed it the OLD path to deregister it.
# ──────────────────────────────────────────────────────────────────────────────
LEGACY_SKILL_RENAMES=(
  "tab-refuter=refuter"
  "tab-ticket-reader=jira-feed"
)

# Old per-file asset basenames (agents/commands/hooks) for each legacy skill.
_legacy_assets_for() {
  case "$1" in
    tab-refuter)
      echo "agents/tab-refuter-analyst.md agents/tab-refuter-orchestrator.md agents/tab-refuter-report-writer.md \
commands/tab-refuter.md \
hooks/tab-refuter-audit-trail.js hooks/tab-refuter-citation-verifier.js hooks/tab-refuter-convergence.js \
hooks/tab-refuter-drift-detector.js hooks/tab-refuter-evidence-guard.js hooks/tab-refuter-learning-append.js \
hooks/tab-refuter-orchestration-complete.js"
      ;;
    tab-ticket-reader)
      echo "agents/tab-spec-formatter.md \
commands/tab-format-spec.md \
hooks/tab-spec-formatter-jira-guard.js hooks/tab-spec-formatter-output-guard.js"
      ;;
    *) echo "" ;;
  esac
}

# ──────────────────────────────────────────────────────────────────────────────
# Deprecated-skill registry
#
# DEPRECATED_SKILLS: names of skills no longer distributed (removed from
# skills/), whose traces must still be purged from every IDE that installed
# them. _deprecated_assets_for returns the HISTORY-DERIVED union of every
# agents/commands/hooks basename that skill ever shipped (git log --all
# --diff-filter=A), NOT the current tree — the source directories are deleted,
# so a glob would find nothing. Pure: no filesystem access, no node.
# ──────────────────────────────────────────────────────────────────────────────
DEPRECATED_SKILLS=("grill-with-docs" "jira-feed" "refuter" "tlc-spec-driven")

_deprecated_assets_for() {
  case "$1" in
    grill-with-docs)
      echo ""
      ;;
    jira-feed)
      echo "agents/jira-feed-formatter.md \
commands/jira-feed.md \
hooks/jira-feed-jira-guard.js hooks/jira-feed-output-guard.js"
      ;;
    refuter)
      echo "agents/refuter-analyst.md agents/refuter-orchestrator.md agents/refuter-report-writer.md \
commands/refuter.md \
hooks/refuter-audit-trail.js hooks/refuter-citation-verifier.js hooks/refuter-convergence.js \
hooks/refuter-drift-detector.js hooks/refuter-evidence-guard.js hooks/refuter-learning-append.js \
hooks/refuter-orchestration-complete.js"
      ;;
    tlc-spec-driven)
      echo "agents/tlc-specify-runner.md \
commands/delivery.md commands/start-work-on.md commands/tlc-design.md commands/tlc-discuss.md \
commands/tlc-execute.md commands/tlc-map-codebase.md commands/tlc-project-init.md commands/tlc-quick.md \
commands/tlc-roadmap.md commands/tlc-session.md commands/tlc-specify.md commands/tlc-state.md \
commands/tlc-tasks.md"
      ;;
    *) echo "" ;;
  esac
}

# ──────────────────────────────────────────────────────────────────────────────
# _registry_has_deprecated_entry IDE_ID PATH…
# Read-only probe: does IDE_ID's hook registry contain any of the given
# absolute command paths? Exit 0 = trace found, 1 = none. Never writes —
# unlike json_remove_hooks, which unconditionally re-stringifies the file even
# on a no-op match. Missing/malformed registry reads as "no trace" (exit 1),
# never aborts.
# ──────────────────────────────────────────────────────────────────────────────
_registry_has_deprecated_entry() {
  local ide_id="$1"
  shift
  local paths=("$@")

  local settings_file=""
  case "$ide_id" in
    claude-code) settings_file="${HOME}/.claude/settings.json" ;;
    codex)       settings_file="${HOME}/.codex/hooks.json" ;;
    *)           return 1 ;;
  esac

  [ -f "$settings_file" ] || return 1

  local paths_str
  paths_str="$(printf '%s\n' "${paths[@]}")"

  REGISTRY_PROBE_FILE="$settings_file" \
  REGISTRY_PROBE_PATHS="$paths_str" \
  node --input-type=module <<'EOF'
import { readFileSync } from 'fs';
const f = process.env.REGISTRY_PROBE_FILE;
const wanted = new Set(process.env.REGISTRY_PROBE_PATHS.split('\n').filter(Boolean));
try {
  const cfg = JSON.parse(readFileSync(f, 'utf8'));
  const hooks = cfg.hooks ?? {};
  for (const event of Object.keys(hooks)) {
    for (const group of hooks[event] ?? []) {
      for (const h of group.hooks ?? []) {
        if (wanted.has(h.command)) process.exit(0);
      }
    }
  }
  process.exit(1);
} catch {
  process.exit(1);
}
EOF
}

# ──────────────────────────────────────────────────────────────────────────────
# _deprecated_trace_in NAME IDE_ID
# Read-only per-(skill, IDE) detector. Exit 0 = trace found, 1 = none; sets
# global TRACE_STATE in {linked|broken|copied|files|registry}. Detection order:
#   1. Skill-directory symlink state via detect_link_state (skipped when
#      IDE_SKILLS_DIR is empty, e.g. vscode-copilot). A copied directory
#      dominates — it alone drives the non-interactive CI carve-out.
#   2. Any manifest asset present (-L or -e) in agents/commands/hooks dirs,
#      including the .toml agent twin -> "files".
#   3. claude-code/codex only: a registry-only orphan (link already gone, hook
#      registration survives) -> "registry".
# Writes nothing on any path.
# ──────────────────────────────────────────────────────────────────────────────
_deprecated_trace_in() {
  local name="$1"
  local ide_id="$2"
  TRACE_STATE=""

  source_ide_descriptor "$ide_id" 2>/dev/null || return 1
  local skills_dir="${IDE_SKILLS_DIR:-}"
  local agents_dir="${IDE_AGENTS_DIR:-}"
  local commands_dir="${IDE_COMMANDS_DIR:-}"
  local hooks_dir="${IDE_HOOKS_DIR:-}"
  unset IDE_ID IDE_NAME IDE_DETECT_PATH IDE_GLOBAL_DIR \
        IDE_SKILLS_DIR IDE_AGENTS_DIR IDE_COMMANDS_DIR IDE_HOOKS_DIR \
        IDE_MCP_CONFIG IDE_MCP_FORMAT IDE_AGENT_FORMAT \
        IDE_SUPPORTS_SYMLINK IDE_SUPPORTS_HOOKS IDE_SUPPORTS_COMMANDS

  local assets
  assets="$(_deprecated_assets_for "$name")"

  # 1. Skill-directory symlink state.
  if [ -n "$skills_dir" ]; then
    local dir_state
    dir_state=$(detect_link_state "${skills_dir}/${name}")
    case "$dir_state" in
      copied|linked|broken)
        TRACE_STATE="$dir_state"
        return 0
        ;;
    esac
  fi

  # 2. Per-file manifest assets (agents .md + .toml twin, commands, hooks).
  local rel base target toml_target
  for rel in $assets; do
    base="$(basename "$rel")"
    case "$rel" in
      agents/*)
        [ -n "$agents_dir" ] || continue
        target="${agents_dir}/${base}"
        toml_target="${agents_dir}/$(basename "$base" .md).toml"
        if [ -L "$target" ] || [ -e "$target" ] || [ -e "$toml_target" ]; then
          TRACE_STATE="files"
          return 0
        fi
        ;;
      commands/*)
        [ -n "$commands_dir" ] || continue
        target="${commands_dir}/${base}"
        if [ -L "$target" ] || [ -e "$target" ]; then
          TRACE_STATE="files"
          return 0
        fi
        ;;
      hooks/*)
        [ -n "$hooks_dir" ] || continue
        target="${hooks_dir}/${base}"
        if [ -L "$target" ] || [ -e "$target" ]; then
          TRACE_STATE="files"
          return 0
        fi
        ;;
    esac
  done

  # 3. Registry-only orphan: link already gone, registration may remain.
  case "$ide_id" in
    claude-code|codex)
      local hook_paths=()
      for rel in $assets; do
        case "$rel" in
          hooks/*)
            [ -n "$hooks_dir" ] || continue
            hook_paths+=("${hooks_dir}/$(basename "$rel")")
            ;;
        esac
      done
      if [ "${#hook_paths[@]}" -gt 0 ] && _registry_has_deprecated_entry "$ide_id" "${hook_paths[@]}"; then
        TRACE_STATE="registry"
        return 0
      fi
      ;;
  esac

  return 1
}

# ──────────────────────────────────────────────────────────────────────────────
# _remove_deprecated_from NAME IDE_ID
# The only mutator: deletes one skill's every trace from one IDE. Always
# returns 0; sets RM_LINKS (int, files/symlinks actually removed), RM_HOOKS
# (int, manifest hook basenames processed through json_remove_hooks), RM_NAMES
# (space-separated removed basenames, for the summary line).
#
# Removal order (a requirement, not an implementation detail):
#   skill-dir symlink -> agents (.md + .toml twin) -> hooks (json_remove_hooks
#   THEN rm -f, called even when the link is already absent so an orphaned
#   registry entry is purged) -> commands.
#
# Writes only under the four IDE_*_DIR of the seven known descriptors, and
# only for basenames the closed manifest names (DEPR-N04) — no
# developer-supplied path ever reaches rm. Uses the braced
# { [ -L ] || [ -e ]; } && rm form throughout (DEPR-N03, style per D-3).
# ──────────────────────────────────────────────────────────────────────────────
_remove_deprecated_from() {
  local name="$1"
  local ide_id="$2"
  RM_LINKS=0
  RM_HOOKS=0
  RM_NAMES=""

  source_ide_descriptor "$ide_id" 2>/dev/null || return 0
  local skills_dir="${IDE_SKILLS_DIR:-}"
  local agents_dir="${IDE_AGENTS_DIR:-}"
  local commands_dir="${IDE_COMMANDS_DIR:-}"
  local hooks_dir="${IDE_HOOKS_DIR:-}"
  unset IDE_ID IDE_NAME IDE_DETECT_PATH IDE_GLOBAL_DIR \
        IDE_SKILLS_DIR IDE_AGENTS_DIR IDE_COMMANDS_DIR IDE_HOOKS_DIR \
        IDE_MCP_CONFIG IDE_MCP_FORMAT IDE_AGENT_FORMAT \
        IDE_SUPPORTS_SYMLINK IDE_SUPPORTS_HOOKS IDE_SUPPORTS_COMMANDS

  local assets
  assets="$(_deprecated_assets_for "$name")"

  # 1. Skill-directory symlink.
  if [ -n "$skills_dir" ]; then
    local link="${skills_dir}/${name}"
    { [ -L "$link" ] || [ -e "$link" ]; } && rm -rf "$link" && RM_LINKS=$((RM_LINKS + 1))
  fi

  local rel base target toml_target

  # 2. Agents: .md link + .toml twin (codex installs a real transformed copy,
  #    not a symlink — [ -e ] covers it).
  if [ -n "$agents_dir" ]; then
    for rel in $assets; do
      case "$rel" in
        agents/*)
          base="$(basename "$rel")"
          target="${agents_dir}/${base}"
          toml_target="${agents_dir}/$(basename "$base" .md).toml"
          { [ -L "$target" ] || [ -e "$target" ]; } && rm -f "$target" \
            && RM_LINKS=$((RM_LINKS + 1)) && RM_NAMES="${RM_NAMES}${base} "
          { [ -L "$toml_target" ] || [ -e "$toml_target" ]; } && rm -f "$toml_target" \
            && RM_LINKS=$((RM_LINKS + 1)) && RM_NAMES="${RM_NAMES}$(basename "$toml_target") "
          ;;
      esac
    done
  fi

  # 3. Hooks: deregister (json_remove_hooks) THEN unlink. Deregistration runs
  #    even when the link file is already absent, purging the orphan (the
  #    live claude-code case).
  if [ -n "$hooks_dir" ]; then
    for rel in $assets; do
      case "$rel" in
        hooks/*)
          base="$(basename "$rel")"
          target="${hooks_dir}/${base}"
          json_remove_hooks "$ide_id" "$target"
          RM_HOOKS=$((RM_HOOKS + 1))
          RM_NAMES="${RM_NAMES}${base} "
          { [ -L "$target" ] || [ -e "$target" ]; } && rm -f "$target" \
            && RM_LINKS=$((RM_LINKS + 1))
          ;;
      esac
    done
  fi

  # 4. Commands.
  if [ -n "$commands_dir" ]; then
    for rel in $assets; do
      case "$rel" in
        commands/*)
          base="$(basename "$rel")"
          target="${commands_dir}/${base}"
          { [ -L "$target" ] || [ -e "$target" ]; } && rm -f "$target" \
            && RM_LINKS=$((RM_LINKS + 1)) && RM_NAMES="${RM_NAMES}${base} "
          ;;
      esac
    done
  fi

  RM_NAMES="${RM_NAMES% }"
  return 0
}

# ──────────────────────────────────────────────────────────────────────────────
# _prompt_deprecated_removal NAME STATE IDE_NAMES_LABEL [COPIED_PATH]
# One consent decision per deprecated skill, covering every affected IDE at
# once. Stdout is exactly "remove" or "keep"; every word of prose goes to
# stderr (read -rp's own bracket text is never asserted — it is invisible
# under non-TTY stdin, per D-4).
#
# Non-interactive (is_noninteractive): no prompt. "remove" for
# linked|broken|files|registry. "keep" + a stderr warning for "copied" — the
# one state never auto-removed unattended (A-01 CI carve-out).
#
# Interactive: a single stderr line carries the skill name, the word
# "deprecated" and every affected IDE_NAME — the entire asserted payload.
# "copied" adds a second stderr line naming COPIED_PATH, that it is a real
# directory (not a link), and that removal is permanent because the content
# is not in this repo's git history. An empty answer defaults to "remove"
# uniformly, including "copied" (CONTEXT.md overrides spec P1-3 AC 8 / A-08 —
# protection lives in the prompt wording, not the default). Declining prints
# a warning naming both causes (source gone from the repo; re-offered next
# run) and persists nothing to disk.
# ──────────────────────────────────────────────────────────────────────────────
_prompt_deprecated_removal() {
  local name="$1"
  local state="$2"
  local ide_names_label="$3"
  local copied_path="${4:-}"

  if is_noninteractive; then
    if [ "$state" = "copied" ]; then
      echo -e "  ${YELLOW:-}⚠${NC:-} ${name} kept — ${copied_path} is a real directory, not a link, and is not removed automatically in non-interactive mode." >&2
      echo "keep"
    else
      echo "remove"
    fi
    return 0
  fi

  echo -e "  ${WHITE:-}•${NC:-} ${name} — deprecated, found in ${ide_names_label}" >&2
  if [ "$state" = "copied" ]; then
    echo -e "    ${copied_path} is a real directory, not a link — removal is permanent because this content is not in this repo's git history." >&2
  fi

  local answer
  read -rp "  [remove/keep] (remove): " answer
  answer="${answer:-remove}"

  case "$(echo "$answer" | tr '[:upper:]' '[:lower:]')" in
    keep)
      echo -e "  ${YELLOW:-}⚠${NC:-} ${name} kept — its source no longer exists in the repo, so its links are dead; it will be offered for removal again on the next run." >&2
      echo "keep"
      ;;
    *)
      echo "remove"
      ;;
  esac
}

# ──────────────────────────────────────────────────────────────────────────────
# migrate_legacy_skills
# Idempotently removes stale links and hook registrations left by pre-rename
# installs, for every IDE in SELECTED_IDES. Safe to run on a clean tree.
# Prints a one-line report per migrated skill. Always returns 0.
# ──────────────────────────────────────────────────────────────────────────────
migrate_legacy_skills() {
  { [ "${SELECTED_IDES+set}" = set ] && [ "${#SELECTED_IDES[@]}" -gt 0 ]; } || return 0

  local pair old new ide_id
  for pair in "${LEGACY_SKILL_RENAMES[@]}"; do
    old="${pair%%=*}"
    new="${pair##*=}"

    local assets
    assets="$(_legacy_assets_for "$old")"

    for ide_id in "${SELECTED_IDES[@]}"; do
      source_ide_descriptor "$ide_id" 2>/dev/null || continue
      local ide_name="${IDE_NAME:-$ide_id}"
      local skills_dir="${IDE_SKILLS_DIR:-}"
      local agents_dir="${IDE_AGENTS_DIR:-}"
      local commands_dir="${IDE_COMMANDS_DIR:-}"
      local hooks_dir="${IDE_HOOKS_DIR:-}"
      unset IDE_ID IDE_NAME IDE_DETECT_PATH IDE_GLOBAL_DIR \
            IDE_SKILLS_DIR IDE_AGENTS_DIR IDE_COMMANDS_DIR IDE_HOOKS_DIR \
            IDE_MCP_CONFIG IDE_MCP_FORMAT IDE_AGENT_FORMAT \
            IDE_SUPPORTS_SYMLINK IDE_SUPPORTS_HOOKS IDE_SUPPORTS_COMMANDS

      local removed_links=0 removed_hooks=0

      # 1. Skill directory symlink (linked, broken, or copied)
      if [ -n "$skills_dir" ]; then
        local link="${skills_dir}/${old}"
        if [ -L "$link" ] || [ -e "$link" ]; then
          rm -rf "$link" && removed_links=$((removed_links + 1))
        fi
      fi

      # 2. Stale per-file agent/command/hook links (+ deregister hooks)
      local rel base target toml_target
      for rel in $assets; do
        base="$(basename "$rel")"
        case "$rel" in
          agents/*)
            [ -n "$agents_dir" ] || continue
            target="${agents_dir}/${base}"
            toml_target="${agents_dir}/$(basename "$base" .md).toml"
            { [ -L "$target" ] || [ -e "$target" ]; } && rm -f "$target" && removed_links=$((removed_links + 1))
            [ -e "$toml_target" ] && rm -f "$toml_target" && removed_links=$((removed_links + 1))
            ;;
          commands/*)
            [ -n "$commands_dir" ] || continue
            target="${commands_dir}/${base}"
            { [ -L "$target" ] || [ -e "$target" ]; } && rm -f "$target" && removed_links=$((removed_links + 1))
            ;;
          hooks/*)
            [ -n "$hooks_dir" ] || continue
            target="${hooks_dir}/${base}"
            # Deregister by OLD command path (no-op if not present in registry).
            if [ -L "$target" ] || [ -e "$target" ]; then
              json_remove_hooks "$ide_id" "$target"
              rm -f "$target"
              removed_links=$((removed_links + 1))
              removed_hooks=$((removed_hooks + 1))
            else
              # Link already gone but a stale registration may remain.
              json_remove_hooks "$ide_id" "$target"
            fi
            ;;
        esac
      done

      if [ "$removed_links" -gt 0 ] || [ "$removed_hooks" -gt 0 ]; then
        echo -e "  ${BLUE:-}↻${NC:-} migrated ${old} → ${new} in ${ide_name} (removed ${removed_links} stale link(s), ${removed_hooks} hook registration(s))"
      fi
    done
  done
  return 0
}

# ──────────────────────────────────────────────────────────────────────────────
# remove_deprecated_skills
# The single public entry point for purging every trace of the four
# DEPRECATED_SKILLS from every DETECTED IDE (never SELECTED_IDES — DEPR-06 /
# P1-4 AC 2). No args. Always returns 0.
#
# Three passes per skill:
#   1. detect (read-only) — _deprecated_trace_in for every DETECTED_IDE
#   2. exactly one prompt — naming every affected IDE_NAME at once; a "copied"
#      trace on any affected IDE dominates the state passed to the prompt,
#      since it alone drives the non-interactive CI carve-out (A-01)
#   3. apply — _remove_deprecated_from per affected IDE, iff the decision was
#      "remove"
#
# No trace anywhere for a skill means no prompt and no output whatsoever
# (P1-3 AC 7, P1-4 AC 6). Exactly one summary line per changed (skill, IDE)
# pair, carrying counts and removed basenames; nothing printed for an
# unchanged pair.
#
# Deliberately does NOT reuse aggregate_skill_state(): that function scans
# SELECTED_IDES for the regular mcp-bench install lifecycle (correctly
# scoped to the IDEs chosen for this run). Deprecated-skill cleanup has the
# opposite scope requirement — DEV-306771 requires it to run against every
# DETECTED_IDES entry regardless of selection — so its DETECTED_IDES-wide
# aggregation (Pass 1 below) is implemented inline rather than through a
# same-named function whose contract is pinned to SELECTED_IDES.
# ──────────────────────────────────────────────────────────────────────────────
remove_deprecated_skills() {
  { [ "${DETECTED_IDES+set}" = set ] && [ "${#DETECTED_IDES[@]}" -gt 0 ]; } || return 0

  local name
  for name in "${DEPRECATED_SKILLS[@]}"; do

    # ── Pass 1: detect (read-only) across every detected IDE ────────────────
    local affected_ide_ids=() affected_ide_names=()
    local overall_state="" copied_path=""
    local ide_id
    for ide_id in "${DETECTED_IDES[@]}"; do
      _deprecated_trace_in "$name" "$ide_id" || continue
      local trace_state="$TRACE_STATE"

      source_ide_descriptor "$ide_id" 2>/dev/null || continue
      local ide_name="${IDE_NAME:-$ide_id}"
      local skills_dir="${IDE_SKILLS_DIR:-}"
      unset IDE_ID IDE_NAME IDE_DETECT_PATH IDE_GLOBAL_DIR \
            IDE_SKILLS_DIR IDE_AGENTS_DIR IDE_COMMANDS_DIR IDE_HOOKS_DIR \
            IDE_MCP_CONFIG IDE_MCP_FORMAT IDE_AGENT_FORMAT \
            IDE_SUPPORTS_SYMLINK IDE_SUPPORTS_HOOKS IDE_SUPPORTS_COMMANDS

      affected_ide_ids+=("$ide_id")
      affected_ide_names+=("$ide_name")

      if [ "$trace_state" = "copied" ]; then
        overall_state="copied"
        [ -n "$skills_dir" ] && copied_path="${skills_dir}/${name}"
      elif [ "$overall_state" != "copied" ]; then
        overall_state="$trace_state"
      fi
    done

    [ "${#affected_ide_ids[@]}" -eq 0 ] && continue

    # ── Pass 2: exactly one prompt for this skill ────────────────────────────
    local ide_names_label
    ide_names_label=$(IFS=', '; echo "${affected_ide_names[*]}")

    local decision
    decision=$(_prompt_deprecated_removal "$name" "$overall_state" "$ide_names_label" "$copied_path")

    [ "$decision" = "remove" ] || continue

    # ── Pass 3: apply per affected IDE ───────────────────────────────────────
    local i
    for i in "${!affected_ide_ids[@]}"; do
      ide_id="${affected_ide_ids[$i]}"
      local ide_name="${affected_ide_names[$i]}"

      _remove_deprecated_from "$name" "$ide_id"

      if [ "$RM_LINKS" -gt 0 ] || [ "$RM_HOOKS" -gt 0 ]; then
        if [ -n "$RM_NAMES" ]; then
          echo -e "  ${GREEN:-}✓${NC:-} removed ${name} from ${ide_name} (${RM_LINKS} link(s), ${RM_HOOKS} hook registration(s): ${RM_NAMES})"
        else
          echo -e "  ${GREEN:-}✓${NC:-} removed ${name} from ${ide_name} (${RM_LINKS} link(s), ${RM_HOOKS} hook registration(s))"
        fi
      fi
    done
  done

  return 0
}

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
    [ -n "$name" ] && [[ " ${OFFICIAL_SKILLS[*]} " == *" $name "* ]] && AVAILABLE_SKILLS+=("$name")
  done
  return 0
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
# skill_expected_asset_links_present SKILL_NAME
# For every SELECTED_IDE, checks that each asset the skill declares in
# skill.json (commands/agents/hooks) AND the IDE supports has a corresponding
# link present in the IDE's asset directory.
#
# Returns 0 if all expected asset links are present (or none are expected),
# 1 if at least one expected asset link is missing. This lets a skill that was
# installed BEFORE it declared a new asset class (e.g. commands added later) be
# detected as needing a re-link instead of being treated as fully "linked".
#
# Note: only reports missing links for IDEs that actually support the asset
# (e.g. command-less IDEs never expect command links), so graceful degradation
# is preserved — such IDEs never trigger an "incomplete" state.
# ──────────────────────────────────────────────────────────────────────────────
skill_expected_asset_links_present() {
  local skill_name="$1"
  local skill_dir="${SCRIPT_DIR}/skills/${skill_name}"
  local skill_json="${skill_dir}/skill.json"

  [ -f "$skill_json" ] || return 0

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

  local missing=0  # count of missing expected asset links
  local ide_id
  for ide_id in "${SELECTED_IDES[@]}"; do
    source_ide_descriptor "$ide_id" 2>/dev/null || continue
    local cmd_dir="${IDE_COMMANDS_DIR:-}" agt_dir="${IDE_AGENTS_DIR:-}" hk_dir="${IDE_HOOKS_DIR:-}"
    local supports_commands="${IDE_SUPPORTS_COMMANDS:-false}"
    local supports_hooks="${IDE_SUPPORTS_HOOKS:-false}"
    unset IDE_ID IDE_NAME IDE_DETECT_PATH IDE_GLOBAL_DIR \
          IDE_SKILLS_DIR IDE_AGENTS_DIR IDE_COMMANDS_DIR IDE_HOOKS_DIR \
          IDE_MCP_CONFIG IDE_MCP_FORMAT IDE_AGENT_FORMAT \
          IDE_SUPPORTS_SYMLINK IDE_SUPPORTS_HOOKS IDE_SUPPORTS_COMMANDS

    # Commands: only expected where the IDE supports commands and a dir is set.
    if [ "$has_commands" = "true" ] && [ -d "${skill_dir}/commands" ] && \
       [ "$supports_commands" = "true" ] && [ -n "$cmd_dir" ]; then
      local f fname
      for f in "${skill_dir}/commands/"*.md; do
        [ -f "$f" ] || continue
        fname=$(basename "$f")
        [ -e "${cmd_dir}/${fname}" ] || missing=$((missing + 1))
      done
    fi

    # Agents: expected wherever an agents dir is defined (md or transformed toml).
    if [ "$has_agents" = "true" ] && [ -d "${skill_dir}/agents" ] && [ -n "$agt_dir" ]; then
      local f fname base
      for f in "${skill_dir}/agents/"*.md; do
        [ -f "$f" ] || continue
        fname=$(basename "$f")
        base=$(basename "$f" .md)
        # present if either the .md link or a transformed .toml exists
        if [ ! -e "${agt_dir}/${fname}" ] && [ ! -e "${agt_dir}/${base}.toml" ]; then
          missing=$((missing + 1))
        fi
      done
    fi

    # Hooks: only expected where the IDE supports hooks and a dir is set.
    if [ "$has_hooks" = "true" ] && [ -d "${skill_dir}/hooks" ] && \
       [ "$supports_hooks" = "true" ] && [ -n "$hk_dir" ]; then
      local f fname
      for f in "${skill_dir}/hooks/"*.js; do
        [ -f "$f" ] || continue
        fname=$(basename "$f")
        [ -e "${hk_dir}/${fname}" ] || missing=$((missing + 1))
      done
    fi
  done

  [ "$missing" -eq 0 ]
}

# ──────────────────────────────────────────────────────────────────────────────
# aggregate_skill_state SKILL_NAME
# Checks the link state of SKILL_NAME across all SELECTED_IDES.
# Returns a single worst-case state by priority:
#   broken > copied > absent (incl. mixed linked+absent) > incomplete > linked
#
# "incomplete" = the skill dir is linked everywhere, but the skill declares an
# asset (commands/agents/hooks) whose expected links are missing (e.g. a skill
# that gained commands after it was first installed). This routes the skill to
# a re-link so a plain re-run of install.sh auto-heals it.
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

  # all linked — but check whether declared assets (commands/agents/hooks) are
  # fully linked. If not, the skill needs a re-link to pick up new assets.
  if ! skill_expected_asset_links_present "$skill_name"; then
    echo "incomplete"
    return 0
  fi

  # all linked and complete
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
      absent)     echo "install" ;;
      linked)     echo "skip" ;;
      incomplete) echo "relink" ;;
      broken)     echo "relink" ;;
      copied)     echo "upgrade" ;;
    esac
    return 0
  fi

  case "$state" in
    linked)
      echo -e "  ${WHITE:-}•${NC:-} ${skill_name} — already linked in all IDEs" >&2
      local action
      read -rp "    [skip/re-link/unlink] (skip): " action
      action="${action:-skip}"
      case "$(echo "$action" | tr '[:upper:]' '[:lower:]')" in
        re-link|relink) echo "relink" ;;
        unlink)         echo "unlink" ;;
        *)              echo "skip" ;;
      esac
      ;;
    incomplete)
      echo -e "  ${YELLOW:-}•${NC:-} ${skill_name} — linked, but new assets (commands/agents/hooks) are not yet linked" >&2
      local action
      read -rp "    [re-link/skip/unlink] (re-link): " action
      action="${action:-re-link}"
      case "$(echo "$action" | tr '[:upper:]' '[:lower:]')" in
        skip)   echo "skip" ;;
        unlink) echo "unlink" ;;
        *)      echo "relink" ;;
      esac
      ;;
    broken)
      echo -e "  ${YELLOW:-}⚠${NC:-} ${skill_name} — broken link detected (source moved?)" >&2
      local action
      read -rp "    [re-link/unlink] (re-link): " action
      action="${action:-re-link}"
      case "$(echo "$action" | tr '[:upper:]' '[:lower:]')" in
        unlink) echo "unlink" ;;
        *)      echo "relink" ;;
      esac
      ;;
    copied)
      echo -e "  ${YELLOW:-}•${NC:-} ${skill_name} — legacy file-copy install detected" >&2
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

  # Purge deprecated skills from every detected IDE, reached even when the
  # developer selects no IDE for this run (DEPR-12 / P1-4 AC 1).
  remove_deprecated_skills

  echo -e "  ${YELLOW:-}→${NC:-} Select which IDE(s) to install skills for:"
  prompt_ide_select

  if [ "${#SELECTED_IDES[@]}" -eq 0 ]; then
    echo -e "  ${YELLOW:-}⚠${NC:-} No IDEs selected — skipping skills installation."
    return 0
  fi

  # Migrate any pre-rename installs (removes stale links + hook registrations)
  # for the selected IDEs before scanning/installing the current skill set.
  migrate_legacy_skills

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
