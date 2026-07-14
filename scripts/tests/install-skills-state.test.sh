#!/usr/bin/env bash
# Tests for state-aware asset linking in install-skills.sh:
#   - aggregate_skill_state returns "incomplete" when a linked skill declares
#     assets (commands) whose links are missing.
#   - prompt_skill_action maps "incomplete" -> "relink" non-interactively.
#   - command-less IDEs never trigger "incomplete" (graceful degradation).
#   - a fully-linked skill returns "linked".
#
# Isolated: builds a fake SCRIPT_DIR/skills fixture + a temp HOME so the real
# opencode/cursor descriptors resolve into throwaway dirs. Bash (descriptors and
# install-skills.sh use bash arrays).

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

# Fake SCRIPT_DIR with a skills/ fixture that has 2 command files.
export SCRIPT_DIR="$SANDBOX/ia"
mkdir -p "$SCRIPT_DIR/scripts/ide-descriptors"
# reuse the real descriptors so capability flags are authentic
cp "${REPO_ROOT}/scripts/ide-descriptors/opencode.sh" "$SCRIPT_DIR/scripts/ide-descriptors/"
cp "${REPO_ROOT}/scripts/ide-descriptors/cursor.sh"   "$SCRIPT_DIR/scripts/ide-descriptors/"

mkdir -p "$SCRIPT_DIR/skills/fixture-skill/commands"
cat > "$SCRIPT_DIR/skills/fixture-skill/skill.json" <<'JSON'
{ "name": "fixture-skill", "version": "1.0.0", "assets": { "skill": true, "agents": false, "commands": true, "hooks": false } }
JSON
echo "# a" > "$SCRIPT_DIR/skills/fixture-skill/commands/fx-a.md"
echo "# b" > "$SCRIPT_DIR/skills/fixture-skill/commands/fx-b.md"

# Temp HOME so IDE dirs resolve under the sandbox.
export HOME="$SANDBOX/home"
export XDG_CONFIG_HOME="$HOME/.config"
mkdir -p "$XDG_CONFIG_HOME"
export NON_INTERACTIVE=1   # force is_noninteractive

# Source helpers + lib (lib expects SCRIPT_DIR and source_ide_descriptor).
# shellcheck disable=SC1090
source "$HELPERS"
# install-skills.sh references SCRIPT_DIR relative to its own location for
# descriptors; point that resolution at our sandbox by overriding after source.
# shellcheck disable=SC1090
source "$LIB"

# source_ide_descriptor in helpers resolves descriptors from a fixed path; make
# it read our sandbox copies by shadowing with a wrapper.
source_ide_descriptor() {
  local ide_id="$1"
  # shellcheck disable=SC1090
  source "$SCRIPT_DIR/scripts/ide-descriptors/${ide_id}.sh"
}

link_skill_dir_only() {
  # Simulate an OLD install: only the skill DIRECTORY is symlinked, no commands.
  source_ide_descriptor opencode
  mkdir -p "$IDE_SKILLS_DIR"
  ln -sfn "$SCRIPT_DIR/skills/fixture-skill" "$IDE_SKILLS_DIR/fixture-skill"
}

link_commands_too() {
  source_ide_descriptor opencode
  mkdir -p "$IDE_COMMANDS_DIR"
  for f in "$SCRIPT_DIR/skills/fixture-skill/commands/"*.md; do
    ln -sfn "$f" "$IDE_COMMANDS_DIR/$(basename "$f")"
  done
}

# --- Test 1: linked dir but missing command links -> incomplete ------------
t1() {
  rm -rf "$XDG_CONFIG_HOME/opencode"
  SELECTED_IDES=(opencode)
  link_skill_dir_only
  st=$(aggregate_skill_state fixture-skill)
  [ "$st" = "incomplete" ] && pass "T1 dir linked, commands missing -> incomplete" \
    || fail "T1 expected incomplete got '$st'"
}

# --- Test 2: non-interactive incomplete -> relink --------------------------
t2() {
  act=$(prompt_skill_action incomplete fixture-skill)
  [ "$act" = "relink" ] && pass "T2 incomplete -> relink (non-interactive)" \
    || fail "T2 expected relink got '$act'"
}

# --- Test 3: fully linked (dir + commands) -> linked -----------------------
t3() {
  rm -rf "$XDG_CONFIG_HOME/opencode"
  SELECTED_IDES=(opencode)
  link_skill_dir_only
  link_commands_too
  st=$(aggregate_skill_state fixture-skill)
  [ "$st" = "linked" ] && pass "T3 dir+commands linked -> linked" \
    || fail "T3 expected linked got '$st'"
}

# --- Test 4: command-less IDE (cursor) never yields incomplete -------------
t4() {
  rm -rf "$XDG_CONFIG_HOME"/* 2>/dev/null
  SELECTED_IDES=(cursor)
  # link only the skill dir for cursor
  source_ide_descriptor cursor
  if [ "${IDE_SUPPORTS_SYMLINK:-false}" = "true" ] && [ -n "${IDE_SKILLS_DIR:-}" ]; then
    mkdir -p "$IDE_SKILLS_DIR"
    ln -sfn "$SCRIPT_DIR/skills/fixture-skill" "$IDE_SKILLS_DIR/fixture-skill"
    st=$(aggregate_skill_state fixture-skill)
    [ "$st" = "linked" ] && pass "T4 command-less IDE -> linked (no incomplete)" \
      || fail "T4 expected linked got '$st'"
  else
    # cursor may not support symlink skills dir; then it can't be 'linked' anyway
    pass "T4 skipped (cursor has no symlink skills dir)"
  fi
}

# --- Test 5: absent stays absent -------------------------------------------
t5() {
  rm -rf "$XDG_CONFIG_HOME/opencode"
  SELECTED_IDES=(opencode)
  st=$(aggregate_skill_state fixture-skill)
  [ "$st" = "absent" ] && pass "T5 nothing linked -> absent" \
    || fail "T5 expected absent got '$st'"
}

for t in t1 t2 t3 t4 t5; do "$t"; done
printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
