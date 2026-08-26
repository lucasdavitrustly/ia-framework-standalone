#!/usr/bin/env bash
# Tests for deprecated-skill removal in install-skills.sh:
#   - OFFICIAL_SKILLS allowlist gates scan_skills() (T2)
#   - DEPRECATED_SKILLS + _deprecated_assets_for manifest (T3)
#   - _registry_has_deprecated_entry read-only registry probe (T4)
#   - _deprecated_trace_in detection (T5)
#   - _remove_deprecated_from mutator (T6)
#   - _prompt_deprecated_removal consent (T7)
#   - remove_deprecated_skills orchestrator (T8)
#   - setup_skills wiring (T9)
#
# Isolated: fake SCRIPT_DIR/skills fixture + a temp HOME so real IDE
# descriptors resolve into throwaway dirs.

set -u

REPO_ROOT=$(CDPATH="" cd "$(dirname "$0")/../.." && pwd)
LIB="${REPO_ROOT}/scripts/install-skills.sh"
HELPERS="${REPO_ROOT}/scripts/installer-helpers.sh"

PASS=0; FAIL=0
pass() { PASS=$((PASS + 1)); printf 'PASS: %s\n' "$1"; }
fail() { FAIL=$((FAIL + 1)); printf 'FAIL: %s\n' "$1" >&2; }

# --- build a sandbox -------------------------------------------------------
SANDBOX=$(mktemp -d)
trap 'rm -rf "$SANDBOX"' EXIT

export SCRIPT_DIR="$SANDBOX/ia"
mkdir -p "$SCRIPT_DIR/scripts/ide-descriptors"
cp "${REPO_ROOT}/scripts/ide-descriptors/claude-code.sh" "$SCRIPT_DIR/scripts/ide-descriptors/"
cp "${REPO_ROOT}/scripts/ide-descriptors/vscode-copilot.sh" "$SCRIPT_DIR/scripts/ide-descriptors/"
cp "${REPO_ROOT}/scripts/ide-descriptors/codex.sh" "$SCRIPT_DIR/scripts/ide-descriptors/"
cp "${REPO_ROOT}/scripts/ide-descriptors/opencode.sh" "$SCRIPT_DIR/scripts/ide-descriptors/"

# skills/ fixture: an allowlisted skill whose directory name differs from its
# skill.json .name (proves resolution is by .name, not dir name), plus an
# unsanctioned skill that must be silently excluded.
mkdir -p "$SCRIPT_DIR/skills/mcp-bench-renamed-dir/commands"
cat > "$SCRIPT_DIR/skills/mcp-bench-renamed-dir/skill.json" <<'JSON'
{ "name": "mcp-bench", "version": "0.1.0", "assets": { "skill": true, "agents": false, "commands": true, "hooks": false } }
JSON
echo "# mcp-bench-run" > "$SCRIPT_DIR/skills/mcp-bench-renamed-dir/commands/mcp-bench-run.md"

mkdir -p "$SCRIPT_DIR/skills/unsanctioned-dir"
cat > "$SCRIPT_DIR/skills/unsanctioned-dir/skill.json" <<'JSON'
{ "name": "unsanctioned", "version": "1.0.0", "assets": { "skill": true, "agents": false, "commands": false, "hooks": false } }
JSON

export HOME="$SANDBOX/home"
mkdir -p "$HOME"
export NON_INTERACTIVE=1

# shellcheck disable=SC1090
source "$HELPERS"
# shellcheck disable=SC1090
source "$LIB"

# Shadow descriptor resolution to read our sandbox copy.
source_ide_descriptor() {
  local ide_id="$1"
  # shellcheck disable=SC1090
  source "$SCRIPT_DIR/scripts/ide-descriptors/${ide_id}.sh"
}

# ─────────────────────────────────────────────────────────────────────────────
# T2: OFFICIAL_SKILLS allowlist + scan_skills filter
# ─────────────────────────────────────────────────────────────────────────────

# --- Test 1: allowlisted + unsanctioned fixture -> AVAILABLE_SKILLS == mcp-bench only
t1() {
  scan_skills >/tmp/t1_out.$$ 2>/tmp/t1_err.$$
  local rc=$?
  local out err
  out="$(cat /tmp/t1_out.$$)"; err="$(cat /tmp/t1_err.$$)"
  rm -f /tmp/t1_out.$$ /tmp/t1_err.$$
  if [ "${#AVAILABLE_SKILLS[@]}" -eq 1 ] && [ "${AVAILABLE_SKILLS[0]}" = "mcp-bench" ] \
     && [ "$rc" -eq 0 ] && [ -z "$out" ] && [ -z "$err" ]; then
    pass "T1 AVAILABLE_SKILLS is exactly mcp-bench, exit 0, no output"
  else
    fail "T1 got AVAILABLE_SKILLS=(${AVAILABLE_SKILLS[*]:-}) rc=$rc out=[$out] err=[$err]"
  fi
}

# --- Test 2: unsanctioned skill.json .name resolves and is excluded silently
t2() {
  local found=0
  for s in "${AVAILABLE_SKILLS[@]}"; do
    [ "$s" = "unsanctioned" ] && found=1
  done
  [ "$found" -eq 0 ] && pass "T2 unsanctioned skill excluded from AVAILABLE_SKILLS" \
    || fail "T2 unsanctioned skill leaked into AVAILABLE_SKILLS"
}

# --- Test 3: allowlisted skill whose directory name differs from its
# skill.json .name resolves by .name (dir is "mcp-bench-renamed-dir")
t3() {
  local found_by_name=0 found_dirname=0
  for s in "${AVAILABLE_SKILLS[@]}"; do
    [ "$s" = "mcp-bench" ] && found_by_name=1
    [ "$s" = "mcp-bench-renamed-dir" ] && found_dirname=1
  done
  if [ "$found_by_name" -eq 1 ] && [ "$found_dirname" -eq 0 ]; then
    pass "T3 allowlisted skill resolves by skill.json .name, not directory name"
  else
    fail "T3 expected mcp-bench by-name resolution (found_by_name=$found_by_name found_dirname=$found_dirname)"
  fi
}

for t in t1 t2 t3; do "$t"; done

# ─────────────────────────────────────────────────────────────────────────────
# T3: DEPRECATED_SKILLS + _deprecated_assets_for manifest
# ─────────────────────────────────────────────────────────────────────────────

# --- Test 4: jira-feed returns exactly its 4 history-derived paths ----------
t4() {
  local got
  got="$(_deprecated_assets_for jira-feed)"
  local want="agents/jira-feed-formatter.md commands/jira-feed.md hooks/jira-feed-jira-guard.js hooks/jira-feed-output-guard.js"
  if [ "$got" = "$want" ]; then
    pass "T4 jira-feed manifest is exactly its 4 paths"
  else
    fail "T4 jira-feed manifest mismatch: got [$got]"
  fi
}

# --- Test 5: grill-with-docs returns empty ----------------------------------
t5() {
  local got
  got="$(_deprecated_assets_for grill-with-docs)"
  [ -z "$got" ] && pass "T5 grill-with-docs manifest is empty" \
    || fail "T5 expected empty, got [$got]"
}

# --- Test 6: an unknown name returns empty ----------------------------------
t6() {
  local got
  got="$(_deprecated_assets_for definitely-not-a-real-skill)"
  [ -z "$got" ] && pass "T6 unknown name manifest is empty" \
    || fail "T6 expected empty, got [$got]"
}

# --- Test 7: refuter word-count is 11 and tlc-spec-driven is 14 ------------
t7() {
  local refuter_n tlc_n
  refuter_n=$(_deprecated_assets_for refuter | wc -w | tr -d ' ')
  tlc_n=$(_deprecated_assets_for tlc-spec-driven | wc -w | tr -d ' ')
  if [ "$refuter_n" -eq 11 ] && [ "$tlc_n" -eq 14 ]; then
    pass "T7 refuter=11, tlc-spec-driven=14 asset counts"
  else
    fail "T7 expected refuter=11 got $refuter_n; tlc-spec-driven=14 got $tlc_n"
  fi
}

# --- Test 8: zero intersection with mcp-bench's three command basenames ----
t8() {
  local all overlap=0
  all="$(_deprecated_assets_for grill-with-docs) $(_deprecated_assets_for jira-feed) $(_deprecated_assets_for refuter) $(_deprecated_assets_for tlc-spec-driven)"
  for mb in mcp-bench-baseline.md mcp-bench-judge.md mcp-bench-run.md; do
    case " $all " in
      *"$mb"*) overlap=1 ;;
    esac
  done
  [ "$overlap" -eq 0 ] && pass "T8 zero intersection with mcp-bench's three commands" \
    || fail "T8 manifest collides with an mcp-bench basename"
}

for t in t4 t5 t6 t7 t8; do "$t"; done

# ─────────────────────────────────────────────────────────────────────────────
# T4: _registry_has_deprecated_entry read-only registry probe
# ─────────────────────────────────────────────────────────────────────────────

REGISTRY_FILE="${HOME}/.claude/settings.json"
MANIFEST_HOOK_PATH="${HOME}/.claude/hooks/refuter-citation-verifier.js"

seed_registry_with_manifest_hook() {
  mkdir -p "$(dirname "$REGISTRY_FILE")"
  cat > "$REGISTRY_FILE" <<JSON
{
  "hooks": {
    "Stop": [
      { "hooks": [ { "type": "command", "command": "${MANIFEST_HOOK_PATH}" } ] }
    ]
  }
}
JSON
}

seed_registry_with_unrelated_only() {
  mkdir -p "$(dirname "$REGISTRY_FILE")"
  cat > "$REGISTRY_FILE" <<JSON
{
  "hooks": {
    "Stop": [
      { "hooks": [ { "type": "command", "command": "${HOME}/.claude/hooks/keepme.js" } ] }
    ]
  }
}
JSON
}

# --- Test 9: seeded settings.json containing a manifest hook path -> trace -
t9() {
  rm -rf "${HOME}/.claude"
  seed_registry_with_manifest_hook
  if _registry_has_deprecated_entry claude-code "$MANIFEST_HOOK_PATH"; then
    pass "T9 registry containing manifest hook path -> trace (exit 0)"
  else
    fail "T9 expected trace (exit 0), got exit $?"
  fi
}

# --- Test 10: settings.json with only unrelated paths -> no trace ----------
t10() {
  rm -rf "${HOME}/.claude"
  seed_registry_with_unrelated_only
  if _registry_has_deprecated_entry claude-code "$MANIFEST_HOOK_PATH"; then
    fail "T10 expected no trace, got exit 0"
  else
    pass "T10 registry with only unrelated paths -> no trace (exit 1)"
  fi
}

# --- Test 11: malformed JSON -> no trace, exit 1 (not an abort) ------------
t11() {
  rm -rf "${HOME}/.claude"
  mkdir -p "$(dirname "$REGISTRY_FILE")"
  echo "{ not valid json" > "$REGISTRY_FILE"
  _registry_has_deprecated_entry claude-code "$MANIFEST_HOOK_PATH"
  local rc=$?
  [ "$rc" -eq 1 ] && pass "T11 malformed JSON -> no trace, exit 1, no abort" \
    || fail "T11 expected exit 1 on malformed JSON, got $rc"
}

# --- Test 12: the registry file's bytes are unchanged after a probe (D-2) --
t12() {
  rm -rf "${HOME}/.claude"
  seed_registry_with_manifest_hook
  local before after
  before="$(cat "$REGISTRY_FILE")"
  _registry_has_deprecated_entry claude-code "$MANIFEST_HOOK_PATH" >/dev/null
  after="$(cat "$REGISTRY_FILE")"
  if [ "$before" = "$after" ]; then
    pass "T12 registry bytes unchanged after a read-only probe (D-2)"
  else
    fail "T12 registry file was modified by the probe"
  fi
}

for t in t9 t10 t11 t12; do "$t"; done

# ─────────────────────────────────────────────────────────────────────────────
# T5: _deprecated_trace_in detection
# ─────────────────────────────────────────────────────────────────────────────

# --- Test 13: linked skill-dir symlink -> trace, TRACE_STATE=linked --------
t13() {
  rm -rf "${HOME}/.claude"
  source_ide_descriptor claude-code
  local skills_dir="$IDE_SKILLS_DIR"
  mkdir -p "$skills_dir"
  mkdir -p /tmp/rds-fake-src.$$
  ln -sfn /tmp/rds-fake-src.$$ "${skills_dir}/refuter"
  if _deprecated_trace_in refuter claude-code && [ "$TRACE_STATE" = "linked" ]; then
    pass "T13 linked skill-dir symlink -> trace, TRACE_STATE=linked"
  else
    fail "T13 expected trace/linked, got rc=$? TRACE_STATE=$TRACE_STATE"
  fi
  rm -rf /tmp/rds-fake-src.$$ "${skills_dir}/refuter"
}

# --- Test 14: nothing anywhere -> no trace ----------------------------------
t14() {
  rm -rf "${HOME}/.claude"
  if _deprecated_trace_in refuter claude-code; then
    fail "T14 expected no trace, got TRACE_STATE=$TRACE_STATE"
  else
    pass "T14 nothing anywhere -> no trace"
  fi
}

# --- Test 15: empty IDE_SKILLS_DIR + manifest agent present -> trace, files
# (vscode-copilot: IDE_SKILLS_DIR="" but a real IDE_AGENTS_DIR) -------------
t15() {
  source_ide_descriptor vscode-copilot
  local agents_dir="$IDE_AGENTS_DIR"
  mkdir -p "$agents_dir"
  touch "${agents_dir}/jira-feed-formatter.md"
  if _deprecated_trace_in jira-feed vscode-copilot && [ "$TRACE_STATE" = "files" ]; then
    pass "T15 empty IDE_SKILLS_DIR + manifest agent present -> trace, TRACE_STATE=files"
  else
    fail "T15 expected trace/files, got rc=$? TRACE_STATE=$TRACE_STATE"
  fi
  rm -f "${agents_dir}/jira-feed-formatter.md"
}

# --- Test 16: registry entry only, no link/dir -> trace, TRACE_STATE=registry
# (the live claude-code case) ------------------------------------------------
t16() {
  rm -rf "${HOME}/.claude"
  seed_registry_with_manifest_hook
  if _deprecated_trace_in refuter claude-code && [ "$TRACE_STATE" = "registry" ]; then
    pass "T16 registry-only orphan -> trace, TRACE_STATE=registry"
  else
    fail "T16 expected trace/registry, got rc=$? TRACE_STATE=$TRACE_STATE"
  fi
  rm -rf "${HOME}/.claude"
}

# --- Test 17: a real directory -> trace, TRACE_STATE=copied -----------------
t17() {
  source_ide_descriptor claude-code
  local skills_dir="$IDE_SKILLS_DIR"
  mkdir -p "${skills_dir}/refuter"
  if _deprecated_trace_in refuter claude-code && [ "$TRACE_STATE" = "copied" ]; then
    pass "T17 real directory -> trace, TRACE_STATE=copied"
  else
    fail "T17 expected trace/copied, got rc=$? TRACE_STATE=$TRACE_STATE"
  fi
  rm -rf "${skills_dir}/refuter"
}

# --- Test 39: skill-dir symlink whose target no longer exists -> trace,
# TRACE_STATE=broken (dangling symlink left after the source dir moved/was
# deleted, distinct from T17's "copied" real-directory case) ----------------
t39() {
  rm -rf "${HOME}/.claude"
  source_ide_descriptor claude-code
  local skills_dir="$IDE_SKILLS_DIR"
  mkdir -p "$skills_dir"
  ln -sfn "/tmp/rds-nonexistent-src.$$" "${skills_dir}/refuter"
  if _deprecated_trace_in refuter claude-code && [ "$TRACE_STATE" = "broken" ]; then
    pass "T39 dangling skill-dir symlink -> trace, TRACE_STATE=broken"
  else
    fail "T39 expected trace/broken, got rc=$? TRACE_STATE=$TRACE_STATE"
  fi
  rm -rf "${skills_dir}/refuter"
}

for t in t13 t14 t15 t16 t17 t39; do "$t"; done

# ─────────────────────────────────────────────────────────────────────────────
# T6: _remove_deprecated_from — the only mutator
# ─────────────────────────────────────────────────────────────────────────────

# --- Test 18: skill-dir symlink removed -------------------------------------
t18() {
  rm -rf "${HOME}/.claude"
  source_ide_descriptor claude-code
  local skills_dir="$IDE_SKILLS_DIR"
  mkdir -p "$skills_dir"
  mkdir -p "${SANDBOX}/fake-refuter-src"
  ln -sfn "${SANDBOX}/fake-refuter-src" "${skills_dir}/refuter"
  _remove_deprecated_from refuter claude-code
  local rc=$?
  if [ "$rc" -eq 0 ] && [ ! -e "${skills_dir}/refuter" ] && [ ! -L "${skills_dir}/refuter" ]; then
    pass "T18 skill-dir symlink removed"
  else
    fail "T18 expected removed skill-dir link, rc=$rc"
  fi
}

# --- Test 19: agent .md AND .toml twin both removed (codex real files) -----
t19() {
  source_ide_descriptor codex
  local agents_dir="$IDE_AGENTS_DIR"
  mkdir -p "$agents_dir"
  touch "${agents_dir}/refuter-analyst.md" "${agents_dir}/refuter-analyst.toml"
  _remove_deprecated_from refuter codex
  local rc=$?
  if [ "$rc" -eq 0 ] && [ ! -e "${agents_dir}/refuter-analyst.md" ] && [ ! -e "${agents_dir}/refuter-analyst.toml" ]; then
    pass "T19 agent .md and .toml twin both removed (codex real files)"
  else
    fail "T19 expected both removed, md_exists=$([ -e "${agents_dir}/refuter-analyst.md" ] && echo yes || echo no) toml_exists=$([ -e "${agents_dir}/refuter-analyst.toml" ] && echo yes || echo no)"
  fi
}

# --- Test 20: a registered hook is deregistered AND unlinked ---------------
t20() {
  rm -rf "${HOME}/.claude"
  source_ide_descriptor claude-code
  local hooks_dir="$IDE_HOOKS_DIR"
  mkdir -p "$hooks_dir" "$(dirname "$REGISTRY_FILE")"
  local hook_path="${hooks_dir}/refuter-citation-verifier.js"
  touch "$hook_path"
  cat > "$REGISTRY_FILE" <<JSON
{ "hooks": { "Stop": [ { "hooks": [ { "type": "command", "command": "${hook_path}" } ] } ] } }
JSON
  _remove_deprecated_from refuter claude-code
  local rc=$?
  local link_gone=0 registry_purged=0
  { [ ! -e "$hook_path" ] && [ ! -L "$hook_path" ]; } && link_gone=1
  node -e "const cfg=require('${REGISTRY_FILE}'); const cmds=(cfg.hooks.Stop||[]).flatMap(g=>g.hooks||[]).map(h=>h.command); process.exit(cmds.includes('${hook_path}')?1:0);" && registry_purged=1
  if [ "$rc" -eq 0 ] && [ "$link_gone" -eq 1 ] && [ "$registry_purged" -eq 1 ]; then
    pass "T20 registered hook deregistered and unlinked"
  else
    fail "T20 rc=$rc link_gone=$link_gone registry_purged=$registry_purged"
  fi
}

# --- Test 21: a hook with no link file still has its registry entry purged -
t21() {
  rm -rf "${HOME}/.claude"
  source_ide_descriptor claude-code
  local hooks_dir="$IDE_HOOKS_DIR"
  mkdir -p "$hooks_dir" "$(dirname "$REGISTRY_FILE")"
  local hook_path="${hooks_dir}/refuter-citation-verifier.js"
  # No link file created — orphan registry entry only.
  cat > "$REGISTRY_FILE" <<JSON
{ "hooks": { "Stop": [ { "hooks": [ { "type": "command", "command": "${hook_path}" } ] } ] } }
JSON
  _remove_deprecated_from refuter claude-code >/dev/null
  local registry_purged=0
  node -e "const cfg=require('${REGISTRY_FILE}'); const cmds=(cfg.hooks.Stop||[]).flatMap(g=>g.hooks||[]).map(h=>h.command); process.exit(cmds.includes('${hook_path}')?1:0);" && registry_purged=1
  [ "$registry_purged" -eq 1 ] && pass "T21 orphaned registry entry (no link file) is purged" \
    || fail "T21 orphan registry entry survived"
}

# --- Test 38 (Verifier Fix 2): json_remove_hooks is called BEFORE the hook
# link is rm -f'd — spec P1-2 AC7. Shadows json_remove_hooks to record
# whether the target file still exists on disk at the moment it is called;
# if _remove_deprecated_from ever reordered to unlink first, this call-time
# snapshot would observe the file already gone. `unset -f` afterward restores
# resolution to the real function sourced from install-skills.sh (matching
# the T27-T29 shadow/unset precedent below).
t38() {
  rm -rf "${HOME}/.claude"
  source_ide_descriptor claude-code
  local hooks_dir="$IDE_HOOKS_DIR"
  mkdir -p "$hooks_dir" "$(dirname "$REGISTRY_FILE")"
  local hook_path="${hooks_dir}/refuter-citation-verifier.js"
  touch "$hook_path"
  cat > "$REGISTRY_FILE" <<JSON
{ "hooks": { "Stop": [ { "hooks": [ { "type": "command", "command": "${hook_path}" } ] } ] } }
JSON

  JRH_CALL_TIME_FILE_EXISTED=""
  # shellcheck disable=SC2317
  json_remove_hooks() {
    local target="$2"
    # refuter's manifest has 7 hooks; only refuter-citation-verifier.js was
    # seeded on disk. Record the call-time snapshot only for that hook —
    # the other 6 calls target files that never existed and would otherwise
    # overwrite this with a false "no".
    case "$target" in
      */refuter-citation-verifier.js)
        if [ -e "$target" ] || [ -L "$target" ]; then
          JRH_CALL_TIME_FILE_EXISTED="yes"
        else
          JRH_CALL_TIME_FILE_EXISTED="no"
        fi
        ;;
    esac
  }

  _remove_deprecated_from refuter claude-code >/dev/null
  local rc=$?
  unset -f json_remove_hooks
  # unset -f removes the shadow outright (bash has no function shadowing/
  # restore) — re-source HELPERS to bring back the real json_remove_hooks,
  # matching the T27-T29 is_noninteractive precedent below.
  # shellcheck disable=SC1090
  source "$HELPERS"

  if [ "$rc" -eq 0 ] && [ "$JRH_CALL_TIME_FILE_EXISTED" = "yes" ]; then
    pass "T38 json_remove_hooks runs before rm -f (hook file still present at call time)"
  else
    fail "T38 rc=$rc call_time_file_existed=[$JRH_CALL_TIME_FILE_EXISTED] (expected 'yes')"
  fi
}

for t in t38; do "$t"; done

# --- Test 22: unrelated registry entries survive as parsed triples ---------
t22() {
  rm -rf "${HOME}/.claude"
  source_ide_descriptor claude-code
  local hooks_dir="$IDE_HOOKS_DIR"
  mkdir -p "$hooks_dir" "$(dirname "$REGISTRY_FILE")"
  local hook_path="${hooks_dir}/refuter-citation-verifier.js"
  local keep_path="${hooks_dir}/keepme.js"
  cat > "$REGISTRY_FILE" <<JSON
{ "hooks": { "Stop": [ { "hooks": [ { "type": "command", "command": "${hook_path}" }, { "type": "command", "command": "${keep_path}" } ] } ] } }
JSON
  _remove_deprecated_from refuter claude-code >/dev/null
  local kept=0
  node -e "const cfg=require('${REGISTRY_FILE}'); const triples=(cfg.hooks.Stop||[]).flatMap(g=>(g.hooks||[]).map(h=>({event:'Stop',matcher:g.matcher||'',command:h.command}))); process.exit(triples.some(t=>t.command==='${keep_path}')?0:1);" && kept=1
  [ "$kept" -eq 1 ] && pass "T22 unrelated registry entry survives as a parsed triple (D-2)" \
    || fail "T22 unrelated registry entry was lost"
}

# --- Test 23: empty IDE_COMMANDS_DIR is skipped with exit 0 -----------------
t23() {
  source_ide_descriptor codex
  # codex has IDE_COMMANDS_DIR="" — refuter's manifest includes commands/refuter.md.
  _remove_deprecated_from refuter codex
  local rc=$?
  [ "$rc" -eq 0 ] && pass "T23 empty IDE_COMMANDS_DIR skipped with exit 0 (codex)" \
    || fail "T23 expected exit 0, got $rc"
}

# --- Test 24: removal succeeds with the skill's source dir absent from
# SCRIPT_DIR (manifest is history-based, not globbed; P1-4 AC 4) -----------
t24() {
  rm -rf "${HOME}/.claude"
  # Verify the sandbox SCRIPT_DIR has no refuter source directory at all.
  [ -d "${SCRIPT_DIR}/skills/refuter" ] && fail "T24 setup invalid: refuter source exists in sandbox" && return
  source_ide_descriptor claude-code
  local skills_dir="$IDE_SKILLS_DIR"
  mkdir -p "$skills_dir"
  mkdir -p "${SANDBOX}/fake-refuter-src2"
  ln -sfn "${SANDBOX}/fake-refuter-src2" "${skills_dir}/refuter"
  _remove_deprecated_from refuter claude-code
  local rc=$?
  if [ "$rc" -eq 0 ] && [ ! -e "${skills_dir}/refuter" ]; then
    pass "T24 removal succeeds with skill source directory absent from SCRIPT_DIR"
  else
    fail "T24 rc=$rc link_still_present=$([ -e "${skills_dir}/refuter" ] && echo yes || echo no)"
  fi
}

for t in t18 t19 t20 t21 t22 t23 t24; do "$t"; done

# ─────────────────────────────────────────────────────────────────────────────
# T7: _prompt_deprecated_removal consent
# ─────────────────────────────────────────────────────────────────────────────

# --- Test 25: non-interactive linked -> remove ------------------------------
t25() {
  local out err
  out="$(_prompt_deprecated_removal refuter linked "Claude Code" 2>/tmp/rds-t25-err.$$)"
  err="$(cat /tmp/rds-t25-err.$$)"; rm -f /tmp/rds-t25-err.$$
  [ "$out" = "remove" ] && pass "T25 non-interactive linked -> remove" \
    || fail "T25 expected remove, got [$out] err=[$err]"
}

# --- Test 26: non-interactive copied -> keep, plus a warning on stderr -----
t26() {
  local out err
  out="$(_prompt_deprecated_removal refuter copied "Claude Code" "/some/real/dir" 2>/tmp/rds-t26-err.$$)"
  err="$(cat /tmp/rds-t26-err.$$)"; rm -f /tmp/rds-t26-err.$$
  if [ "$out" = "keep" ] && [ -n "$err" ]; then
    pass "T26 non-interactive copied -> keep plus a stderr warning"
  else
    fail "T26 expected keep+warning, got out=[$out] err=[$err]"
  fi
}

# --- Test 27: interactive (shadowed is_noninteractive) empty line -> remove;
# stderr line contains skill name, "deprecated" and every affected IDE_NAME,
# stdout holds only the token --------------------------------------------
t27() {
  is_noninteractive() { return 1; }
  local out err
  out="$(printf '\n' | _prompt_deprecated_removal refuter linked "OpenCode, Claude Code, Codex" 2>/tmp/rds-t27-err.$$)"
  err="$(cat /tmp/rds-t27-err.$$)"; rm -f /tmp/rds-t27-err.$$
  unset -f is_noninteractive
  if [ "$out" = "remove" ] \
     && case "$err" in *refuter*deprecated*"OpenCode"*"Claude Code"*"Codex"*) true ;; *) false ;; esac; then
    pass "T27 interactive empty line -> remove; stderr names skill+deprecated+all IDEs; stdout is only the token"
  else
    fail "T27 out=[$out] err=[$err]"
  fi
}

# --- Test 28: interactive keep -> keep, warning names both causes, no new
# file appears anywhere under $HOME ------------------------------------------
t28() {
  is_noninteractive() { return 1; }
  local before after out err
  before="$(find "$HOME" | sort)"
  out="$(printf 'keep\n' | _prompt_deprecated_removal refuter linked "Claude Code" 2>/tmp/rds-t28-err.$$)"
  err="$(cat /tmp/rds-t28-err.$$)"; rm -f /tmp/rds-t28-err.$$
  after="$(find "$HOME" | sort)"
  unset -f is_noninteractive
  if [ "$out" = "keep" ] && [ "$before" = "$after" ] \
     && case "$err" in *"source no longer exists"*"offered for removal again"*) true ;; *) false ;; esac; then
    pass "T28 interactive keep -> keep, warns both causes, no new file under \$HOME"
  else
    fail "T28 out=[$out] before_eq_after=$([ "$before" = "$after" ] && echo yes || echo no) err=[$err]"
  fi
}

# --- Test 29: the copied prompt states the absolute path, real-directory,
# and git-history permanence wording; empty line still defaults to remove
# (CONTEXT.md overrides spec P1-3 AC 8 / A-08 — uniform default) -----------
t29() {
  is_noninteractive() { return 1; }
  local out err
  out="$(printf '\n' | _prompt_deprecated_removal refuter copied "Claude Code" "/abs/copied/refuter" 2>/tmp/rds-t29-err.$$)"
  err="$(cat /tmp/rds-t29-err.$$)"; rm -f /tmp/rds-t29-err.$$
  unset -f is_noninteractive
  if [ "$out" = "remove" ] && case "$err" in
    *"/abs/copied/refuter"*"real directory"*"git history"*) true ;; *) false ;;
  esac; then
    pass "T29 copied prompt states path/real-directory/git-history wording; empty line -> remove uniformly"
  else
    fail "T29 out=[$out] err=[$err]"
  fi
}

for t in t25 t26 t27 t28 t29; do "$t"; done

# T27-T29 shadow is_noninteractive() then `unset -f` it, which removes the
# function outright rather than restoring the original (bash has no function
# scoping). Re-source to restore it before any later test relies on it.
# shellcheck disable=SC1090
source "$HELPERS"

# ─────────────────────────────────────────────────────────────────────────────
# T8: remove_deprecated_skills orchestrator
# ─────────────────────────────────────────────────────────────────────────────

# --- Test 30: DETECTED_IDES empty/unset -> exit 0, zero output -------------
t30() {
  rm -rf "${HOME}/.claude"
  unset DETECTED_IDES
  local out rc
  out="$(remove_deprecated_skills 2>&1)"
  rc=$?
  local out2
  DETECTED_IDES=()
  out2="$(remove_deprecated_skills 2>&1)"
  local rc2=$?
  if [ "$rc" -eq 0 ] && [ -z "$out" ] && [ "$rc2" -eq 0 ] && [ -z "$out2" ]; then
    pass "T30 DETECTED_IDES unset and empty -> exit 0, zero output"
  else
    fail "T30 unset: rc=$rc out=[$out]; empty: rc=$rc2 out=[$out2]"
  fi
}

# --- Test 31: no trace anywhere -> no prompt, no output, exit 0 ------------
t31() {
  rm -rf "${HOME}/.claude"
  DETECTED_IDES=("claude-code" "vscode-copilot")
  local out rc
  out="$(remove_deprecated_skills 2>&1)"
  rc=$?
  if [ "$rc" -eq 0 ] && [ -z "$out" ]; then
    pass "T31 no trace anywhere -> no prompt, no output, exit 0"
  else
    fail "T31 rc=$rc out=[$out]"
  fi
}

# --- Test 32: two IDEs, only one holds a trace -> only that IDE is named
# and only its assets change -------------------------------------------------
t32() {
  rm -rf "${HOME}/.claude"
  DETECTED_IDES=("claude-code" "vscode-copilot")
  source_ide_descriptor vscode-copilot
  local agents_dir="$IDE_AGENTS_DIR"
  unset IDE_ID IDE_NAME IDE_DETECT_PATH IDE_GLOBAL_DIR \
        IDE_SKILLS_DIR IDE_AGENTS_DIR IDE_COMMANDS_DIR IDE_HOOKS_DIR \
        IDE_MCP_CONFIG IDE_MCP_FORMAT IDE_AGENT_FORMAT \
        IDE_SUPPORTS_SYMLINK IDE_SUPPORTS_HOOKS IDE_SUPPORTS_COMMANDS
  mkdir -p "$agents_dir"
  touch "${agents_dir}/jira-feed-formatter.md"
  local out rc
  out="$(remove_deprecated_skills 2>&1)"
  rc=$?
  if [ "$rc" -eq 0 ] \
     && case "$out" in *"Claude Code"*) false ;; *) true ;; esac \
     && case "$out" in *"VS Code (Copilot)"*) true ;; *) false ;; esac \
     && [ ! -e "${agents_dir}/jira-feed-formatter.md" ]; then
    pass "T32 only the IDE holding a trace is named and changed"
  else
    fail "T32 out=[$out] agent_removed=$([ -e "${agents_dir}/jira-feed-formatter.md" ] && echo no || echo yes)"
  fi
}

# --- Test 33: a changed pair emits exactly one line with counts and
# basenames -------------------------------------------------------------------
t33() {
  rm -rf "${HOME}/.claude"
  DETECTED_IDES=("vscode-copilot")
  source_ide_descriptor vscode-copilot
  local agents_dir="$IDE_AGENTS_DIR"
  unset IDE_ID IDE_NAME IDE_DETECT_PATH IDE_GLOBAL_DIR \
        IDE_SKILLS_DIR IDE_AGENTS_DIR IDE_COMMANDS_DIR IDE_HOOKS_DIR \
        IDE_MCP_CONFIG IDE_MCP_FORMAT IDE_AGENT_FORMAT \
        IDE_SUPPORTS_SYMLINK IDE_SUPPORTS_HOOKS IDE_SUPPORTS_COMMANDS
  mkdir -p "$agents_dir"
  touch "${agents_dir}/jira-feed-formatter.md"
  local out rc line_count
  out="$(remove_deprecated_skills 2>&1)"
  rc=$?
  line_count=$(printf '%s\n' "$out" | grep -c . )
  if [ "$rc" -eq 0 ] && [ "$line_count" -eq 1 ] \
     && case "$out" in *"1 link(s)"*"0 hook registration(s)"*"jira-feed-formatter.md"*) true ;; *) false ;; esac; then
    pass "T33 changed pair emits exactly one line with counts and basenames"
  else
    fail "T33 line_count=$line_count out=[$out]"
  fi
}

# --- Test 34: an immediate second run prints nothing and exits 0
# (idempotency, DEPR-N02 / P1-4 AC 6) -----------------------------------------
t34() {
  rm -rf "${HOME}/.claude"
  DETECTED_IDES=("vscode-copilot")
  source_ide_descriptor vscode-copilot
  local agents_dir="$IDE_AGENTS_DIR"
  unset IDE_ID IDE_NAME IDE_DETECT_PATH IDE_GLOBAL_DIR \
        IDE_SKILLS_DIR IDE_AGENTS_DIR IDE_COMMANDS_DIR IDE_HOOKS_DIR \
        IDE_MCP_CONFIG IDE_MCP_FORMAT IDE_AGENT_FORMAT \
        IDE_SUPPORTS_SYMLINK IDE_SUPPORTS_HOOKS IDE_SUPPORTS_COMMANDS
  mkdir -p "$agents_dir"
  touch "${agents_dir}/jira-feed-formatter.md"
  remove_deprecated_skills >/dev/null 2>&1
  local out rc
  out="$(remove_deprecated_skills 2>&1)"
  rc=$?
  [ "$rc" -eq 0 ] && [ -z "$out" ] && pass "T34 immediate second run prints nothing and exits 0" \
    || fail "T34 rc=$rc out=[$out]"
}

# --- Test 35: with SELECTED_IDES unset the function still works
# (P1-4 AC 2 — never reads SELECTED_IDES) -------------------------------------
t35() {
  rm -rf "${HOME}/.claude"
  unset SELECTED_IDES
  DETECTED_IDES=("vscode-copilot")
  source_ide_descriptor vscode-copilot
  local agents_dir="$IDE_AGENTS_DIR"
  unset IDE_ID IDE_NAME IDE_DETECT_PATH IDE_GLOBAL_DIR \
        IDE_SKILLS_DIR IDE_AGENTS_DIR IDE_COMMANDS_DIR IDE_HOOKS_DIR \
        IDE_MCP_CONFIG IDE_MCP_FORMAT IDE_AGENT_FORMAT \
        IDE_SUPPORTS_SYMLINK IDE_SUPPORTS_HOOKS IDE_SUPPORTS_COMMANDS
  mkdir -p "$agents_dir"
  touch "${agents_dir}/jira-feed-formatter.md"
  local rc
  remove_deprecated_skills >/dev/null 2>&1
  rc=$?
  if [ "$rc" -eq 0 ] && [ ! -e "${agents_dir}/jira-feed-formatter.md" ]; then
    pass "T35 SELECTED_IDES unset -> function still works"
  else
    fail "T35 rc=$rc agent_removed=$([ -e "${agents_dir}/jira-feed-formatter.md" ] && echo no || echo yes)"
  fi
}

# --- Test 36: a deliberately corrupt settings.json still yields exit 0
# with the seeded links removed (P1-4 AC 5) -----------------------------------
t36() {
  rm -rf "${HOME}/.claude"
  DETECTED_IDES=("claude-code")
  source_ide_descriptor claude-code
  local hooks_dir="$IDE_HOOKS_DIR"
  unset IDE_ID IDE_NAME IDE_DETECT_PATH IDE_GLOBAL_DIR \
        IDE_SKILLS_DIR IDE_AGENTS_DIR IDE_COMMANDS_DIR IDE_HOOKS_DIR \
        IDE_MCP_CONFIG IDE_MCP_FORMAT IDE_AGENT_FORMAT \
        IDE_SUPPORTS_SYMLINK IDE_SUPPORTS_HOOKS IDE_SUPPORTS_COMMANDS
  mkdir -p "$hooks_dir" "$(dirname "$REGISTRY_FILE")"
  local hook_path="${hooks_dir}/refuter-citation-verifier.js"
  touch "$hook_path"
  echo "{ not valid json" > "$REGISTRY_FILE"
  local out rc
  out="$(remove_deprecated_skills 2>&1)"
  rc=$?
  if [ "$rc" -eq 0 ] && [ ! -e "$hook_path" ] && [ ! -L "$hook_path" ]; then
    pass "T36 corrupt settings.json -> exit 0, seeded hook link removed"
  else
    fail "T36 rc=$rc hook_removed=$([ -e "$hook_path" ] && echo no || echo yes) out=[$out]"
  fi
}

for t in t30 t31 t32 t33 t34 t35 t36; do "$t"; done

# ─────────────────────────────────────────────────────────────────────────────
# T9: setup_skills wiring — call reached even when no IDE is selected
# ─────────────────────────────────────────────────────────────────────────────

# --- Test 37: with prompt_ide_select shadowed to select nothing,
# setup_skills still removes a seeded deprecated link (P1-4 AC 1) -----------
t37() {
  rm -rf "${HOME}/.claude"
  mkdir -p "${HOME}/.claude"
  source_ide_descriptor claude-code
  local agents_dir="$IDE_AGENTS_DIR"
  unset IDE_ID IDE_NAME IDE_DETECT_PATH IDE_GLOBAL_DIR \
        IDE_SKILLS_DIR IDE_AGENTS_DIR IDE_COMMANDS_DIR IDE_HOOKS_DIR \
        IDE_MCP_CONFIG IDE_MCP_FORMAT IDE_AGENT_FORMAT \
        IDE_SUPPORTS_SYMLINK IDE_SUPPORTS_HOOKS IDE_SUPPORTS_COMMANDS
  mkdir -p "$agents_dir"
  touch "${agents_dir}/jira-feed-formatter.md"

  prompt_ide_select() { SELECTED_IDES=(); }

  local out rc
  out="$(setup_skills "$SCRIPT_DIR" 2>&1)"
  rc=$?

  unset -f prompt_ide_select
  # shellcheck disable=SC1090
  source "$HELPERS"
  source_ide_descriptor() {
    local ide_id="$1"
    source "$SCRIPT_DIR/scripts/ide-descriptors/${ide_id}.sh"
  }

  if [ "$rc" -eq 0 ] && [ ! -e "${agents_dir}/jira-feed-formatter.md" ]; then
    pass "T37 no-IDE-selected path still reaches remove_deprecated_skills"
  else
    fail "T37 rc=$rc agent_removed=$([ -e "${agents_dir}/jira-feed-formatter.md" ] && echo no || echo yes) out=[$out]"
  fi
}

for t in t37; do "$t"; done

# ─────────────────────────────────────────────────────────────────────────────
# Named-IDE-pair scenarios from the ticket's own acceptance criteria (AC2,
# AC6) — the underlying mechanics are already proven generically by T32/T33
# (mixed-state aggregation) and T25/T26 (non-interactive auto-remove) using
# claude-code/vscode-copilot, but no prior test names the exact IDE pairs the
# ticket text uses. These close that labeling gap.
# ─────────────────────────────────────────────────────────────────────────────

# --- Test 40 (AC2): jira-feed symlinked in OpenCode AND Claude Code, user
# confirms removal -> removed from both, incl. per-file links, and the
# Claude Code hook registration is deregistered -----------------------------
t40() {
  rm -rf "${HOME}/.claude" "${HOME}/.config/opencode"

  DETECTED_IDES=("opencode" "claude-code")

  source_ide_descriptor opencode
  local oc_agents_dir="$IDE_AGENTS_DIR"
  unset IDE_ID IDE_NAME IDE_DETECT_PATH IDE_GLOBAL_DIR \
        IDE_SKILLS_DIR IDE_AGENTS_DIR IDE_COMMANDS_DIR IDE_HOOKS_DIR \
        IDE_MCP_CONFIG IDE_MCP_FORMAT IDE_AGENT_FORMAT \
        IDE_SUPPORTS_SYMLINK IDE_SUPPORTS_HOOKS IDE_SUPPORTS_COMMANDS
  mkdir -p "$oc_agents_dir"
  touch "${oc_agents_dir}/jira-feed-formatter.md"

  source_ide_descriptor claude-code
  local cc_hooks_dir="$IDE_HOOKS_DIR"
  unset IDE_ID IDE_NAME IDE_DETECT_PATH IDE_GLOBAL_DIR \
        IDE_SKILLS_DIR IDE_AGENTS_DIR IDE_COMMANDS_DIR IDE_HOOKS_DIR \
        IDE_MCP_CONFIG IDE_MCP_FORMAT IDE_AGENT_FORMAT \
        IDE_SUPPORTS_SYMLINK IDE_SUPPORTS_HOOKS IDE_SUPPORTS_COMMANDS
  mkdir -p "$cc_hooks_dir" "$(dirname "$REGISTRY_FILE")"
  local hook_path="${cc_hooks_dir}/jira-feed-jira-guard.js"
  touch "$hook_path"
  cat > "$REGISTRY_FILE" <<JSON
{ "hooks": { "Stop": [ { "hooks": [ { "type": "command", "command": "${hook_path}" } ] } ] } }
JSON

  is_noninteractive() { return 1; }
  local out rc
  out="$(printf '\n' | remove_deprecated_skills 2>&1)"
  rc=$?
  unset -f is_noninteractive
  # unset -f removes the shadow outright (bash has no function shadowing/
  # restore) — re-source HELPERS to bring back the real is_noninteractive,
  # matching the T27-T29 precedent, since T41 relies on it below.
  # shellcheck disable=SC1090
  source "$HELPERS"

  local hooks_purged=0
  node -e "const cfg=require('${REGISTRY_FILE}'); const cmds=(cfg.hooks.Stop||[]).flatMap(g=>g.hooks||[]).map(h=>h.command); process.exit(cmds.includes('${hook_path}')?1:0);" && hooks_purged=1

  if [ "$rc" -eq 0 ] \
     && case "$out" in *"OpenCode"*"Claude Code"*) true ;; *) false ;; esac \
     && [ ! -e "${oc_agents_dir}/jira-feed-formatter.md" ] \
     && [ ! -e "$hook_path" ] && [ ! -L "$hook_path" ] \
     && [ "$hooks_purged" -eq 1 ]; then
    pass "T40 jira-feed removed from OpenCode+Claude Code (AC2), hook deregistered"
  else
    fail "T40 rc=$rc out=[$out] agent_removed=$([ -e "${oc_agents_dir}/jira-feed-formatter.md" ] && echo no || echo yes) hook_removed=$([ -e "$hook_path" ] && echo no || echo yes) hooks_purged=$hooks_purged"
  fi
}

# --- Test 41 (AC6): grill-with-docs installed in OpenCode AND Codex, run is
# non-interactive -> removed automatically from both, with no prompt -------
t41() {
  rm -rf "${HOME}/.agents/skills" "${HOME}/.config/opencode"

  DETECTED_IDES=("opencode" "codex")

  local src="/tmp/rds-t41-src.$$"
  mkdir -p "$src"

  source_ide_descriptor opencode
  local oc_skills_dir="$IDE_SKILLS_DIR"
  unset IDE_ID IDE_NAME IDE_DETECT_PATH IDE_GLOBAL_DIR \
        IDE_SKILLS_DIR IDE_AGENTS_DIR IDE_COMMANDS_DIR IDE_HOOKS_DIR \
        IDE_MCP_CONFIG IDE_MCP_FORMAT IDE_AGENT_FORMAT \
        IDE_SUPPORTS_SYMLINK IDE_SUPPORTS_HOOKS IDE_SUPPORTS_COMMANDS
  mkdir -p "$oc_skills_dir"
  ln -sfn "$src" "${oc_skills_dir}/grill-with-docs"

  source_ide_descriptor codex
  local codex_skills_dir="$IDE_SKILLS_DIR"
  unset IDE_ID IDE_NAME IDE_DETECT_PATH IDE_GLOBAL_DIR \
        IDE_SKILLS_DIR IDE_AGENTS_DIR IDE_COMMANDS_DIR IDE_HOOKS_DIR \
        IDE_MCP_CONFIG IDE_MCP_FORMAT IDE_AGENT_FORMAT \
        IDE_SUPPORTS_SYMLINK IDE_SUPPORTS_HOOKS IDE_SUPPORTS_COMMANDS
  mkdir -p "$codex_skills_dir"
  ln -sfn "$src" "${codex_skills_dir}/grill-with-docs"

  # NON_INTERACTIVE=1 is exported globally at the top of this file — no
  # shadowing needed; this is the real is_noninteractive() path (AC6).
  local out rc
  out="$(remove_deprecated_skills 2>&1)"
  rc=$?

  if [ "$rc" -eq 0 ] \
     && [ ! -e "${oc_skills_dir}/grill-with-docs" ] && [ ! -L "${oc_skills_dir}/grill-with-docs" ] \
     && [ ! -e "${codex_skills_dir}/grill-with-docs" ] && [ ! -L "${codex_skills_dir}/grill-with-docs" ] \
     && case "$out" in *"deprecated, found in"*) false ;; *) true ;; esac \
     && case "$out" in *"OpenCode"*"Codex CLI"*) true ;; *) false ;; esac; then
    pass "T41 non-interactive grill-with-docs removed from OpenCode+Codex (AC6), no prompt"
  else
    fail "T41 rc=$rc out=[$out] opencode_removed=$([ -e "${oc_skills_dir}/grill-with-docs" ] && echo no || echo yes) codex_removed=$([ -e "${codex_skills_dir}/grill-with-docs" ] && echo no || echo yes)"
  fi
  rm -rf "$src"
}

for t in t40 t41; do "$t"; done

printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
