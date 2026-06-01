#!/usr/bin/env bash
# install-speckit.sh — SpecKit CLI (specify) installation module
# Prerequisites: Python 3.11+ → uv → specify CLI
# Pattern: check → install → report (matches other install-*.sh modules)

# ──────────────────────────────────────────────────────
# Check functions
# ──────────────────────────────────────────────────────

check_python311() {
  if ! command -v python3 &>/dev/null; then
    echo "NOT_INSTALLED"
    return 1
  fi
  local version
  version=$(python3 --version 2>&1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')
  local major minor
  major=$(echo "$version" | cut -d. -f1)
  minor=$(echo "$version" | cut -d. -f2)
  if [ "$major" -ge 3 ] && [ "$minor" -ge 11 ]; then
    echo "INSTALLED: Python $version"
    return 0
  else
    echo "OUTDATED: Python $version (need 3.11+)"
    return 1
  fi
}

check_uv() {
  if command -v uv &>/dev/null; then
    echo "INSTALLED: uv $(uv --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' || echo 'unknown')"
    return 0
  fi
  echo "NOT_INSTALLED"
  return 1
}

check_speckit() {
  if command -v specify &>/dev/null; then
    local ver
    ver=$(specify --version 2>/dev/null || echo "unknown")
    echo "INSTALLED: specify $ver"
    return 0
  fi
  echo "NOT_INSTALLED"
  return 1
}

# ──────────────────────────────────────────────────────
# Install functions
# ──────────────────────────────────────────────────────

install_uv() {
  echo -e "  ${YELLOW:-}→${NC:-} uv (Python package manager) is required for SpecKit."
  read -r -p "  Install uv now? [Y/n] " response
  case "${response,,}" in
    n|no)
      echo -e "  ${YELLOW:-}⚠${NC:-} uv installation skipped."
      echo "  Manual install: curl -LsSf https://astral.sh/uv/install.sh | sh"
      return 1
      ;;
  esac
  echo -e "  ${YELLOW:-}→${NC:-} Installing uv..."
  if curl -LsSf https://astral.sh/uv/install.sh | sh 2>&1; then
    # Source the uv env so it's available in this session
    if [ -f "$HOME/.local/bin/env" ]; then
      # shellcheck source=/dev/null
      source "$HOME/.local/bin/env" 2>/dev/null || true
    fi
    export PATH="$HOME/.local/bin:$PATH"
    echo -e "  ${GREEN:-}✓${NC:-} uv installed"
    return 0
  else
    echo -e "  ${RED:-}✗${NC:-} uv installation failed."
    echo "  Manual install: curl -LsSf https://astral.sh/uv/install.sh | sh"
    return 1
  fi
}

install_speckit() {
  # Pre-check: uv must be available
  if ! command -v uv &>/dev/null; then
    echo -e "  ${YELLOW:-}⚠${NC:-} uv is required to install SpecKit. Skipping."
    echo "  Manual install: uv tool install specify-cli --from git+https://github.com/github/spec-kit.git"
    return 1
  fi

  # Query available versions from GitHub
  echo -e "  ${YELLOW:-}→${NC:-} Querying SpecKit versions..."
  local versions=""
  if command -v gh &>/dev/null; then
    versions=$(gh release list --repo github/spec-kit --limit 5 --json tagName --jq '.[].tagName' 2>/dev/null || true)
  fi
  if [ -z "$versions" ]; then
    versions=$(curl -sf "https://api.github.com/repos/github/spec-kit/releases?per_page=5" 2>/dev/null \
      | grep '"tag_name"' | sed 's/.*"tag_name": "\(.*\)".*/\1/' || true)
  fi

  local selected_version=""
  if [ -n "$versions" ]; then
    echo "  Available versions:"
    local i=1
    while IFS= read -r v; do
      if [ $i -eq 1 ]; then
        echo "    [$i] $v (latest)"
      else
        echo "    [$i] $v"
      fi
      i=$((i + 1))
    done <<< "$versions"
    echo ""
    read -r -p "  Select version [1 for latest, or enter version tag]: " choice
    if [ -z "$choice" ] || [ "$choice" = "1" ]; then
      selected_version=$(echo "$versions" | head -1)
    elif echo "$choice" | grep -qE '^[0-9]+$'; then
      selected_version=$(echo "$versions" | sed -n "${choice}p")
    else
      selected_version="$choice"
    fi
  fi

  # Default to latest if we couldn't query
  if [ -z "$selected_version" ]; then
    echo -e "  ${YELLOW:-}⚠${NC:-} Could not query versions. Installing latest."
    selected_version=""
  fi

  # Confirm installation
  local install_target="specify-cli --from git+https://github.com/github/spec-kit.git"
  if [ -n "$selected_version" ]; then
    install_target="specify-cli --from git+https://github.com/github/spec-kit.git@${selected_version}"
    echo -e "  ${YELLOW:-}→${NC:-} Installing SpecKit ${selected_version}..."
  else
    echo -e "  ${YELLOW:-}→${NC:-} Installing SpecKit (latest)..."
  fi

  read -r -p "  Proceed with installation? [Y/n] " response
  case "${response,,}" in
    n|no)
      echo -e "  ${YELLOW:-}⚠${NC:-} SpecKit installation skipped."
      echo "  Manual install: uv tool install ${install_target}"
      return 0
      ;;
  esac

  # shellcheck disable=SC2086
  if uv tool install ${install_target} 2>&1; then
    echo -e "  ${GREEN:-}✓${NC:-} SpecKit (specify) installed"
    return 0
  else
    echo -e "  ${RED:-}✗${NC:-} SpecKit installation failed."
    echo "  Manual install: uv tool install ${install_target}"
    return 1
  fi
}

# ──────────────────────────────────────────────────────
# Main orchestrator
# ──────────────────────────────────────────────────────

setup_speckit() {
  echo -e "  ${YELLOW:-}→${NC:-} Checking SpecKit prerequisites..."

  # Check if already installed
  local speckit_status
  speckit_status=$(check_speckit)
  if echo "$speckit_status" | grep -q "^INSTALLED"; then
    echo -e "  ${GREEN:-}✓${NC:-} SpecKit: ${speckit_status#INSTALLED: }"
    return 0
  fi

  # Check Python 3.11+
  local python_status
  python_status=$(check_python311)
  if ! echo "$python_status" | grep -q "^INSTALLED"; then
    echo -e "  ${YELLOW:-}⚠${NC:-} Python 3.11+ required for SpecKit but not found (${python_status})."
    echo "  SpecKit installation skipped. Install Python 3.11+ and run:"
    echo "    uv tool install specify-cli --from git+https://github.com/github/spec-kit.git"
    return 0
  fi
  echo -e "  ${GREEN:-}✓${NC:-} ${python_status}"

  # Check/install uv
  local uv_status
  uv_status=$(check_uv)
  if ! echo "$uv_status" | grep -q "^INSTALLED"; then
    if ! install_uv; then
      echo -e "  ${YELLOW:-}⚠${NC:-} SpecKit installation skipped (uv unavailable)."
      return 0
    fi
  else
    echo -e "  ${GREEN:-}✓${NC:-} ${uv_status}"
  fi

  # Install specify CLI
  install_speckit || true
  return 0
}
