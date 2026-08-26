#!/usr/bin/env bash
# Tests for the Claude Code MCP config location fix in configure-mcp.sh:
#   - install_mcp_claude() writes to ~/.claude.json under the top-level
#     "mcpServers" key (user scope), NOT ~/.claude/settings.json (which
#     Claude Code does not read MCP config from — confirmed via official
#     docs: code.claude.com/docs/en/debug-your-config).
#   - unrelated keys already present in ~/.claude.json (e.g. "projects",
#     "numStartups") are preserved byte-for-byte in structure.
#   - a stale "mcpServers" key in ~/.claude/settings.json is migrated away
#     (removed), while "hooks"/"env"/"model" in that same file are untouched.
#   - the migration is idempotent (second run is a no-op).
#   - detect_mcp_state() and uninstall_mcp() operate correctly against the
#     new ~/.claude.json location for the claude-json format.
#
# Isolated: temp HOME + temp ia-framework dir so the real machine state is
# never touched. Real $HOME is verified untouched via checksum.

set -u

REPO_ROOT=$(CDPATH="" cd "$(dirname "$0")/../.." && pwd)
CONFIGURE_MCP="${REPO_ROOT}/scripts/configure-mcp.sh"
HELPERS="${REPO_ROOT}/scripts/installer-helpers.sh"

PASS=0; FAIL=0
pass() { PASS=$((PASS + 1)); printf 'PASS: %s\n' "$1"; }
fail() { FAIL=$((FAIL + 1)); printf 'FAIL: %s\n' "$1" >&2; }

# --- real $HOME safety net --------------------------------------------------
REAL_HOME_CLAUDE_JSON="${HOME}/.claude.json"
REAL_HOME_SETTINGS_JSON="${HOME}/.claude/settings.json"
_checksum() { [ -f "$1" ] && md5 -q "$1" 2>/dev/null || md5sum "$1" 2>/dev/null | awk '{print $1}'; }
PRE_CLAUDE_JSON_SUM="$(_checksum "$REAL_HOME_CLAUDE_JSON" 2>/dev/null || true)"
PRE_SETTINGS_SUM="$(_checksum "$REAL_HOME_SETTINGS_JSON" 2>/dev/null || true)"

# --- build a sandbox ---------------------------------------------------------
SANDBOX=$(mktemp -d)
trap 'rm -rf "$SANDBOX"' EXIT

export SCRIPT_DIR="$SANDBOX/ia"
mkdir -p "$SCRIPT_DIR/scripts/ide-descriptors" "$SCRIPT_DIR/mcps/ia-framework-mcp"
cp "${REPO_ROOT}/scripts/ide-descriptors/claude-code.sh" "$SCRIPT_DIR/scripts/ide-descriptors/"

# Minimal mcp.json descriptor fixture (mirrors mcps/ia-framework-mcp/mcp.json shape).
cat > "$SCRIPT_DIR/mcps/ia-framework-mcp/mcp.json" <<'JSON'
{
  "id": "ia-framework",
  "name": "ia-framework",
  "default": true,
  "requires_build": true,
  "command_template": ["sh", "-c", "node {{MCP_BIN}} 2>> {{LOG_FILE}}"],
  "environment": { "IA_FRAMEWORK_CONFIG": "{{CONFIG_PATH}}" }
}
JSON

export HOME="$SANDBOX/home"
mkdir -p "$HOME"
export NON_INTERACTIVE=1

# shellcheck disable=SC1090
source "$HELPERS"
# shellcheck disable=SC1090
source "$CONFIGURE_MCP"

CONFIG_PATH="$SANDBOX/ia/.ia-framework/project.json"
mkdir -p "$(dirname "$CONFIG_PATH")"
echo '{}' > "$CONFIG_PATH"

# --- Test 1: install_mcp_claude writes to ~/.claude.json, not settings.json --
t1() {
  mkdir -p "$HOME/.claude"
  cat > "$HOME/.claude.json" <<'JSON'
{
  "numStartups": 16,
  "projects": {
    "/some/other/project": { "mcpServers": {} }
  }
}
JSON
  cat > "$HOME/.claude/settings.json" <<'JSON'
{
  "hooks": { "Stop": [] },
  "model": "opus"
}
JSON

  install_mcp_claude "$SCRIPT_DIR/mcps/ia-framework-mcp/mcp.json" "$HOME/.claude.json" "$SCRIPT_DIR" "$CONFIG_PATH" >/dev/null 2>&1

  local has_entry unrelated_preserved settings_untouched
  has_entry=$(node -e '
    const c = require(process.argv[1]);
    process.stdout.write(c.mcpServers && c.mcpServers["ia-framework"] ? "yes" : "no");
  ' "$HOME/.claude.json")
  unrelated_preserved=$(node -e '
    const c = require(process.argv[1]);
    process.stdout.write(
      c.numStartups === 16 && c.projects && c.projects["/some/other/project"] ? "yes" : "no"
    );
  ' "$HOME/.claude.json")
  settings_untouched=$(node -e '
    const c = require(process.argv[1]);
    process.stdout.write(
      Array.isArray(c.hooks && c.hooks.Stop) && c.model === "opus" && !c.mcpServers ? "yes" : "no"
    );
  ' "$HOME/.claude/settings.json")

  if [ "$has_entry" = "yes" ] && [ "$unrelated_preserved" = "yes" ] && [ "$settings_untouched" = "yes" ]; then
    pass "T1 install_mcp_claude writes mcpServers to ~/.claude.json, preserves unrelated keys, leaves settings.json's own keys alone"
  else
    fail "T1 has_entry=$has_entry unrelated_preserved=$unrelated_preserved settings_untouched=$settings_untouched"
  fi
}

# --- Test 2: migration MOVES stale mcpServers entries from settings.json to
#     ~/.claude.json (never silently discards them), leaves hooks/model intact
t2() {
  rm -rf "$HOME"
  mkdir -p "$HOME/.claude"
  echo '{}' > "$HOME/.claude.json"
  cat > "$HOME/.claude/settings.json" <<'JSON'
{
  "hooks": { "Stop": [{ "hooks": [{ "type": "command", "command": "/x.js" }] }] },
  "model": "opus",
  "mcpServers": {
    "context7": { "command": "npx", "args": ["-y", "@upstash/context7-mcp"] },
    "ia-framework": { "command": "sh", "args": ["-c", "stale"] }
  }
}
JSON

  install_mcp_claude "$SCRIPT_DIR/mcps/ia-framework-mcp/mcp.json" "$HOME/.claude.json" "$SCRIPT_DIR" "$CONFIG_PATH" >/dev/null 2>&1

  local key_gone hooks_intact context7_moved ia_framework_current
  key_gone=$(node -e '
    const c = require(process.argv[1]);
    process.stdout.write(c.mcpServers ? "no" : "yes");
  ' "$HOME/.claude/settings.json")
  hooks_intact=$(node -e '
    const c = require(process.argv[1]);
    process.stdout.write(
      c.model === "opus" &&
      Array.isArray(c.hooks && c.hooks.Stop) &&
      c.hooks.Stop[0].hooks[0].command === "/x.js" ? "yes" : "no"
    );
  ' "$HOME/.claude/settings.json")
  # context7 had no prior entry in ~/.claude.json, so the stale settings.json
  # copy must have been carried over (not discarded).
  context7_moved=$(node -e '
    const c = require(process.argv[1]);
    process.stdout.write(c.mcpServers && c.mcpServers.context7 ? "yes" : "no");
  ' "$HOME/.claude.json")
  # ia-framework: install_mcp_claude just wrote the freshly RESOLVED entry for
  # this run, which must win over the stale "stale" command carried from
  # settings.json (target-file-wins-on-conflict, then install proceeds).
  ia_framework_current=$(node -e '
    const c = require(process.argv[1]);
    const e = c.mcpServers && c.mcpServers["ia-framework"];
    process.stdout.write(e && e.args && e.args[1] !== "stale" ? "yes" : "no");
  ' "$HOME/.claude.json")

  if [ "$key_gone" = "yes" ] && [ "$hooks_intact" = "yes" ] && [ "$context7_moved" = "yes" ] && [ "$ia_framework_current" = "yes" ]; then
    pass "T2 migration moves stale mcpServers entries into ~/.claude.json (not discarded), leaves hooks/model intact, current install wins over a stale carried-over entry"
  else
    fail "T2 key_gone=$key_gone hooks_intact=$hooks_intact context7_moved=$context7_moved ia_framework_current=$ia_framework_current"
  fi
}

# --- Test 3: migration is idempotent (second run is a no-op) ---------------
t3() {
  local before after
  before=$(cat "$HOME/.claude/settings.json")
  _migrate_claude_settings_mcpservers "$HOME/.claude.json" >/dev/null 2>&1
  after=$(cat "$HOME/.claude/settings.json")
  if [ "$before" = "$after" ]; then
    pass "T3 migration idempotent — second run is a no-op"
  else
    fail "T3 settings.json changed on second migration run"
  fi
}

# --- Test 4: detect_mcp_state reads ~/.claude.json (absent -> configured) --
t4() {
  rm -rf "$HOME"
  mkdir -p "$HOME"
  echo '{}' > "$HOME/.claude.json"

  local state_before state_after
  state_before=$(detect_mcp_state "ia-framework" "$HOME/.claude.json" "claude-json")
  install_mcp_claude "$SCRIPT_DIR/mcps/ia-framework-mcp/mcp.json" "$HOME/.claude.json" "$SCRIPT_DIR" "$CONFIG_PATH" >/dev/null 2>&1
  state_after=$(detect_mcp_state "ia-framework" "$HOME/.claude.json" "claude-json")

  if [ "$state_before" = "absent" ] && [ "$state_after" = "configured" ]; then
    pass "T4 detect_mcp_state transitions absent -> configured against ~/.claude.json"
  else
    fail "T4 state_before=$state_before state_after=$state_after"
  fi
}

# --- Test 5: uninstall_mcp removes only the target id from ~/.claude.json --
t5() {
  cat > "$HOME/.claude.json" <<'JSON'
{
  "mcpServers": {
    "ia-framework": { "command": "sh", "args": [] },
    "context7": { "command": "npx", "args": ["-y", "@upstash/context7-mcp"] }
  }
}
JSON

  uninstall_mcp "ia-framework" "$HOME/.claude.json" "claude-json" >/dev/null 2>&1

  local ia_gone context7_kept
  ia_gone=$(node -e '
    const c = require(process.argv[1]);
    process.stdout.write(c.mcpServers && c.mcpServers["ia-framework"] ? "no" : "yes");
  ' "$HOME/.claude.json")
  context7_kept=$(node -e '
    const c = require(process.argv[1]);
    process.stdout.write(c.mcpServers && c.mcpServers["context7"] ? "yes" : "no");
  ' "$HOME/.claude.json")

  if [ "$ia_gone" = "yes" ] && [ "$context7_kept" = "yes" ]; then
    pass "T5 uninstall_mcp removes only the target id, preserves others"
  else
    fail "T5 ia_gone=$ia_gone context7_kept=$context7_kept"
  fi
}

# --- Test 6: claude-code.sh descriptor points IDE_MCP_CONFIG at ~/.claude.json
t6() {
  # shellcheck disable=SC1090
  source "$SCRIPT_DIR/scripts/ide-descriptors/claude-code.sh"
  if [ "$IDE_MCP_CONFIG" = "${HOME}/.claude.json" ] && [ "$IDE_MCP_FORMAT" = "claude-json" ]; then
    pass "T6 claude-code.sh descriptor targets ~/.claude.json"
  else
    fail "T6 IDE_MCP_CONFIG=$IDE_MCP_CONFIG IDE_MCP_FORMAT=$IDE_MCP_FORMAT"
  fi
}

for t in t1 t2 t3 t4 t5 t6; do "$t"; done

# --- real $HOME safety check ------------------------------------------------
POST_CLAUDE_JSON_SUM="$(_checksum "$REAL_HOME_CLAUDE_JSON" 2>/dev/null || true)"
POST_SETTINGS_SUM="$(_checksum "$REAL_HOME_SETTINGS_JSON" 2>/dev/null || true)"
if [ "$PRE_CLAUDE_JSON_SUM" = "$POST_CLAUDE_JSON_SUM" ] && [ "$PRE_SETTINGS_SUM" = "$POST_SETTINGS_SUM" ]; then
  pass "T7 real \$HOME (~/.claude.json, ~/.claude/settings.json) untouched by this test run"
else
  fail "T7 real \$HOME was modified — pre/post checksums differ"
fi

printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
