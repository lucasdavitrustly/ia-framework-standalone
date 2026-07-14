#!/usr/bin/env bash
# Tests for legacy-skill migration in install-skills.sh:
#   - migrate_legacy_skills() removes an old skill directory symlink
#     (e.g. tab-refuter) from every selected IDE.
#   - it removes stale per-file agent/command/hook symlinks that used the old
#     naming.
#   - it deregisters stale hooks from the IDE hook registry
#     (~/.claude/settings.json) by their old command path.
#   - it is idempotent (safe to run twice; a clean tree is a no-op).
#
# Isolated: fake SCRIPT_DIR/skills fixture (post-rename layout) + a temp HOME so
# the real claude-code descriptor resolves into throwaway dirs.

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

# Post-rename skill fixture: refuter (new name) with one command + one hook.
mkdir -p "$SCRIPT_DIR/skills/refuter/commands" "$SCRIPT_DIR/skills/refuter/hooks"
cat > "$SCRIPT_DIR/skills/refuter/skill.json" <<'JSON'
{ "name": "refuter", "version": "2.0.0", "assets": { "skill": true, "agents": false, "commands": true, "hooks": true } }
JSON
echo "# refuter" > "$SCRIPT_DIR/skills/refuter/commands/refuter.md"
echo "// hook"    > "$SCRIPT_DIR/skills/refuter/hooks/refuter-citation-verifier.js"

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

OLD_HOOK_PATH="${HOME}/.claude/hooks/tab-refuter-citation-verifier.js"

seed_legacy_install() {
  # Simulate a pre-rename install of tab-refuter in Claude Code:
  #  - skill dir symlink (dangling — old source no longer exists)
  #  - stale command symlink
  #  - stale hook symlink
  #  - hook registration in settings.json pointing at old hook path
  source_ide_descriptor claude-code
  mkdir -p "$IDE_SKILLS_DIR" "$IDE_COMMANDS_DIR" "$IDE_HOOKS_DIR" "$(dirname "$IDE_MCP_CONFIG")"
  ln -sfn "$SCRIPT_DIR/skills/tab-refuter"                    "$IDE_SKILLS_DIR/tab-refuter"
  ln -sfn "$SCRIPT_DIR/skills/tab-refuter/commands/tab-refuter.md" "$IDE_COMMANDS_DIR/tab-refuter.md"
  ln -sfn "$SCRIPT_DIR/skills/tab-refuter/hooks/tab-refuter-citation-verifier.js" "$OLD_HOOK_PATH"
  cat > "$IDE_MCP_CONFIG" <<JSON
{
  "hooks": {
    "Stop": [
      { "hooks": [ { "type": "command", "command": "${OLD_HOOK_PATH}" } ] }
    ]
  }
}
JSON
}

settings_has_old_hook() {
  grep -q "tab-refuter-citation-verifier.js" "${HOME}/.claude/settings.json" 2>/dev/null
}

# --- Test 1: migration removes legacy skill dir link -----------------------
t1() {
  rm -rf "$HOME/.claude"
  SELECTED_IDES=(claude-code)
  seed_legacy_install
  migrate_legacy_skills >/dev/null 2>&1
  source_ide_descriptor claude-code
  if [ -e "$IDE_SKILLS_DIR/tab-refuter" ] || [ -L "$IDE_SKILLS_DIR/tab-refuter" ]; then
    fail "T1 legacy skill dir link still present"
  else
    pass "T1 legacy skill dir link removed"
  fi
}

# --- Test 2: migration removes stale command + hook symlinks ---------------
t2() {
  source_ide_descriptor claude-code
  local cmd_gone=1 hook_gone=1
  { [ -e "$IDE_COMMANDS_DIR/tab-refuter.md" ] || [ -L "$IDE_COMMANDS_DIR/tab-refuter.md" ]; } && cmd_gone=0
  { [ -e "$OLD_HOOK_PATH" ] || [ -L "$OLD_HOOK_PATH" ]; } && hook_gone=0
  if [ "$cmd_gone" -eq 1 ] && [ "$hook_gone" -eq 1 ]; then
    pass "T2 stale command + hook symlinks removed"
  else
    fail "T2 stale links remain (cmd_gone=$cmd_gone hook_gone=$hook_gone)"
  fi
}

# --- Test 3: migration deregisters stale hook from settings.json -----------
t3() {
  if settings_has_old_hook; then
    fail "T3 old hook still registered in settings.json"
  else
    pass "T3 old hook deregistered from settings.json"
  fi
}

# --- Test 4: idempotent — second run on clean tree is a no-op ---------------
t4() {
  migrate_legacy_skills >/dev/null 2>&1
  local rc=$?
  [ "$rc" -eq 0 ] && pass "T4 second migration run is a clean no-op" \
    || fail "T4 second run returned non-zero ($rc)"
}

for t in t1 t2 t3 t4; do "$t"; done
printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
