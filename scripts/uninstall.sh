#!/usr/bin/env bash
# uninstall.sh — Full teardown of all ia-framework MCPs and skill links
#
# Usage: ./scripts/uninstall.sh [--dry-run] [--yes]
#
# Removes all MCPs and skill links for all IDEs in a single operation.
# Prompts for confirmation before making any changes.
# Reports a summary of what was removed.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

DRY_RUN=false
FORCE_YES=false

# Parse args
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    --yes|-y)  FORCE_YES=true ;;
    --help|-h)
      echo ""
      echo -e "${BOLD}uninstall.sh${NC} — Remove all ia-framework MCPs and skill links"
      echo ""
      echo "Usage:"
      echo "  ./scripts/uninstall.sh              Interactive uninstall with confirmation"
      echo "  ./scripts/uninstall.sh --dry-run    Show what would be removed without removing"
      echo "  ./scripts/uninstall.sh --yes        Skip confirmation prompt"
      echo "  ./scripts/uninstall.sh --help       Show this help"
      echo ""
      exit 0
      ;;
  esac
done

# Source shared helpers
# shellcheck source=scripts/installer-helpers.sh
source "${SCRIPT_DIR}/scripts/installer-helpers.sh"
# shellcheck source=scripts/install-skills.sh
source "${SCRIPT_DIR}/scripts/install-skills.sh"
# shellcheck source=scripts/configure-mcp.sh
source "${SCRIPT_DIR}/scripts/configure-mcp.sh"

echo ""
echo -e "${BOLD}ia-framework Uninstaller${NC}"
echo -e "${YELLOW}This will remove all ia-framework MCP configurations and skill links from all IDEs.${NC}"
echo ""

# ──────────────────────────────────────────────────────────────────────────────
# Build a dry-run report of what will be removed
# ──────────────────────────────────────────────────────────────────────────────
declare -a ITEMS_TO_REMOVE=()

# Scan all IDE descriptors (not just detected ones — remove from any that were configured)
local descriptor_dir="${SCRIPT_DIR}/scripts/ide-descriptors"
local skills_dir="${SCRIPT_DIR}/skills"
local mcps_dir="${SCRIPT_DIR}/mcps"

for descriptor in "${descriptor_dir}"/*.sh; do
  [ -f "$descriptor" ] || continue
  # shellcheck source=/dev/null
  source "$descriptor"
  local ide_name="${IDE_NAME:-$IDE_ID}"

  # Check skills
  if [ -n "${IDE_SKILLS_DIR:-}" ] && [ -d "${IDE_SKILLS_DIR:-}" ]; then
    for skill_json in "${skills_dir}"/*/skill.json; do
      [ -f "$skill_json" ] || continue
      local skill_name
      skill_name=$(node --input-type=module <<EOF
import { readFileSync } from 'fs';
try { const s = JSON.parse(readFileSync('${skill_json}','utf8')); process.stdout.write(s.name||''); } catch {}
EOF
)
      local link="${IDE_SKILLS_DIR}/${skill_name}"
      local state
      state=$(detect_link_state "$link")
      if [ "$state" != "absent" ]; then
        ITEMS_TO_REMOVE+=("skill:${skill_name}:${ide_name}:${state}")
      fi
    done
  fi

  # Check MCPs
  if [ -n "${IDE_MCP_CONFIG:-}" ] && [ -f "${IDE_MCP_CONFIG:-}" ] && [ -n "${IDE_MCP_FORMAT:-}" ]; then
    for mcp_json in "${mcps_dir}"/*/mcp.json; do
      [ -f "$mcp_json" ] || continue
      local mcp_id
      mcp_id=$(node --input-type=module <<EOF
import { readFileSync } from 'fs';
try { const m = JSON.parse(readFileSync('${mcp_json}','utf8')); process.stdout.write(m.id||''); } catch {}
EOF
)
      local mcp_state
      mcp_state=$(detect_mcp_state "$mcp_id" "$IDE_MCP_CONFIG" "$IDE_MCP_FORMAT")
      if [ "$mcp_state" = "configured" ]; then
        ITEMS_TO_REMOVE+=("mcp:${mcp_id}:${ide_name}")
      fi
    done
  fi

  unset IDE_ID IDE_NAME IDE_DETECT_PATH IDE_GLOBAL_DIR \
        IDE_SKILLS_DIR IDE_AGENTS_DIR IDE_COMMANDS_DIR IDE_HOOKS_DIR \
        IDE_MCP_CONFIG IDE_MCP_FORMAT IDE_AGENT_FORMAT \
        IDE_SUPPORTS_SYMLINK IDE_SUPPORTS_HOOKS IDE_SUPPORTS_COMMANDS
done

# ──────────────────────────────────────────────────────────────────────────────
# Display summary of what will be removed
# ──────────────────────────────────────────────────────────────────────────────
if [ "${#ITEMS_TO_REMOVE[@]}" -eq 0 ]; then
  echo -e "${GREEN}✓${NC} Nothing to remove — no ia-framework MCPs or skill links detected."
  exit 0
fi

local skill_count=0
local mcp_count=0

echo -e "${BOLD}Items that will be removed:${NC}"
for item in "${ITEMS_TO_REMOVE[@]}"; do
  local type name ide state=""
  IFS=':' read -r type name ide state <<< "$item"
  case "$type" in
    skill)
      echo -e "  ${YELLOW}⊘${NC} Skill link: ${name} → ${ide} ${BLUE}(${state})${NC}"
      skill_count=$((skill_count+1))
      ;;
    mcp)
      echo -e "  ${YELLOW}⊘${NC} MCP config: ${name} → ${ide}"
      mcp_count=$((mcp_count+1))
      ;;
  esac
done

echo ""
echo -e "  Total: ${skill_count} skill link(s), ${mcp_count} MCP config entry/entries"
echo ""

if $DRY_RUN; then
  echo -e "${BLUE}ℹ${NC} Dry run — no changes made."
  exit 0
fi

# ──────────────────────────────────────────────────────────────────────────────
# Confirmation prompt (default NO for safety)
# ──────────────────────────────────────────────────────────────────────────────
if ! $FORCE_YES; then
  if is_noninteractive && [ -z "${NON_INTERACTIVE:-}" ]; then
    echo -e "${YELLOW}⚠${NC} Non-interactive mode: uninstall requires --yes flag to proceed. Aborting."
    exit 0
  fi

  local confirm
  read -rp "  Remove all ia-framework MCPs and skill links? [y/N]: " confirm
  confirm="${confirm:-N}"
  if ! [[ "$confirm" =~ ^[Yy] ]]; then
    echo -e "${BLUE}→${NC} Uninstall cancelled."
    exit 0
  fi
fi

echo ""
echo -e "${YELLOW}→${NC} Removing..."

# ──────────────────────────────────────────────────────────────────────────────
# Execute removal
# ──────────────────────────────────────────────────────────────────────────────
local removed_skills=0
local removed_mcps=0

for descriptor in "${descriptor_dir}"/*.sh; do
  [ -f "$descriptor" ] || continue
  # shellcheck source=/dev/null
  source "$descriptor"
  local ide_id="${IDE_ID}"
  local ide_name="${IDE_NAME:-$ide_id}"
  local ide_skills="${IDE_SKILLS_DIR:-}"
  local ide_mcp_config="${IDE_MCP_CONFIG:-}"
  local ide_mcp_format="${IDE_MCP_FORMAT:-}"

  # Remove skill links
  if [ -n "$ide_skills" ]; then
    for skill_json in "${skills_dir}"/*/skill.json; do
      [ -f "$skill_json" ] || continue
      local skill_name
      skill_name=$(node --input-type=module <<EOF
import { readFileSync } from 'fs';
try { const s = JSON.parse(readFileSync('${skill_json}','utf8')); process.stdout.write(s.name||''); } catch {}
EOF
)
      local link="${ide_skills}/${skill_name}"
      local state
      state=$(detect_link_state "$link")
      if [ "$state" != "absent" ]; then
        unlink_skill "$skill_name" "$ide_id"
        removed_skills=$((removed_skills+1))
      fi
    done
  fi

  # Remove MCP configs
  if [ -n "$ide_mcp_config" ] && [ -f "$ide_mcp_config" ] && [ -n "$ide_mcp_format" ]; then
    for mcp_json in "${mcps_dir}"/*/mcp.json; do
      [ -f "$mcp_json" ] || continue
      local mcp_id
      mcp_id=$(node --input-type=module <<EOF
import { readFileSync } from 'fs';
try { const m = JSON.parse(readFileSync('${mcp_json}','utf8')); process.stdout.write(m.id||''); } catch {}
EOF
)
      local mcp_state
      mcp_state=$(detect_mcp_state "$mcp_id" "$ide_mcp_config" "$ide_mcp_format")
      if [ "$mcp_state" = "configured" ]; then
        uninstall_mcp "$mcp_id" "$ide_mcp_config" "$ide_mcp_format"
        echo -e "  ${GREEN}✓${NC} Removed MCP ${mcp_id} from ${ide_name}"
        removed_mcps=$((removed_mcps+1))
      fi
    done
  fi

  unset IDE_ID IDE_NAME IDE_DETECT_PATH IDE_GLOBAL_DIR \
        IDE_SKILLS_DIR IDE_AGENTS_DIR IDE_COMMANDS_DIR IDE_HOOKS_DIR \
        IDE_MCP_CONFIG IDE_MCP_FORMAT IDE_AGENT_FORMAT \
        IDE_SUPPORTS_SYMLINK IDE_SUPPORTS_HOOKS IDE_SUPPORTS_COMMANDS
done

echo ""
echo -e "${GREEN}${BOLD}✓ Uninstall complete${NC}"
echo -e "  Removed: ${removed_skills} skill link(s), ${removed_mcps} MCP config entry/entries"
