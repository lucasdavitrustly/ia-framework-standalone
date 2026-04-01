#!/usr/bin/env bash
# install-ollama.sh — Install Ollama and pull the embedding model
# Provides: install_ollama() function

OLLAMA_EMBED_MODEL="nomic-embed-text"

# ──────────────────────────────────────────────────────
# install_ollama
# Installs Ollama if not already installed.
# Starts the Ollama service.
# Pulls the nomic-embed-text embedding model.
# Exit code: 0 on success, 1 on failure.
# ──────────────────────────────────────────────────────
install_ollama() {
  # Skip install if already present
  if command -v ollama &>/dev/null; then
    echo -e "  ${GREEN}✓${NC} Ollama already installed: $(ollama --version 2>/dev/null | head -1)"
  else
    echo -e "  ${YELLOW}→${NC} Installing Ollama..."

    local os_type
    os_type=$(uname -s)

    case "$os_type" in
      Darwin)
        if command -v brew &>/dev/null; then
          brew install ollama
        else
          # Fall back to official install script
          curl -fsSL https://ollama.com/install.sh | sh
        fi
        ;;
      Linux)
        curl -fsSL https://ollama.com/install.sh | sh
        ;;
      *)
        echo -e "  ${RED}✗${NC} Unsupported OS: $os_type. Install Ollama manually: https://ollama.com/download"
        return 1
        ;;
    esac

    if ! command -v ollama &>/dev/null; then
      echo -e "  ${RED}✗${NC} Ollama installation failed"
      return 1
    fi
    echo -e "  ${GREEN}✓${NC} Ollama installed: $(ollama --version 2>/dev/null | head -1)"
  fi

  # Start Ollama service if not running
  if ! ollama list &>/dev/null 2>&1; then
    echo -e "  ${YELLOW}→${NC} Starting Ollama service..."
    local os_type
    os_type=$(uname -s)
    case "$os_type" in
      Darwin)
        # On macOS, ollama serve runs as a background process
        ollama serve &>/dev/null &
        sleep 3
        ;;
      Linux)
        if command -v systemctl &>/dev/null; then
          sudo systemctl enable ollama 2>/dev/null || true
          sudo systemctl start ollama 2>/dev/null || true
        else
          ollama serve &>/dev/null &
          sleep 3
        fi
        ;;
    esac
  fi

  # Pull the embedding model
  echo -e "  ${YELLOW}→${NC} Pulling embedding model: ${OLLAMA_EMBED_MODEL}"
  echo "    (This may take a few minutes on first run...)"
  if ollama pull "$OLLAMA_EMBED_MODEL"; then
    echo -e "  ${GREEN}✓${NC} Model ${OLLAMA_EMBED_MODEL} ready"
  else
    echo -e "  ${YELLOW}⚠${NC} Could not pull ${OLLAMA_EMBED_MODEL} — ensure Ollama is running and retry"
    # Non-fatal: user can pull manually
    return 0
  fi

  return 0
}
