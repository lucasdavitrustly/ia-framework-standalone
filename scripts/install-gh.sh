#!/usr/bin/env bash
# install-gh.sh — Install the GitHub CLI (gh)
# Provides: install_gh() function
#
# The GitHub CLI is required by the tlc-spec-driven /delivery command to push
# branches and open Draft Pull Requests. Authentication (gh auth login) is left
# to the user — this script only installs the binary.

# ──────────────────────────────────────────────────────
# install_gh
# Installs the GitHub CLI if not already installed.
# Exit code: 0 on success, 1 on failure.
# ──────────────────────────────────────────────────────
install_gh() {
  # Skip if already installed
  if command -v gh &>/dev/null && gh --version &>/dev/null 2>&1; then
    echo -e "  ${GREEN:-}✓${NC:-} GitHub CLI already installed: $(gh --version 2>/dev/null | head -1)"
    return 0
  fi

  local os_type
  os_type=$(uname -s)

  echo -e "  ${YELLOW:-}→${NC:-} Installing GitHub CLI (gh)..."

  case "$os_type" in
    Darwin)
      # macOS — install via Homebrew
      if ! command -v brew &>/dev/null; then
        echo -e "  ${RED:-}✗${NC:-} Homebrew not found. Install from https://brew.sh first."
        return 1
      fi
      brew install gh 2>&1 | tail -5
      ;;

    Linux)
      # Linux — prefer official apt repo, fall back to dnf
      if command -v apt-get &>/dev/null; then
        # Official GitHub CLI apt repository (per https://github.com/cli/cli/blob/trunk/docs/install_linux.md)
        if command -v curl &>/dev/null; then
          sudo mkdir -p -m 755 /etc/apt/keyrings
          curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
            | sudo tee /etc/apt/keyrings/githubcli-archive-keyring.gpg >/dev/null
          sudo chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg
          echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
            | sudo tee /etc/apt/sources.list.d/github-cli.list >/dev/null
          sudo apt-get update -qq
          sudo apt-get install -y gh
        else
          echo -e "  ${RED:-}✗${NC:-} curl required to add the GitHub CLI apt repo. Install manually: https://github.com/cli/cli#installation"
          return 1
        fi
      elif command -v dnf &>/dev/null; then
        sudo dnf install -y 'dnf-command(config-manager)'
        sudo dnf config-manager --add-repo https://cli.github.com/packages/rpm/gh-cli.repo
        sudo dnf install -y gh
      else
        echo -e "  ${RED:-}✗${NC:-} Unsupported Linux package manager. Install gh manually: https://github.com/cli/cli#installation"
        return 1
      fi
      ;;

    *)
      echo -e "  ${RED:-}✗${NC:-} Unsupported OS: $os_type. Install gh manually: https://github.com/cli/cli#installation"
      return 1
      ;;
  esac

  # Verify installation
  if ! command -v gh &>/dev/null || ! gh --version &>/dev/null 2>&1; then
    echo -e "  ${RED:-}✗${NC:-} GitHub CLI installation failed"
    return 1
  fi

  echo -e "  ${GREEN:-}✓${NC:-} GitHub CLI installed: $(gh --version 2>/dev/null | head -1)"
  echo -e "  ${BLUE:-}ℹ${NC:-} Authenticate later with 'gh auth login' (required by /delivery to open PRs)."
  return 0
}
