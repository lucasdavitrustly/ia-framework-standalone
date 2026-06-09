#!/usr/bin/env bash
# install-ollama.sh — Install Ollama and pull the embedding model
# Provides: install_ollama() function
# Exports: SELECTED_EMBED_MODEL, SELECTED_EMBED_DIMS (consumed by init-config.sh)

# ──────────────────────────────────────────────────────
# select_embedding_model
# Interactive model selection menu.
# Sets SELECTED_EMBED_MODEL and SELECTED_EMBED_DIMS env vars.
# ──────────────────────────────────────────────────────
select_embedding_model() {
  echo ""
  echo -e "  ${BOLD}Select an embedding model:${NC}"

  # Get list of locally available models
  local models=()
  while IFS= read -r line; do
    models+=("$line")
  done < <(ollama list 2>/dev/null | tail -n +2 | awk '{print $1}')

  local selected_model=""

  if [ ${#models[@]} -eq 0 ]; then
    echo "  No models found locally."
    echo "  Popular embedding models: qwen3-embedding:0.6b, nomic-embed-text, mxbai-embed-large"
    printf "  Enter a model name to pull [qwen3-embedding:0.6b]: "
    read -r selected_model
    selected_model="${selected_model:-qwen3-embedding:0.6b}"
  else
    # Known embedding models for hint markers
    local known_embed="nomic-embed-text mxbai-embed-large all-minilm"

    for i in "${!models[@]}"; do
      local hint=""
      local short_name="${models[$i]%%:*}"
      if echo "$known_embed" | grep -qw "$short_name"; then
        hint=" [embed]"
      fi
      echo "    $((i+1)). ${models[$i]}${hint}"
    done
    echo "    $((${#models[@]}+1)). Enter a custom model name"

    printf "  Select [1]: "
    read -r choice
    choice="${choice:-1}"

    if [ "$choice" -eq "$((${#models[@]}+1))" ] 2>/dev/null; then
      printf "  Enter model name: "
      read -r selected_model
    elif [ "$choice" -ge 1 ] 2>/dev/null && [ "$choice" -le "${#models[@]}" ] 2>/dev/null; then
      selected_model="${models[$((choice-1))]}"
    else
      selected_model="${models[0]}"
    fi
  fi

  # Auto-pull if not already available
  if ! ollama list 2>/dev/null | tail -n +2 | awk '{print $1}' | grep -qx "$selected_model"; then
    echo -e "  ${YELLOW}→${NC} Pulling model: ${selected_model}"
    echo "    (This may take a few minutes...)"
    if ! ollama pull "$selected_model"; then
      echo -e "  ${RED}✗${NC} Failed to pull ${selected_model}. Using qwen3-embedding:0.6b as fallback."
      selected_model="qwen3-embedding:0.6b"
      ollama pull "$selected_model" || true
    fi
  fi

  echo -e "  ${GREEN}✓${NC} Model ${selected_model} ready"

  # Discover dimensions using node helper
  local dims=""
  local base_url="http://localhost:11434"
  # Try using the framework's discoverDimensions (if built)
  if [ -f "${SCRIPT_DIR}/packages/embedding/dist/index.js" ]; then
    dims=$(node -e "
      import('${SCRIPT_DIR}/packages/embedding/dist/index.js').then(async m => {
        try { console.log(await m.discoverDimensions('${selected_model}', '${base_url}')); }
        catch { console.log(''); }
      });
    " 2>/dev/null)
  fi

  # Fallback dimension lookup for known models
  if [ -z "$dims" ]; then
    case "${selected_model%%:*}" in
      qwen3-embedding) dims=1024 ;;
      nomic-embed-text) dims=768 ;;
      mxbai-embed-large) dims=1024 ;;
      all-minilm) dims=384 ;;
      text-embedding-3-small) dims=1536 ;;
      text-embedding-3-large) dims=3072 ;;
      *) dims="" ;;  # Will be discovered at index time
    esac
  fi

  # Export for init-config.sh to consume
  export SELECTED_EMBED_MODEL="$selected_model"
  export SELECTED_EMBED_DIMS="$dims"
}

# ──────────────────────────────────────────────────────
# select_enrichment_model
# Interactive model selection for LLM metadata enrichment.
# Sets SELECTED_ENRICHMENT_MODEL env var.
# ──────────────────────────────────────────────────────
select_enrichment_model() {
  echo ""
  echo -e "  ${BOLD}Select an LLM enrichment model:${NC}"
  echo "  (Used to generate descriptions, tags and relationships for indexed chunks)"
  echo ""

  # Get list of locally available models
  local models=()
  while IFS= read -r line; do
    models+=("$line")
  done < <(ollama list 2>/dev/null | tail -n +2 | awk '{print $1}')

  local selected_model=""

  if [ ${#models[@]} -eq 0 ]; then
    echo "  No models found locally."
    echo "  Recommended: qwen3:8b (good quality/speed), mistral:7b, llama3:8b"
    printf "  Enter a model name to pull [qwen3:8b]: "
    read -r selected_model
    selected_model="${selected_model:-qwen3:8b}"
  else
    # Known enrichment LLM models for hint markers
    local known_llm="qwen3 mistral llama3 llama2 gemma2 phi3 codellama deepseek-coder"

    for i in "${!models[@]}"; do
      local hint=""
      local short_name="${models[$i]%%:*}"
      if echo "$known_llm" | grep -qw "$short_name"; then
        hint=" [llm]"
      fi
      echo "    $((i+1)). ${models[$i]}${hint}"
    done
    echo "    $((${#models[@]}+1)). Enter a custom model name"
    echo "    $((${#models[@]}+2)). Skip enrichment (index without LLM metadata)"

    printf "  Select [1 = first model, or press Enter for qwen3:8b default]: "
    read -r choice
    choice="${choice:-}"

    local skip_opt=$(( ${#models[@]} + 2 ))
    local custom_opt=$(( ${#models[@]} + 1 ))

    if [ "$choice" = "$skip_opt" ] 2>/dev/null; then
      echo -e "  ${YELLOW}⚠${NC} Enrichment skipped — indexes will contain AST metadata only (no LLM descriptions)"
      export SELECTED_ENRICHMENT_MODEL=""
      return 0
    elif [ "$choice" = "$custom_opt" ] 2>/dev/null; then
      printf "  Enter model name: "
      read -r selected_model
    elif [ -n "$choice" ] && [ "$choice" -ge 1 ] 2>/dev/null && [ "$choice" -le "${#models[@]}" ] 2>/dev/null; then
      selected_model="${models[$((choice-1))]}"
    else
      # No choice or invalid — default to qwen3:8b
      selected_model="qwen3:8b"
    fi
  fi

  # Auto-pull if not already available
  if [ -n "$selected_model" ] && ! ollama list 2>/dev/null | tail -n +2 | awk '{print $1}' | grep -qx "$selected_model"; then
    echo -e "  ${YELLOW}→${NC} Pulling enrichment model: ${selected_model}"
    echo "    (This may take several minutes for larger models...)"
    if ! ollama pull "$selected_model"; then
      echo -e "  ${YELLOW}⚠${NC} Failed to pull ${selected_model} — enrichment will be skipped at index time."
      selected_model=""
    fi
  fi

  if [ -n "$selected_model" ]; then
    echo -e "  ${GREEN}✓${NC} Enrichment model ${selected_model} ready"
  fi

  # Export for init-config.sh to consume
  export SELECTED_ENRICHMENT_MODEL="$selected_model"
}

# ──────────────────────────────────────────────────────
# install_ollama
# Installs Ollama if not already installed.
# Starts the Ollama service.
# Runs interactive model selection.
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

  # Interactive model selection for embedding
  select_embedding_model

  # Interactive model selection for enrichment (LLM metadata)
  select_enrichment_model

  return 0
}
