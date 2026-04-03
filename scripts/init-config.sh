#!/usr/bin/env bash
# init-config.sh — Initialize .ia-framework/project.json if not present
# Provides: init_config() function

# ──────────────────────────────────────────────────────
# init_config
# Creates default .ia-framework/project.json if it doesn't exist.
# Prompts for target project path.
# Uses SELECTED_EMBED_MODEL and SELECTED_EMBED_DIMS env vars from install-ollama.sh.
# Args: $1 = ia-framework directory (optional, defaults to SCRIPT_DIR or cwd)
# Exit code: 0 on success, 1 on failure.
# ──────────────────────────────────────────────────────
init_config() {
  local ia_dir="${1:-${SCRIPT_DIR:-$(pwd)}}"
  local config_dir="${ia_dir}/.ia-framework"
  local config_file="${config_dir}/project.json"

  # Skip if already configured
  if [ -f "$config_file" ]; then
    echo -e "  ${GREEN}✓${NC} Config found: ${config_file}"
    echo "    (Delete and re-run install.sh to reconfigure)"
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

  local detect_script="${ia_dir}/scripts/detect-project.mjs"
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
  cat > "$config_file" <<EOF
{
  "targetProjectPath": "${target_path}",
  "embedding": {
    "provider": "ollama",
    "model": "${SELECTED_EMBED_MODEL:-nomic-embed-text}",
    "baseUrl": "http://localhost:11434",
    "dimensions": ${SELECTED_EMBED_DIMS:-768}
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
    "respectGitignore": true
  }
}
EOF

  echo -e "  ${GREEN}✓${NC} Config created: ${config_file}"
  echo "    Target project: ${target_path}"
  return 0
}
