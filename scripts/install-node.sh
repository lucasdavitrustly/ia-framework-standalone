#!/usr/bin/env bash
# install-node.sh — Install Node.js 22 LTS
# Provides: install_node() function

REQUIRED_NODE_MAJOR=22

# ──────────────────────────────────────────────────────
# install_node
# Installs Node.js >= 22 if not already installed.
# Exit code: 0 on success, 1 on failure.
# ──────────────────────────────────────────────────────
install_node() {
  # Check if already installed and meets version requirement
  if command -v node &>/dev/null; then
    local version_str
    version_str=$(node --version 2>/dev/null | tr -d 'v')
    local major
    major=$(echo "$version_str" | cut -d. -f1)
    if [ -n "$major" ] && [ "$major" -ge "$REQUIRED_NODE_MAJOR" ] 2>/dev/null; then
      echo -e "  ${GREEN}✓${NC} Node.js already installed: v${version_str}"
      return 0
    fi
    echo -e "  ${YELLOW}→${NC} Node.js v${version_str} found, upgrading to ${REQUIRED_NODE_MAJOR}..."
  else
    echo -e "  ${YELLOW}→${NC} Installing Node.js ${REQUIRED_NODE_MAJOR}..."
  fi

  local os_type
  os_type=$(uname -s)

  case "$os_type" in
    Darwin)
      if ! command -v brew &>/dev/null; then
        echo -e "  ${RED}✗${NC} Homebrew not found. Install from https://brew.sh first."
        return 1
      fi
      brew install node@22
      brew link node@22 --force --overwrite 2>/dev/null || true
      # Ensure the homebrew node is in PATH
      local brew_prefix
      brew_prefix=$(brew --prefix)
      export PATH="${brew_prefix}/opt/node@22/bin:$PATH"
      ;;

    Linux)
      # Use NodeSource setup script for Node.js 22 LTS
      if command -v curl &>/dev/null; then
        curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
        sudo apt-get install -y nodejs
      elif command -v wget &>/dev/null; then
        wget -qO- https://deb.nodesource.com/setup_22.x | sudo -E bash -
        sudo apt-get install -y nodejs
      else
        echo -e "  ${RED}✗${NC} curl or wget required to install Node.js. Please install manually: https://nodejs.org"
        return 1
      fi
      ;;

    *)
      echo -e "  ${RED}✗${NC} Unsupported OS: $os_type. Install Node.js manually: https://nodejs.org"
      return 1
      ;;
  esac

  # Verify installation
  if ! command -v node &>/dev/null; then
    echo -e "  ${RED}✗${NC} Node.js installation failed"
    return 1
  fi

  local installed_version
  installed_version=$(node --version 2>/dev/null | tr -d 'v')
  local installed_major
  installed_major=$(echo "$installed_version" | cut -d. -f1)

  if [ -z "$installed_major" ] || [ "$installed_major" -lt "$REQUIRED_NODE_MAJOR" ] 2>/dev/null; then
    echo -e "  ${RED}✗${NC} Node.js v${installed_version} installed but v${REQUIRED_NODE_MAJOR}+ required"
    return 1
  fi

  echo -e "  ${GREEN}✓${NC} Node.js installed: v${installed_version}"
  return 0
}
