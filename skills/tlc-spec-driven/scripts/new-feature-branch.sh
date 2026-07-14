#!/usr/bin/env sh
# new-feature-branch.sh — self-contained git branch + sequential numbering for
# the tlc-spec-driven skill. NO dependency on SpecKit / .specify/.
#
# Contract: specs/018-tlc-spec-driven-commands/contracts/branch-helper.md
#
# Usage:
#   new-feature-branch.sh --json [--short-name "<name>"] [--kind feature|quick] "<description>"
#
# Numbering source of truth: highest of
#   - .specs/features/<NNN>-*    directories
#   - .specs/quick/<NNN>-*       directories
#   - local git branches         <NNN>-*
#   - remote git branches        <NNN>-*  (best-effort; skipped if unreachable)
# Next number = max + 1, zero-padded to 3 digits (base-10 forced to avoid octal).
#
# Branch name: <NNN>-<slug>. Created from CURRENT HEAD. If it already exists,
# switch to it (never overwrite/reset). Emits JSON {BRANCH_NAME,FEATURE_NUM,KIND}.

set -u

JSON=false
SHORT_NAME=""
KIND="feature"
DESCRIPTION=""

while [ $# -gt 0 ]; do
  case "$1" in
    --json) JSON=true; shift ;;
    --short-name) SHORT_NAME="${2:-}"; shift 2 ;;
    --kind) KIND="${2:-feature}"; shift 2 ;;
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
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Error: not a git repository. Run this inside a git repo to create a branch." >&2
  exit 1
fi

REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || {
  echo "Error: could not determine git repository root." >&2; exit 1; }
cd "$REPO_ROOT" || exit 1

# --- require slug source ----------------------------------------------------
if [ -z "$SHORT_NAME" ] && [ -z "$DESCRIPTION" ]; then
  echo "Error: provide a description or --short-name to derive the branch slug." >&2
  exit 2
fi

# --- helpers ----------------------------------------------------------------

# Extract the highest NNN prefix from stdin lines like "007-foo".
_highest_from_lines() {
  highest=0
  while IFS= read -r line; do
    case "$line" in
      [0-9][0-9][0-9]*-*|[0-9][0-9][0-9][0-9]*-*|[0-9]*-*)
        num=$(printf '%s' "$line" | sed -n 's/^\([0-9][0-9]*\)-.*/\1/p')
        [ -z "$num" ] && continue
        # force base-10 to avoid octal interpretation of leading zeros
        n=$((10#$num))
        [ "$n" -gt "$highest" ] && highest=$n
        ;;
    esac
  done
  echo "$highest"
}

_highest_from_dir() {
  # $1 = directory; list immediate child dir names.
  dir="$1"
  [ -d "$dir" ] || { echo 0; return; }
  ls -1 "$dir" 2>/dev/null | _highest_from_lines
}

_highest_from_local_branches() {
  git branch --format='%(refname:short)' 2>/dev/null | _highest_from_lines
}

_highest_from_remote_branches() {
  # best-effort; never blocks on auth
  highest=0
  for remote in $(git remote 2>/dev/null); do
    rh=$(GIT_TERMINAL_PROMPT=0 git ls-remote --heads "$remote" 2>/dev/null \
      | sed 's|.*refs/heads/||' | _highest_from_lines)
    [ "${rh:-0}" -gt "$highest" ] && highest=$rh
  done
  echo "$highest"
}

# Slug: lowercase, non-alnum -> '-', collapse '--', trim leading/trailing '-'.
_clean_slug() {
  printf '%s' "$1" \
    | tr '[:upper:]' '[:lower:]' \
    | sed 's/[^a-z0-9]/-/g; s/--*/-/g; s/^-//; s/-$//'
}

# Description-derived slug: drop stop-words, keep first 3 meaningful words
# (4 if exactly 4), then clean.
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
  # trim
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
    # fallback: first 3 dash-parts of a cleaned description
    result=$(_clean_slug "$desc" | tr '-' '\n' | grep -v '^$' | head -3 | tr '\n' '-' | sed 's/-$//')
  fi
  echo "$result"
}

# --- compute next number ----------------------------------------------------
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

# --- derive slug ------------------------------------------------------------
if [ -n "$SHORT_NAME" ]; then
  SLUG=$(_clean_slug "$SHORT_NAME")
else
  SLUG=$(_slug_from_description "$DESCRIPTION")
fi
[ -z "$SLUG" ] && SLUG="feature"

BRANCH_NAME="${FEATURE_NUM}-${SLUG}"

# --- enforce 244-byte git branch limit --------------------------------------
byte_len=$(printf '%s' "$BRANCH_NAME" | LC_ALL=C wc -c | tr -d ' ')
if [ "$byte_len" -gt 244 ]; then
  prefix_len=$(( ${#FEATURE_NUM} + 1 ))
  max_suffix=$(( 244 - prefix_len ))
  SLUG=$(printf '%s' "$SLUG" | cut -c1-"$max_suffix" | sed 's/-$//')
  BRANCH_NAME="${FEATURE_NUM}-${SLUG}"
fi

# --- create or switch (from current HEAD; never overwrite) ------------------
if git show-ref --verify --quiet "refs/heads/${BRANCH_NAME}"; then
  git checkout -q "$BRANCH_NAME" || { echo "Error: failed to switch to existing branch $BRANCH_NAME" >&2; exit 1; }
else
  git checkout -q -b "$BRANCH_NAME" || { echo "Error: failed to create branch $BRANCH_NAME" >&2; exit 1; }
fi

# --- output -----------------------------------------------------------------
if [ "$JSON" = true ]; then
  printf '{"BRANCH_NAME":"%s","FEATURE_NUM":"%s","KIND":"%s"}\n' "$BRANCH_NAME" "$FEATURE_NUM" "$KIND"
else
  echo "Created/switched to branch: $BRANCH_NAME (num $FEATURE_NUM, kind $KIND)"
fi
