#!/usr/bin/env bash
# install-docker.sh — Install Docker Desktop (macOS) or Docker Engine (Linux)
# Provides: install_docker() function

# ──────────────────────────────────────────────────────
# install_docker
# Installs Docker if not already installed.
# Waits for Docker daemon to start.
# Exit code: 0 on success, 1 on failure.
# ──────────────────────────────────────────────────────
install_docker() {
  # Skip if already installed
  if command -v docker &>/dev/null && docker --version &>/dev/null 2>&1; then
    echo -e "  ${GREEN}✓${NC} Docker already installed"
    return 0
  fi

  local os_type
  os_type=$(uname -s)

  echo -e "  ${YELLOW}→${NC} Installing Docker..."

  case "$os_type" in
    Darwin)
      # macOS — install Docker Desktop via Homebrew Cask
      if ! command -v brew &>/dev/null; then
        echo -e "  ${RED}✗${NC} Homebrew not found. Install from https://brew.sh first."
        return 1
      fi
      brew install --cask docker 2>&1 | tail -5
      echo -e "  ${YELLOW}→${NC} Starting Docker Desktop..."
      open -a Docker
      # Wait up to 60s for Docker daemon to be ready
      local attempts=0
      while ! docker info &>/dev/null 2>&1; do
        if [ $attempts -ge 60 ]; then
          echo -e "  ${RED}✗${NC} Docker daemon did not start within 60s. Please start Docker Desktop manually."
          return 1
        fi
        sleep 1
        attempts=$((attempts + 1))
        printf "\r  Waiting for Docker daemon... ${attempts}s"
      done
      echo -e "\n  ${GREEN}✓${NC} Docker daemon ready"
      ;;

    Linux)
      # Linux — install Docker Engine via apt or dnf
      if command -v apt-get &>/dev/null; then
        sudo apt-get update -qq
        sudo apt-get install -y docker.io docker-compose-plugin
        sudo systemctl enable docker
        sudo systemctl start docker
        # Add current user to docker group
        if ! groups "$USER" | grep -q docker; then
          sudo usermod -aG docker "$USER"
          echo -e "  ${YELLOW}→${NC} Added $USER to docker group (logout/login required for group to take effect)"
        fi
      elif command -v dnf &>/dev/null; then
        sudo dnf install -y docker docker-compose-plugin
        sudo systemctl enable docker
        sudo systemctl start docker
      else
        echo -e "  ${RED}✗${NC} Unsupported Linux package manager. Install Docker manually: https://docs.docker.com/engine/install/"
        return 1
      fi
      echo -e "  ${GREEN}✓${NC} Docker installed"
      ;;

    *)
      echo -e "  ${RED}✗${NC} Unsupported OS: $os_type. Install Docker manually: https://docs.docker.com/get-docker/"
      return 1
      ;;
  esac

  # Final verification
  if ! docker --version &>/dev/null 2>&1; then
    echo -e "  ${RED}✗${NC} Docker installation failed"
    return 1
  fi

  echo -e "  ${GREEN}✓${NC} Docker installed: $(docker --version)"
  return 0
}
