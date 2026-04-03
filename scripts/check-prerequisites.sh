#!/usr/bin/env bash
# check-prerequisites.sh — detect installed tools required by ia-framework
# Provides: check_docker, check_node, check_ollama, check_opencode, check_all functions

# Colors (safe to re-declare — may be sourced after install.sh sets them)
_RED='\033[0;31m'
_GREEN='\033[0;32m'
_YELLOW='\033[1;33m'
_NC='\033[0m'

# Minimum Node.js version required
REQUIRED_NODE_MAJOR=22

# ──────────────────────────────────────────────────────
# check_docker
# Returns: prints "INSTALLED" or "MISSING"
# Exit code: 0 if installed, 1 if missing
# ──────────────────────────────────────────────────────
check_docker() {
  if command -v docker &>/dev/null && docker --version &>/dev/null 2>&1; then
    local version
    version=$(docker --version 2>/dev/null | head -1)
    echo "INSTALLED: $version"
    return 0
  else
    echo "MISSING"
    return 1
  fi
}

# ──────────────────────────────────────────────────────
# check_node
# Returns: prints "INSTALLED: vX.Y.Z" or "MISSING (found X.Y.Z, need >=22)"
# Exit code: 0 if installed and >= REQUIRED_NODE_MAJOR, 1 if missing or outdated
# ──────────────────────────────────────────────────────
check_node() {
  if ! command -v node &>/dev/null; then
    echo "MISSING"
    return 1
  fi

  local version_str
  version_str=$(node --version 2>/dev/null | tr -d 'v')
  local major
  major=$(echo "$version_str" | cut -d. -f1)

  if [ -z "$major" ] || [ "$major" -lt "$REQUIRED_NODE_MAJOR" ] 2>/dev/null; then
    echo "MISSING (found v${version_str}, need >=${REQUIRED_NODE_MAJOR})"
    return 1
  fi

  echo "INSTALLED: v${version_str}"
  return 0
}

# ──────────────────────────────────────────────────────
# check_ollama
# Returns: prints "INSTALLED: vX.Y.Z" or "MISSING"
# Exit code: 0 if installed, 1 if missing
# ──────────────────────────────────────────────────────
check_ollama() {
  if command -v ollama &>/dev/null && ollama --version &>/dev/null 2>&1; then
    local version
    version=$(ollama --version 2>/dev/null | head -1)
    echo "INSTALLED: $version"
    return 0
  else
    echo "MISSING"
    return 1
  fi
}

# ──────────────────────────────────────────────────────
# check_opencode
# Returns: prints "INSTALLED: vX.Y.Z" or "MISSING"
# Exit code: 0 if installed, 1 if missing
# ──────────────────────────────────────────────────────
check_opencode() {
  if command -v opencode &>/dev/null && opencode --version &>/dev/null 2>&1; then
    local version
    version=$(opencode --version 2>/dev/null | head -1)
    echo "INSTALLED: $version"
    return 0
  else
    echo "MISSING"
    return 1
  fi
}

# ──────────────────────────────────────────────────────
# check_all
# Checks all 4 prerequisites.
# Prints status for each.
# Exit code: 0 if all installed, 1 if any missing.
# ──────────────────────────────────────────────────────
check_all() {
  local all_ok=0

  local docker_status node_status ollama_status opencode_status
  docker_status=$(check_docker)
  node_status=$(check_node)
  ollama_status=$(check_ollama)
  opencode_status=$(check_opencode)

  if echo "$docker_status" | grep -q "^INSTALLED"; then
    echo -e "  ${_GREEN}✓${_NC} Docker:    $docker_status"
  else
    echo -e "  ${_RED}✗${_NC} Docker:    $docker_status"
    all_ok=1
  fi

  if echo "$node_status" | grep -q "^INSTALLED"; then
    echo -e "  ${_GREEN}✓${_NC} Node.js:   $node_status"
  else
    echo -e "  ${_RED}✗${_NC} Node.js:   $node_status"
    all_ok=1
  fi

  if echo "$ollama_status" | grep -q "^INSTALLED"; then
    echo -e "  ${_GREEN}✓${_NC} Ollama:    $ollama_status"
  else
    echo -e "  ${_YELLOW}→${_NC} Ollama:    $ollama_status (will install)"
    # Ollama is optional at check time — installer will install
  fi

  if echo "$opencode_status" | grep -q "^INSTALLED"; then
    echo -e "  ${_GREEN}✓${_NC} OpenCode:  $opencode_status"
  else
    echo -e "  ${_YELLOW}→${_NC} OpenCode:  $opencode_status (will install)"
    # OpenCode is optional at check time — installer will install
  fi

  return $all_ok
}
