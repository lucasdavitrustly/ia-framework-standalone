#!/usr/bin/env bash
# Tests for scripts/uninstall.sh:
#   - T10: the 25 top-level `local` keywords are stripped, so the script no
#     longer aborts at line 63 under `set -euo pipefail`; `--dry-run` reaches
#     the removal-plan report and exits 0.
#   - T11: remove_deprecated_skills is wired in before the per-descriptor
#     loop, so a seeded deprecated-skill trace is purged by `--yes`.
#
# uninstall.sh has top-level statements and defines zero functions, so it
# cannot be sourced and called like install-skills.sh — it is exec'd as a
# subprocess with a redirected HOME, per the Test Coverage Matrix (tasks.md).
# The real $HOME is never touched: HOME is only ever set for the *subprocess*
# invocation below, never exported into this test script's own shell.

set -u

REPO_ROOT=$(CDPATH="" cd "$(dirname "$0")/../.." && pwd)
UNINSTALL="${REPO_ROOT}/scripts/uninstall.sh"
REAL_SETTINGS="${HOME}/.claude/settings.json"

PASS=0; FAIL=0
pass() { PASS=$((PASS + 1)); printf 'PASS: %s\n' "$1"; }
fail() { FAIL=$((FAIL + 1)); printf 'FAIL: %s\n' "$1" >&2; }

# --- checksum the REAL $HOME registry before any subprocess runs -----------
real_settings_before=""
if [ -f "$REAL_SETTINGS" ]; then
  real_settings_before="$(cksum "$REAL_SETTINGS")"
fi

# --- build a sandbox (never assigned to $HOME in THIS shell) ---------------
SANDBOX=$(mktemp -d)
echo "sandbox for uninstall-deprecated-skills.test.sh: ${SANDBOX}"
trap 'rm -rf "$SANDBOX"' EXIT

# ─────────────────────────────────────────────────────────────────────────────
# T10: bash -n is clean; --dry-run with a redirected HOME exits 0 and reaches
# the removal-plan report (a deprecated-skill trace is seeded so the report
# has content to show).
# ─────────────────────────────────────────────────────────────────────────────

# --- Test 1: bash -n scripts/uninstall.sh is syntactically clean ------------
t1() {
  if bash -n "$UNINSTALL" 2>/tmp/uds-t1-err.$$; then
    pass "T1 bash -n scripts/uninstall.sh is clean"
  else
    fail "T1 bash -n failed: $(cat /tmp/uds-t1-err.$$)"
  fi
  rm -f /tmp/uds-t1-err.$$
}

# --- Test 2: --dry-run with a redirected HOME exits 0 and reaches the
# removal-plan report (D-1 repaired; previously aborted at line 63) ---------
t2() {
  local sandbox_home="${SANDBOX}/home-t2"
  mkdir -p "${sandbox_home}/.agents/skills"
  # Seed a real, harmless skill link (mcp-bench, source exists) so the
  # dry-run report has a line to show — proving execution reached past the
  # former abort point, through the scan, to the report.
  ln -sfn "${REPO_ROOT}/skills/mcp-bench" "${sandbox_home}/.agents/skills/mcp-bench"
  mkdir -p "${sandbox_home}/.codex"
  touch "${sandbox_home}/.codex/config.toml"

  local out rc
  out="$(HOME="$sandbox_home" NON_INTERACTIVE=1 bash "$UNINSTALL" --dry-run </dev/null 2>&1)"
  rc=$?

  if [ "$rc" -eq 0 ] && case "$out" in *"Items that will be removed"*) true ;; *) false ;; esac; then
    pass "T2 --dry-run with redirected HOME exits 0 and reaches the removal-plan report"
  else
    fail "T2 rc=$rc out=[$out]"
  fi
}

for t in t1 t2; do "$t"; done

# ─────────────────────────────────────────────────────────────────────────────
# T11: remove_deprecated_skills is wired in before the per-descriptor loop
# ─────────────────────────────────────────────────────────────────────────────

seed_deprecated_refuter_trace() {
  # $1 = sandbox home. Seeds a claude-code refuter skill-dir symlink + a
  # registered hook, matching the live claude-code orphan/linked shape.
  local sandbox_home="$1"
  local fake_src="${sandbox_home}-fake-refuter-src"
  mkdir -p "$fake_src"
  mkdir -p "${sandbox_home}/.claude/skills" "${sandbox_home}/.claude/hooks"
  ln -sfn "$fake_src" "${sandbox_home}/.claude/skills/refuter"
  touch "${sandbox_home}/.claude/hooks/refuter-citation-verifier.js"
  cat > "${sandbox_home}/.claude/settings.json" <<JSON
{ "hooks": { "Stop": [ { "hooks": [ { "type": "command", "command": "${sandbox_home}/.claude/hooks/refuter-citation-verifier.js" } ] } ] } }
JSON
}

# --- Test 3: sandboxed --yes removes the seeded deprecated skill-dir link
# and purges its hook registration; grep -c 'refuter' settings.json is 0 ---
t3() {
  local sandbox_home="${SANDBOX}/home-t3"
  seed_deprecated_refuter_trace "$sandbox_home"

  local out rc
  out="$(HOME="$sandbox_home" NON_INTERACTIVE=1 bash "$UNINSTALL" --yes </dev/null 2>&1)"
  rc=$?

  local link_gone=0 registry_clean=0 refuter_count
  { [ ! -e "${sandbox_home}/.claude/skills/refuter" ] && [ ! -L "${sandbox_home}/.claude/skills/refuter" ]; } && link_gone=1
  refuter_count="$(grep -c 'refuter' "${sandbox_home}/.claude/settings.json" 2>/dev/null)"
  [ -z "$refuter_count" ] && refuter_count=0
  [ "$refuter_count" -eq 0 ] && registry_clean=1

  if [ "$rc" -eq 0 ] && [ "$link_gone" -eq 1 ] && [ "$registry_clean" -eq 1 ]; then
    pass "T3 sandboxed --yes purges seeded deprecated skill link and hook registration"
  else
    fail "T3 rc=$rc link_gone=$link_gone registry_clean=$registry_clean out=[$out]"
  fi
}

# --- Test 4: --dry-run still changes nothing (deprecated trace included) ---
t4() {
  local sandbox_home="${SANDBOX}/home-t4"
  seed_deprecated_refuter_trace "$sandbox_home"

  local before after rc
  before="$(find "$sandbox_home" | sort)"
  HOME="$sandbox_home" NON_INTERACTIVE=1 bash "$UNINSTALL" --dry-run </dev/null >/dev/null 2>&1
  rc=$?
  after="$(find "$sandbox_home" | sort)"

  if [ "$rc" -eq 0 ] && [ "$before" = "$after" ]; then
    pass "T4 --dry-run changes nothing, including a seeded deprecated trace"
  else
    fail "T4 rc=$rc before_eq_after=$([ "$before" = "$after" ] && echo yes || echo no)"
  fi
}

for t in t3 t4; do "$t"; done

# ─────────────────────────────────────────────────────────────────────────────
# Fix 1 (Verifier gap): a completely empty $HOME (no IDE configured at all,
# so DETECTED_IDES ends up genuinely empty) must not abort under set -u when
# the deprecated-skill pre-check iterates "${DETECTED_IDES[@]}".
# ─────────────────────────────────────────────────────────────────────────────

# --- Test 5: --dry-run on a fully empty HOME exits 0, does not abort -------
t5() {
  local sandbox_home="${SANDBOX}/home-t5-empty"
  mkdir -p "$sandbox_home"

  local out rc
  out="$(HOME="$sandbox_home" NON_INTERACTIVE=1 bash "$UNINSTALL" --dry-run </dev/null 2>&1)"
  rc=$?

  if [ "$rc" -eq 0 ] && case "$out" in *"unbound variable"*) false ;; *) true ;; esac; then
    pass "T5 --dry-run on a fully empty HOME (no IDE detected) exits 0, no abort"
  else
    fail "T5 rc=$rc out=[$out]"
  fi
}

for t in t5; do "$t"; done

# --- Safety guard (not a counted PASS/FAIL test): confirm no subprocess
# above ever touched the REAL $HOME registry. Hard-fails the whole run —
# distinct from the file's 4 spec-mandated PASS/FAIL assertions above — if a
# redirected-HOME subprocess somehow leaked into the real machine state.
real_settings_after=""
if [ -f "$REAL_SETTINGS" ]; then
  real_settings_after="$(cksum "$REAL_SETTINGS")"
fi
if [ "$real_settings_before" != "$real_settings_after" ]; then
  printf 'SAFETY FAILURE: real $HOME/.claude/settings.json was modified by this test run\n' >&2
  exit 2
fi

printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
