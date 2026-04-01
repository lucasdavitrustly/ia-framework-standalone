#!/usr/bin/env bash
# install-opencode.sh — Install OpenCode CLI
# Provides: install_opencode() function

# ──────────────────────────────────────────────────────
# install_opencode
# Installs OpenCode CLI via npm if not already installed.
# Exit code: 0 on success, 1 on failure.
# ──────────────────────────────────────────────────────
install_opencode() {
  # Skip if already installed
  if command -v opencode &>/dev/null && opencode --version &>/dev/null 2>&1; then
    echo -e "  ${GREEN}✓${NC} OpenCode already installed: $(opencode --version 2>/dev/null | head -1)"
    return 0
  fi

  echo -e "  ${YELLOW}→${NC} Installing OpenCode..."

  # Requires npm (comes with Node.js)
  if ! command -v npm &>/dev/null; then
    echo -e "  ${RED}✗${NC} npm not found. Install Node.js first."
    return 1
  fi

  if npm install -g @opencode-sh/opencode; then
    echo -e "  ${GREEN}✓${NC} OpenCode installed"
  else
    # Non-fatal: OpenCode may need manual install or different permissions
    echo -e "  ${YELLOW}⚠${NC} OpenCode install via npm failed. Try manually:"
    echo "    npm install -g @opencode-sh/opencode"
    echo "    Or visit: https://opencode.ai/docs/getting-started/installation"
    return 0  # Non-fatal — framework still works for indexing/search
  fi

  # Verify installation
  if ! command -v opencode &>/dev/null; then
    echo -e "  ${YELLOW}⚠${NC} OpenCode not found in PATH after install. You may need to add npm global bin to your PATH."
    echo "    npm bin -g → shows the npm global bin directory"
    return 0  # Non-fatal
  fi

  echo -e "  ${GREEN}✓${NC} OpenCode installed: $(opencode --version 2>/dev/null | head -1)"
  return 0
}
