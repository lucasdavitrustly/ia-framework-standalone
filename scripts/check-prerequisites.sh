#!/usr/bin/env bash
# check-prerequisites.sh — detect installed tools required by ia-framework
# Provides: check_docker, check_node, check_ollama, check_opencode, check_gh, check_all functions

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
# check_gh
# Returns: prints "INSTALLED: vX.Y.Z" or "MISSING"
# Exit code: 0 if installed, 1 if missing
# ──────────────────────────────────────────────────────
check_gh() {
  if command -v gh &>/dev/null && gh --version &>/dev/null 2>&1; then
    local version
    version=$(gh --version 2>/dev/null | head -1)
    echo "INSTALLED: $version"
    return 0
  else
    echo "MISSING"
    return 1
  fi
}

# ──────────────────────────────────────────────────────
# display_version_error
# Displays formatted error box when Node version is wrong
# Args: $1 = found version (or "none")
# ──────────────────────────────────────────────────────
display_version_error() {
  local found="${1:-none}"
  echo ""
  echo -e "${_RED}╔══════════════════════════════════════════════════════════╗${_NC}"
  echo -e "${_RED}║  ERROR: Node.js ${REQUIRED_NODE_MAJOR}+ is required but not active        ║${_NC}"
  echo -e "${_RED}╠══════════════════════════════════════════════════════════╣${_NC}"
  if [ "$found" = "none" ]; then
    echo -e "${_RED}║  Node.js is not installed or not in PATH.                ║${_NC}"
  else
    echo -e "${_RED}║  Found: v${found} (need >= ${REQUIRED_NODE_MAJOR}.0.0)                        ║${_NC}"
  fi
  echo -e "${_RED}╚══════════════════════════════════════════════════════════╝${_NC}"
  echo ""
}

# ──────────────────────────────────────────────────────
# display_activate_msg
# Shows instructions when Node 22 is installed but not active
# ──────────────────────────────────────────────────────
display_activate_msg() {
  echo ""
  echo -e "${_YELLOW}Node.js ${REQUIRED_NODE_MAJOR} was installed but is not the active version.${_NC}"
  echo ""
  echo "  Please activate Node ${REQUIRED_NODE_MAJOR} in your shell:"
  echo ""
  echo "    nvm use ${REQUIRED_NODE_MAJOR}        # if using nvm"
  echo "    fnm use ${REQUIRED_NODE_MAJOR}        # if using fnm"
  echo "    mise use node@${REQUIRED_NODE_MAJOR}   # if using mise"
  echo ""
  echo "  Then re-run: ./install.sh"
  echo ""
}

# ──────────────────────────────────────────────────────
# check_node_active
# Gate function: verifies Node 22+ is the ACTIVE version.
# If not, displays error, offers to install, re-verifies.
# Returns: 0 if Node 22+ is active, 1 if not (caller should exit)
# ──────────────────────────────────────────────────────
check_node_active() {
  # Check if node is available and version is adequate
  if command -v node &>/dev/null; then
    local version_str
    version_str=$(node --version 2>/dev/null | tr -d 'v')
    local major
    major=$(echo "$version_str" | cut -d. -f1)

    if [ -n "$major" ] && [ "$major" -ge "$REQUIRED_NODE_MAJOR" ] 2>/dev/null; then
      # Node 22+ is active — pass
      return 0
    fi

    # Node found but wrong version
    display_version_error "$version_str"
  else
    # Node not found at all
    display_version_error "none"
  fi

  # Offer to install
  if [ -t 0 ]; then
    printf "  Would you like to install Node.js %s? [Y/n] " "$REQUIRED_NODE_MAJOR"
    read -r answer
    case "${answer:-Y}" in
      [Yy]|[Yy]es|"")
        # Call install_node (defined in install-node.sh, sourced by install.sh)
        if type install_node &>/dev/null && install_node; then
          # Re-verify after install
          if command -v node &>/dev/null; then
            local new_version
            new_version=$(node --version 2>/dev/null | tr -d 'v')
            local new_major
            new_major=$(echo "$new_version" | cut -d. -f1)
            if [ -n "$new_major" ] && [ "$new_major" -ge "$REQUIRED_NODE_MAJOR" ] 2>/dev/null; then
              echo -e "  ${_GREEN}✓${_NC} Node.js v${new_version} is now active"
              return 0
            fi
          fi
          # Installed but not active
          display_activate_msg
          return 1
        else
          echo -e "  ${_RED}✗${_NC} Node.js installation failed."
          return 1
        fi
        ;;
      *)
        echo "  Aborting — Node.js ${REQUIRED_NODE_MAJOR}+ is required."
        return 1
        ;;
    esac
  else
    # Non-interactive — just fail
    echo "  Non-interactive mode — cannot install Node.js automatically."
    return 1
  fi
}

# ──────────────────────────────────────────────────────
# check_all
# Checks all prerequisites.
# Prints status for each.
# Exit code: 0 if all required installed, 1 if any required missing.
# ──────────────────────────────────────────────────────
check_all() {
  local all_ok=0

  local docker_status node_status ollama_status opencode_status gh_status
  docker_status=$(check_docker)
  node_status=$(check_node)
  ollama_status=$(check_ollama)
  opencode_status=$(check_opencode)
  gh_status=$(check_gh)

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

  if echo "$gh_status" | grep -q "^INSTALLED"; then
    echo -e "  ${_GREEN}✓${_NC} GitHub CLI: $gh_status"
  else
    echo -e "  ${_YELLOW}→${_NC} GitHub CLI: $gh_status (will install)"
    # gh is optional at check time — installer will install (used by /delivery)
  fi

  return $all_ok
}
