#!/usr/bin/env sh
# new-feature-worktree.sh — creates an isolated git worktree for parallel
# development. The worktree is the workspace; no additional branches are created
# beyond what git worktree itself needs. The branch is pushed to remote only at
# delivery time (via /delivery command).
#
# NO dependency on SpecKit / .specify/.
#
# Usage:
#   new-feature-worktree.sh --json [--repo <path>] [--ticket <KEY>] [--short-name "<name>"] [--kind feature|quick] "<description>"
#
# --repo <path>  Target repository root. When provided, the worktree is created
#                from THIS repo (cd's into it before any git operation). When
#                omitted, falls back to the CWD-based git discovery (original
#                behavior). ALWAYS pass this when the agent's CWD differs from
#                the product code repository.
#
# When --ticket is provided (e.g., --ticket DEV-277503), the ticket key is used
# as the prefix for the worktree name: DEV-277503-<slug>.
# When --ticket is NOT provided, a sequential number <NNN> is computed from
# .specs/features, .specs/quick, and existing git branches.
#
# Creates:
#   - Worktree: <REPO_ROOT>/../worktrees/<prefix>-<slug>
#   - Marker:   <WORKTREE_PATH>/.worktree  (holds the absolute worktree path;
#               used by assert-in-worktree.sh so every later phase stays inside)
#
# git worktree add creates a local branch with the same name as the directory.
# This is purely local — no push happens until /delivery.
#
# If the worktree already exists, just reports its path (no overwrite).
# Emits JSON {FEATURE_NUM,KIND,WORKTREE_PATH,BRANCH_NAME}.

set -u

JSON=false
SHORT_NAME=""
KIND="feature"
DESCRIPTION=""
TICKET=""
TARGET_REPO=""

while [ $# -gt 0 ]; do
  case "$1" in
    --json) JSON=true; shift ;;
    --short-name) SHORT_NAME="${2:-}"; shift 2 ;;
    --kind) KIND="${2:-feature}"; shift 2 ;;
    --ticket) TICKET="${2:-}"; shift 2 ;;
    --repo) TARGET_REPO="${2:-}"; shift 2 ;;
    --) shift; DESCRIPTION="${1:-}"; shift || true ;;
    -*) echo "Error: unknown option '$1'" >&2; exit 2 ;;
    *) DESCRIPTION="$1"; shift ;;
  esac
done

case "$KIND" in
  feature|quick) : ;;
  *) echo "Error: --kind must be 'feature' or 'quick'" >&2; exit 2 ;;
esac

# --- git repo check ---------------------------------------------------------
# If --repo was provided, cd into it BEFORE any git operation so the worktree
# is created from the correct repository (not from whatever repo the CWD
# happens to belong to).
if [ -n "$TARGET_REPO" ]; then
  if [ ! -d "$TARGET_REPO" ]; then
    echo "Error: --repo path does not exist: $TARGET_REPO" >&2; exit 1
  fi
  cd "$TARGET_REPO" || exit 1
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Error: not a git repository. Run this inside a git repo." >&2
  exit 1
fi

REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || {
  echo "Error: could not determine git repository root." >&2; exit 1; }
cd "$REPO_ROOT" || exit 1

# --- require slug source ----------------------------------------------------
if [ -z "$SHORT_NAME" ] && [ -z "$DESCRIPTION" ]; then
  echo "Error: provide a description or --short-name to derive the slug." >&2
  exit 2
fi

# --- helpers ----------------------------------------------------------------

_highest_from_lines() {
  highest=0
  while IFS= read -r line; do
    case "$line" in
      [0-9][0-9][0-9]*-*|[0-9][0-9][0-9][0-9]*-*|[0-9]*-*)
        num=$(printf '%s' "$line" | sed -n 's/^\([0-9][0-9]*\)-.*/\1/p')
        [ -z "$num" ] && continue
        n=$((10#$num))
        [ "$n" -gt "$highest" ] && highest=$n
        ;;
    esac
  done
  echo "$highest"
}

_highest_from_dir() {
  dir="$1"
  [ -d "$dir" ] || { echo 0; return; }
  ls -1 "$dir" 2>/dev/null | _highest_from_lines
}

_highest_from_local_branches() {
  git branch --format='%(refname:short)' 2>/dev/null | _highest_from_lines
}

_highest_from_remote_branches() {
  highest=0
  for remote in $(git remote 2>/dev/null); do
    rh=$(GIT_TERMINAL_PROMPT=0 git ls-remote --heads "$remote" 2>/dev/null \
      | sed 's|.*refs/heads/||' | _highest_from_lines)
    [ "${rh:-0}" -gt "$highest" ] && highest=$rh
  done
  echo "$highest"
}

_clean_slug() {
  printf '%s' "$1" \
    | tr '[:upper:]' '[:lower:]' \
    | sed 's/[^a-z0-9]/-/g; s/--*/-/g; s/^-//; s/-$//'
}

_slug_from_description() {
  desc="$1"
  stop='^(i|a|an|the|to|for|of|in|on|at|by|with|from|is|are|was|were|be|been|being|have|has|had|do|does|did|will|would|should|could|can|may|might|must|shall|this|that|these|those|my|your|our|their|want|need|add|get|set)$'
  words=$(printf '%s' "$desc" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/ /g')
  meaningful=""
  count=0
  for w in $words; do
    [ -z "$w" ] && continue
    printf '%s\n' "$w" | grep -qiE "$stop" && continue
    [ ${#w} -lt 3 ] && continue
    meaningful="$meaningful $w"
    count=$((count + 1))
  done
  set -- $meaningful
  total=$#
  max=3
  [ "$total" -eq 4 ] && max=4
  result=""
  i=0
  for w in "$@"; do
    [ "$i" -ge "$max" ] && break
    result="${result:+$result-}$w"
    i=$((i + 1))
  done
  if [ -z "$result" ]; then
    result=$(_clean_slug "$desc" | tr '-' '\n' | grep -v '^$' | head -3 | tr '\n' '-' | sed 's/-$//')
  fi
  echo "$result"
}

# --- compute prefix (ticket key OR sequential number) -----------------------
if [ -n "$TICKET" ]; then
  # Use ticket key as-is (e.g., DEV-277503)
  FEATURE_NUM="$TICKET"
else
  # Sequential numbering (original behavior)
  hf=$(_highest_from_dir ".specs/features")
  hq=$(_highest_from_dir ".specs/quick")
  hl=$(_highest_from_local_branches)
  hr=$(_highest_from_remote_branches)

  max=0
  for n in "$hf" "$hq" "$hl" "$hr"; do
    n=${n:-0}
    [ "$n" -gt "$max" ] && max=$n
  done
  NEXT=$((max + 1))
  FEATURE_NUM=$(printf '%03d' "$NEXT")
fi

# --- derive slug ------------------------------------------------------------
if [ -n "$SHORT_NAME" ]; then
  SLUG=$(_clean_slug "$SHORT_NAME")
else
  SLUG=$(_slug_from_description "$DESCRIPTION")
fi
[ -z "$SLUG" ] && SLUG="feature"

FINAL_BRANCH_NAME="${FEATURE_NUM}-${SLUG}"

# --- enforce 244-byte git branch limit (for the future branch name) ---------
byte_len=$(printf '%s' "$FINAL_BRANCH_NAME" | LC_ALL=C wc -c | tr -d ' ')
if [ "$byte_len" -gt 244 ]; then
  prefix_len=$(( ${#FEATURE_NUM} + 1 ))
  max_suffix=$(( 244 - prefix_len ))
  SLUG=$(printf '%s' "$SLUG" | cut -c1-"$max_suffix" | sed 's/-$//')
  FINAL_BRANCH_NAME="${FEATURE_NUM}-${SLUG}"
fi

# --- worktree setup ---------------------------------------------------------
WORKTREES_DIR="$(dirname "$REPO_ROOT")/worktrees"
WORKTREE_PATH="${WORKTREES_DIR}/${FINAL_BRANCH_NAME}"

# git worktree add is NOT safe under concurrency: parallel invocations race on
# .git/worktrees/ bookkeeping and one ends up with a half-created worktree
# (directory on disk, but no valid git metadata -> "not a git repository").
# Serialize creation with a lock so parallel callers (e.g. an orchestrator
# fanning out several tickets) are safe. Falls back to a mkdir-based lock when
# flock is unavailable (e.g. stock macOS).
_git_worktree_add() {
  # Capture stderr so a real failure is surfaced (never silently swallowed).
  _err=$(git worktree add "$WORKTREE_PATH" 2>&1) || {
    echo "Error: failed to create worktree at $WORKTREE_PATH" >&2
    [ -n "$_err" ] && echo "  git: $_err" >&2
    # Roll back a half-created worktree dir so a retry can succeed cleanly.
    git worktree prune >/dev/null 2>&1 || true
    return 1
  }
  return 0
}

if [ -d "$WORKTREE_PATH" ]; then
  # Worktree already exists — just report it
  :
else
  mkdir -p "$WORKTREES_DIR"
  GIT_DIR_COMMON=$(git rev-parse --git-common-dir 2>/dev/null || echo "$REPO_ROOT/.git")
  LOCK_FILE="${GIT_DIR_COMMON}/tlc-worktree.lock"

  if command -v flock >/dev/null 2>&1; then
    # Serialize the whole "add" under an flock on a dedicated lock file.
    exec 9>"$LOCK_FILE" 2>/dev/null || true
    flock 9 2>/dev/null
    _git_worktree_add || { flock -u 9 2>/dev/null; exit 1; }
    flock -u 9 2>/dev/null
  else
    # Portable mkdir-based mutex (atomic create) with bounded wait.
    LOCK_DIR="${LOCK_FILE}.d"
    _tries=0
    while ! mkdir "$LOCK_DIR" 2>/dev/null; do
      _tries=$((_tries + 1))
      [ "$_tries" -gt 300 ] && break   # ~30s max, then proceed best-effort
      sleep 0.1
    done
    _git_worktree_add
    _rc=$?
    rmdir "$LOCK_DIR" 2>/dev/null || true
    [ "$_rc" -ne 0 ] && exit 1
  fi
fi

# --- persist worktree path marker (source of truth across sessions) ---------
# Write a ".worktree" marker at the worktree root holding the absolute path.
# The guard (assert-in-worktree.sh) reads this to verify all later phases
# (design/tasks/execute/quick/resume) operate INSIDE this worktree. Idempotent.
ABS_WORKTREE_PATH=$( ( CDPATH="" cd "$WORKTREE_PATH" 2>/dev/null && pwd -P ) || printf '%s' "$WORKTREE_PATH" )
printf '%s\n' "$ABS_WORKTREE_PATH" > "$WORKTREE_PATH/.worktree" 2>/dev/null || true

# --- output -----------------------------------------------------------------
if [ "$JSON" = true ]; then
  printf '{"FEATURE_NUM":"%s","KIND":"%s","WORKTREE_PATH":"%s","BRANCH_NAME":"%s"}\n' \
    "$FEATURE_NUM" "$KIND" "$WORKTREE_PATH" "$FINAL_BRANCH_NAME"
else
  echo "Worktree ready: $WORKTREE_PATH"
  echo "  Branch (local): $FINAL_BRANCH_NAME (push only at /delivery)"
  echo "  Feature num:    $FEATURE_NUM (kind: $KIND)"
fi
