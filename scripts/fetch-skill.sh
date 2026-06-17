#!/usr/bin/env bash
# fetch-skill.sh — Update a vendored skill from its upstream source
#
# Usage: ./scripts/fetch-skill.sh <skill-name>
#        ./scripts/fetch-skill.sh --list
#
# Full replace strategy: deletes existing skill directory contents and
# replaces entirely with freshly downloaded content, then updates skill.json version.
# Because IDEs are live-linked, the update is immediately visible everywhere.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

# ──────────────────────────────────────────────────────────────────────────────
# usage
# ──────────────────────────────────────────────────────────────────────────────
usage() {
  echo ""
  echo -e "${BOLD}fetch-skill.sh${NC} — Update a vendored skill from its upstream source"
  echo ""
  echo "Usage:"
  echo "  ./scripts/fetch-skill.sh <skill-name>   Fetch/update a specific skill"
  echo "  ./scripts/fetch-skill.sh --list         List available skills and their versions"
  echo "  ./scripts/fetch-skill.sh --help         Show this help"
  echo ""
  echo "Available skills:"
  for d in "${SCRIPT_DIR}/skills"/*/skill.json; do
    [ -f "$d" ] || continue
    local name version upstream
    name=$(node --input-type=module <<EOF
import { readFileSync } from 'fs';
try { const s = JSON.parse(readFileSync('${d}','utf8')); process.stdout.write(s.name||''); } catch {}
EOF
)
    version=$(node --input-type=module <<EOF
import { readFileSync } from 'fs';
try { const s = JSON.parse(readFileSync('${d}','utf8')); process.stdout.write(s.version||''); } catch {}
EOF
)
    echo -e "  ${name} ${BLUE}(v${version})${NC}"
  done
  echo ""
}

# ──────────────────────────────────────────────────────────────────────────────
# list_skills
# ──────────────────────────────────────────────────────────────────────────────
list_skills() {
  echo ""
  echo -e "${BOLD}Vendored skills:${NC}"
  for d in "${SCRIPT_DIR}/skills"/*/skill.json; do
    [ -f "$d" ] || continue
    node --input-type=module <<EOF
import { readFileSync } from 'fs';
try {
  const s = JSON.parse(readFileSync('${d}','utf8'));
  console.log(\`  \${s.name} (v\${s.version}) — \${s.description}\`);
  console.log(\`    upstream: \${s.upstream}\`);
} catch {}
EOF
    echo ""
  done
}

# ──────────────────────────────────────────────────────────────────────────────
# fetch_skill SKILL_NAME
# Full replace: delete contents, download fresh, update version.
# ──────────────────────────────────────────────────────────────────────────────
fetch_skill() {
  local skill_name="$1"
  local skill_dir="${SCRIPT_DIR}/skills/${skill_name}"
  local skill_json="${skill_dir}/skill.json"

  if [ ! -f "$skill_json" ]; then
    echo -e "${RED}✗${NC} Skill not found: ${skill_name}"
    echo -e "  Available: $(ls "${SCRIPT_DIR}/skills/" | tr '\n' ' ')"
    exit 1
  fi

  local upstream version
  upstream=$(node --input-type=module <<EOF
import { readFileSync } from 'fs';
try { const s = JSON.parse(readFileSync('${skill_json}','utf8')); process.stdout.write(s.upstream||''); } catch {}
EOF
)
  version=$(node --input-type=module <<EOF
import { readFileSync } from 'fs';
try { const s = JSON.parse(readFileSync('${skill_json}','utf8')); process.stdout.write(s.version||''); } catch {}
EOF
)

  if [ -z "$upstream" ]; then
    echo -e "${RED}✗${NC} No upstream URL in skill.json for: ${skill_name}"
    exit 1
  fi

  echo -e "${BOLD}Fetching ${skill_name} from upstream...${NC}"
  echo -e "  Current version: ${BLUE}v${version}${NC}"
  echo -e "  Upstream: ${upstream}"
  echo ""

  # Create temp directory for download
  local tmpdir
  tmpdir=$(mktemp -d)
  trap 'rm -rf "$tmpdir"' EXIT

  # Determine fetch strategy based on upstream URL format
  if echo "$upstream" | grep -q "github.com.*tree/"; then
    _fetch_github_subdir "$upstream" "$tmpdir" "$skill_name"
  elif echo "$upstream" | grep -q "github.com"; then
    _fetch_github_repo "$upstream" "$tmpdir"
  else
    echo -e "${RED}✗${NC} Unsupported upstream URL format: ${upstream}"
    echo "  Supported: GitHub repository URLs or GitHub tree/ URLs"
    exit 1
  fi

  # Preserve skill.json (we update it separately)
  local old_skill_json_content
  old_skill_json_content=$(cat "$skill_json")

  # Full replace: remove existing contents, copy fresh
  echo -e "  ${YELLOW}→${NC} Replacing skill contents (full replace)..."
  find "$skill_dir" -mindepth 1 -not -name 'skill.json' -delete 2>/dev/null || true

  # Copy from temp (exclude any skill.json from upstream — we manage ours)
  rsync -a --exclude='skill.json' "${tmpdir}/content/" "${skill_dir}/" 2>/dev/null || \
    cp -r "${tmpdir}/content/." "${skill_dir}/"

  # Restore and update skill.json with new version from upstream (if available)
  local new_version
  new_version=$(cat "${tmpdir}/content/skill.json" 2>/dev/null | \
    node --input-type=module <<'EOF'
const chunks = [];
process.stdin.on('data', d => chunks.push(d));
process.stdin.on('end', () => {
  try { const s = JSON.parse(chunks.join('')); process.stdout.write(s.version||''); } catch {}
});
EOF
  ) || true

  if [ -z "$new_version" ]; then
    # Bump patch version if no upstream version info
    new_version=$(echo "$version" | python3 -c "
import sys
v = sys.stdin.read().strip().split('.')
v[-1] = str(int(v[-1]) + 1)
print('.'.join(v))
")
  fi

  # Write updated skill.json
  echo "$old_skill_json_content" | \
  NEW_VERSION="$new_version" \
  node --input-type=module <<'EOF'
import { readFileSync, writeFileSync } from 'fs';
const chunks = [];
process.stdin.on('data', d => chunks.push(d));
process.stdin.on('end', () => {
  const s = JSON.parse(chunks.join(''));
  s.version = process.env.NEW_VERSION;
  writeFileSync(process.env.SKILL_JSON_PATH, JSON.stringify(s, null, 2) + '\n');
});
EOF

  echo ""
  echo -e "${GREEN}✓${NC} ${skill_name} updated: v${version} → v${new_version}"
  echo -e "  ${BLUE}ℹ${NC} All IDEs with a live link to this skill will see the update immediately."
}

# ──────────────────────────────────────────────────────────────────────────────
# _fetch_github_subdir TREE_URL TMPDIR SKILL_NAME
# Downloads a specific subdirectory from a GitHub repository tree URL.
# ──────────────────────────────────────────────────────────────────────────────
_fetch_github_subdir() {
  local tree_url="$1"
  local tmpdir="$2"
  local skill_name="$3"

  # Parse: https://github.com/owner/repo/tree/branch/path/to/dir
  local repo_path
  repo_path=$(echo "$tree_url" | sed 's|https://github.com/||' | sed 's|/tree/[^/]*/||')
  local owner_repo
  owner_repo=$(echo "$tree_url" | sed 's|https://github.com/||' | cut -d'/' -f1-2)
  local branch
  branch=$(echo "$tree_url" | grep -o '/tree/[^/]*/' | sed 's|/tree/||;s|/||')
  local subpath
  subpath=$(echo "$tree_url" | sed "s|https://github.com/${owner_repo}/tree/${branch}/||")

  echo -e "  ${YELLOW}→${NC} Cloning from ${owner_repo} (sparse: ${subpath})..."

  # Use git sparse-checkout for efficiency
  mkdir -p "${tmpdir}/repo"
  git clone --depth 1 --filter=blob:none --sparse \
    "https://github.com/${owner_repo}.git" "${tmpdir}/repo" 2>&1 | tail -3

  (cd "${tmpdir}/repo" && git sparse-checkout set "$subpath" 2>&1 | tail -2)

  local src_path="${tmpdir}/repo/${subpath}"
  if [ ! -d "$src_path" ]; then
    echo -e "${RED}✗${NC} Could not find skill directory at: ${subpath}"
    exit 1
  fi

  mkdir -p "${tmpdir}/content"
  cp -r "${src_path}/." "${tmpdir}/content/"
}

# ──────────────────────────────────────────────────────────────────────────────
# _fetch_github_repo REPO_URL TMPDIR
# Clones a full GitHub repository.
# ──────────────────────────────────────────────────────────────────────────────
_fetch_github_repo() {
  local repo_url="$1"
  local tmpdir="$2"

  # Strip trailing .git if present; normalise to https
  repo_url=$(echo "$repo_url" | sed 's|\.git$||')
  local clone_url="${repo_url}.git"

  echo -e "  ${YELLOW}→${NC} Cloning ${clone_url}..."
  git clone --depth 1 "${clone_url}" "${tmpdir}/repo" 2>&1 | tail -3

  # The skill content is the repo root
  mkdir -p "${tmpdir}/content"
  rsync -a --exclude='.git/' "${tmpdir}/repo/" "${tmpdir}/content/" 2>/dev/null || \
    cp -r "${tmpdir}/repo/." "${tmpdir}/content/"
}

# ──────────────────────────────────────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────────────────────────────────────
case "${1:-}" in
  --help|-h)
    usage
    exit 0
    ;;
  --list|-l)
    list_skills
    exit 0
    ;;
  "")
    echo -e "${RED}✗${NC} No skill name provided."
    usage
    exit 1
    ;;
  *)
    SKILL_JSON_PATH="${SCRIPT_DIR}/skills/${1}/skill.json" fetch_skill "$1"
    ;;
esac
