#!/usr/bin/env bash
# init-config.sh — Initialize .ia-framework/project.json if not present
# Provides: init_config() function

# ──────────────────────────────────────────────────────
# init_config
# Creates default .ia-framework/project.json if it doesn't exist.
# Prompts for target project path.
# Uses SELECTED_EMBED_MODEL, SELECTED_EMBED_DIMS, SELECTED_ENRICHMENT_MODEL env vars
# from install-ollama.sh.
# Args: $1 = ia-framework directory (optional, defaults to SCRIPT_DIR or cwd)
# Exit code: 0 on success, 1 on failure.
# ──────────────────────────────────────────────────────
init_config() {
  local ia_dir="${1:-${SCRIPT_DIR:-$(pwd)}}"
  local config_dir="${ia_dir}/.ia-framework"
  local config_file="${config_dir}/project.json"

  # If config exists, merge missing fields instead of skipping
  if [ -f "$config_file" ]; then
    echo -e "  ${GREEN}✓${NC} Config found: ${config_file}"
    echo -e "  ${YELLOW}→${NC} Checking for missing fields and updating defaults..."

    # Backup before merge
    cp "$config_file" "${config_file}.bak"

    # Merge missing fields using inline Node script
    node --input-type=module <<MERGE_EOF
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';

const configPath = '${config_file}';
const config = JSON.parse(readFileSync(configPath, 'utf8'));
let changed = false;

// Convert targetProjectPath to repos array if old format
if (config.targetProjectPath && !config.repos) {
  const p = config.targetProjectPath;
  config.repos = [{ name: basename(p), path: p }];
  delete config.targetProjectPath;
  changed = true;
}

// Ensure embedding.prefixes exists
if (config.embedding && !config.embedding.prefixes) {
  config.embedding.prefixes = {
    document: "search_document: ",
    query: "search_query: "
  };
  changed = true;
}

// Fix vectorStore host from "qdrant" to "localhost"
if (config.vectorStore && config.vectorStore.host === "qdrant") {
  config.vectorStore.host = "localhost";
  changed = true;
}

// Remove deprecated strategy field from indexing
if (config.indexing && config.indexing.strategy !== undefined) {
  delete config.indexing.strategy;
  changed = true;
}

// Remove deprecated indexing.llm field (replaced by indexing.enrichment)
if (config.indexing && config.indexing.llm !== undefined) {
  // Migrate to enrichment block if not already set
  if (!config.indexing.enrichment) {
    config.indexing.enrichment = {
      provider: "ollama",
      model: config.indexing.llm.model || "qwen3:8b",
      baseUrl: config.indexing.llm.ollamaUrl || "http://localhost:11434",
      skipOnFailure: true
    };
  }
  delete config.indexing.llm;
  changed = true;
}

// Add enrichment block if missing and enrichment model is selected
const selectedEnrichmentModel = '${SELECTED_ENRICHMENT_MODEL:-}';
if (selectedEnrichmentModel && config.indexing && !config.indexing.enrichment) {
  config.indexing.enrichment = {
    provider: "ollama",
    model: selectedEnrichmentModel,
    baseUrl: "http://localhost:11434",
    skipOnFailure: true
  };
  changed = true;
}

if (changed) {
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\\n');
  console.log('  Updated config with missing fields (backup: project.json.bak)');
} else {
  console.log('  Config is up to date — no changes needed');
}
MERGE_EOF

    return 0
  fi

  echo -e "  ${YELLOW}→${NC} Initializing ia-framework configuration..."

  # Prompt for target project path
  local target_path=""
  while true; do
    printf "  Enter the absolute path to your target project: "
    read -r target_path

    # Trim whitespace
    target_path="${target_path#"${target_path%%[![:space:]]*}"}"
    target_path="${target_path%"${target_path##*[![:space:]]}"}"

    if [ -z "$target_path" ]; then
      echo -e "  ${RED}✗${NC} Path cannot be empty. Please enter a valid directory path."
      continue
    fi

    # Expand ~ if present
    target_path="${target_path/#\~/$HOME}"

    if [ ! -d "$target_path" ]; then
      echo -e "  ${RED}✗${NC} Directory not found: ${target_path}"
      echo "    Please enter an existing directory path."
      continue
    fi

    # Convert to absolute path
    target_path="$(cd "$target_path" && pwd)"
    break
  done

  # Create config directory
  mkdir -p "$config_dir"

  # Auto-detect target project's tech stack using project-detector
  echo -e "  ${YELLOW}→${NC} Detecting project stack..."

  local cli_bin="${ia_dir}/packages/cli/dist/bin.js"
  local detect_script="${ia_dir}/scripts/detect-project.mjs"

  # Prefer CLI init command (built binary); fall back to bridge script
  if [ -f "$cli_bin" ]; then
    local cli_args=("$target_path" "--config" "$config_file")
    if [ -n "${SELECTED_EMBED_MODEL:-}" ]; then
      cli_args+=("--embed-model" "$SELECTED_EMBED_MODEL")
    fi
    if [ -n "${SELECTED_EMBED_DIMS:-}" ]; then
      cli_args+=("--embed-dims" "$SELECTED_EMBED_DIMS")
    fi
    if [ -n "${SELECTED_ENRICHMENT_MODEL:-}" ]; then
      cli_args+=("--enrichment-model" "$SELECTED_ENRICHMENT_MODEL")
    fi
    cli_args+=("--force")
    if node "$cli_bin" init "${cli_args[@]}"; then
      echo -e "  ${GREEN}✓${NC} Config created with detected profile: ${config_file}"
      echo "    Target project: ${target_path}"
      return 0
    else
      echo -e "  ${YELLOW}⚠${NC} CLI init failed — trying bridge script"
    fi
  fi

  # Fallback: use detect-project.mjs bridge script
  if [ -f "${ia_dir}/packages/project-detector/dist/index.js" ] && [ -f "$detect_script" ]; then
    if node "$detect_script" "$target_path" "$config_file" "${SELECTED_EMBED_MODEL:-}" "${SELECTED_EMBED_DIMS:-}"; then
      echo -e "  ${GREEN}✓${NC} Config created with detected profile: ${config_file}"
      echo "    Target project: ${target_path}"
      return 0
    else
      echo -e "  ${YELLOW}⚠${NC} Project detection failed — falling back to defaults"
    fi
  else
    echo -e "  ${YELLOW}⚠${NC} Project detector not built — using defaults (run 'ia-framework index' after build)"
  fi

  # Fallback: write default config without profile
  local repo_name
  repo_name=$(basename "$target_path")

  # Build enrichment block if model selected
  local enrichment_block=""
  if [ -n "${SELECTED_ENRICHMENT_MODEL:-}" ]; then
    enrichment_block=",
    \"enrichment\": {
      \"provider\": \"ollama\",
      \"model\": \"${SELECTED_ENRICHMENT_MODEL}\",
      \"baseUrl\": \"http://localhost:11434\",
      \"skipOnFailure\": true
    }"
  fi

  cat > "$config_file" <<EOF
{
  "repos": [
    {
      "name": "${repo_name}",
      "path": "${target_path}"
    }
  ],
  "embedding": {
    "provider": "ollama",
    "model": "${SELECTED_EMBED_MODEL:-qwen3-embedding:0.6b}",
    "baseUrl": "http://localhost:11434",
    "dimensions": ${SELECTED_EMBED_DIMS:-1024},
    "prefixes": {
      "document": "search_document: ",
      "query": "search_query: "
    }
  },
  "vectorStore": {
    "host": "localhost",
    "port": 6333,
    "collectionName": "codebase"
  },
  "indexing": {
    "includePatterns": [
      "**/*.ts",
      "**/*.tsx",
      "**/*.js",
      "**/*.jsx",
      "**/*.py",
      "**/*.go",
      "**/*.rs",
      "**/*.java"
    ],
    "excludePatterns": [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/.git/**",
      "**/coverage/**",
      "**/__pycache__/**"
    ],
    "respectGitignore": true${enrichment_block}
  }
}
EOF

  echo -e "  ${GREEN}✓${NC} Config created: ${config_file}"
  echo "    Target project: ${target_path}"
  echo ""
  echo -e "  ${BLUE:-}ℹ${NC} To index multiple repositories, add more entries to the \"repos\" array:"
  echo "    { \"name\": \"other-repo\", \"path\": \"/path/to/other-repo\" }"
  return 0
}
