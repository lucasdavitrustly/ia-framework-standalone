#!/usr/bin/env bash
# install-opencode.sh — Install OpenCode CLI with platform-aware method selection
# Provides: install_opencode(), configure_trustly_provider() functions
#
# Installation methods (from https://opencode.ai/download):
#   - curl -fsSL https://opencode.ai/install | bash  (universal)
#   - npm i -g opencode-ai                           (requires npm)
#   - bun add -g opencode-ai                         (requires bun)
#   - brew install anomalyco/tap/opencode            (requires homebrew)
#   - paru -S opencode                               (requires paru, Arch Linux)
#
# Platform defaults:
#   - macOS: brew (if available), fallback curl
#   - Linux: curl
#
# Non-interactive mode: set NON_INTERACTIVE=1 or pipe stdin (non-TTY)

# ──────────────────────────────────────────────────────
# install_opencode
# Installs OpenCode CLI using user-selected or auto-detected method.
# Exit code: 0 on success, 1 on failure.
# ──────────────────────────────────────────────────────
install_opencode() {
  # Skip if already installed
  if command -v opencode &>/dev/null; then
    local ver
    ver=$(opencode --version 2>/dev/null | head -1)
    echo -e "  ${GREEN:-}✓${NC:-} OpenCode already installed: ${ver}"
    return 0
  fi

  echo -e "  ${YELLOW:-}→${NC:-} Installing OpenCode..."

  # Detect platform
  local platform
  platform="$(uname -s)"

  # Build list of available methods
  local -a method_ids=()
  local -a method_labels=()
  local -a method_cmds=()
  local default_idx=0

  # Always add curl (universal fallback)
  method_ids+=("curl")
  method_labels+=("curl (opencode.ai installer)")
  method_cmds+=("curl -fsSL https://opencode.ai/install | bash")

  # Homebrew
  if command -v brew &>/dev/null; then
    method_ids+=("brew")
    method_labels+=("brew install anomalyco/tap/opencode")
    method_cmds+=("brew install anomalyco/tap/opencode")
    # On macOS, brew is preferred default
    if [[ "$platform" == "Darwin" ]]; then
      default_idx=$(( ${#method_ids[@]} - 1 ))
    fi
  fi

  # npm
  if command -v npm &>/dev/null; then
    method_ids+=("npm")
    method_labels+=("npm i -g opencode-ai")
    method_cmds+=("npm i -g opencode-ai")
  fi

  # bun
  if command -v bun &>/dev/null; then
    method_ids+=("bun")
    method_labels+=("bun add -g opencode-ai")
    method_cmds+=("bun add -g opencode-ai")
  fi

  # paru (Arch Linux AUR)
  if command -v paru &>/dev/null; then
    method_ids+=("paru")
    method_labels+=("paru -S opencode")
    method_cmds+=("paru -S opencode")
  fi

  # Determine if interactive
  local interactive=true
  if [[ "${IA_NON_INTERACTIVE:-}" == "1" ]] || [[ ! -t 0 ]]; then
    interactive=false
  fi

  local chosen_idx=$default_idx

  if [[ "$interactive" == "true" && ${#method_ids[@]} -gt 1 ]]; then
    echo ""
    echo -e "  ${BOLD:-}Select OpenCode installation method:${NC:-}"
    local i
    for i in "${!method_ids[@]}"; do
      local marker=""
      if [[ $i -eq $default_idx ]]; then
        marker=" ${GREEN:-}(default)${NC:-}"
      fi
      echo -e "    $((i + 1))) ${method_labels[$i]}${marker}"
    done
    echo ""
    printf "  Choice [%d]: " "$((default_idx + 1))"
    local choice
    read -r choice
    if [[ -n "$choice" && "$choice" =~ ^[0-9]+$ ]]; then
      local idx=$((choice - 1))
      if [[ $idx -ge 0 && $idx -lt ${#method_ids[@]} ]]; then
        chosen_idx=$idx
      fi
    fi
  fi

  local selected_cmd="${method_cmds[$chosen_idx]}"
  local selected_id="${method_ids[$chosen_idx]}"
  echo -e "  ${YELLOW:-}→${NC:-} Installing via ${selected_id}: ${selected_cmd}"

  # Execute the chosen install command
  if eval "$selected_cmd"; then
    echo -e "  ${GREEN:-}✓${NC:-} OpenCode installed via ${selected_id}"
  else
    echo -e "  ${YELLOW:-}⚠${NC:-} OpenCode install via ${selected_id} failed. Try manually:"
    echo "    Visit: https://opencode.ai/download"
    return 0  # Non-fatal — framework still works for indexing/search
  fi

  # Verify installation
  if ! command -v opencode &>/dev/null; then
    echo -e "  ${YELLOW:-}⚠${NC:-} OpenCode not found in PATH after install."
    echo "    You may need to restart your shell or add the install location to PATH."
    return 0  # Non-fatal
  fi

  echo -e "  ${GREEN:-}✓${NC:-} OpenCode ready: $(opencode --version 2>/dev/null | head -1)"
  return 0
}

# ──────────────────────────────────────────────────────
# configure_trustly_provider
# Configures the Trustly-Claude LLM provider in opencode.jsonc (and opencode.json).
# Adds Amazon Bedrock Claude models with the Trustly gateway URL.
# Prompts for API token interactively; uses empty string in non-interactive mode.
#
# Idempotent: if Trustly-Claude provider already exists, skips by default
# (interactive mode offers keep/overwrite choice).
# ──────────────────────────────────────────────────────
configure_trustly_provider() {
  echo -e "  ${YELLOW:-}→${NC:-} Configuring Trustly LLM Gateway (Amazon Bedrock)..."

  # Resolve config paths (respect XDG_CONFIG_HOME)
  local config_dir="${XDG_CONFIG_HOME:-${HOME}/.config}/opencode"
  local jsonc_file="${config_dir}/opencode.jsonc"
  local json_file="${config_dir}/opencode.json"

  mkdir -p "$config_dir"

  # Migration: seed .jsonc from .json if .jsonc doesn't exist yet
  if [ ! -f "$jsonc_file" ] && [ -f "$json_file" ]; then
    _seed_jsonc_from_json "$jsonc_file" "$json_file"
    echo -e "  ${BLUE:-}ℹ${NC:-} Migrated existing opencode.json → opencode.jsonc"
  fi

  # Ensure .jsonc exists
  [ -f "$jsonc_file" ] || echo '{"$schema":"https://opencode.ai/config.json"}' > "$jsonc_file"

  # Validate .jsonc is parseable; backup if malformed
  if ! _read_jsonc "$jsonc_file" > /dev/null 2>&1; then
    _backup_malformed_jsonc "$jsonc_file"
  fi

  # Check if Trustly-Claude provider already exists
  local has_provider
  has_provider=$(TRUSTLY_CHECK_FILE="$jsonc_file" node -e '
    const { readFileSync } = require("fs");
    const f = process.env.TRUSTLY_CHECK_FILE;
    try {
      const raw = readFileSync(f, "utf8");
      const stripped = raw.replace(/("(?:[^"\\\\]|\\\\.)*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (m, str) => str || "");
      const cfg = JSON.parse(stripped);
      process.stdout.write(cfg.provider && cfg.provider["Trustly-Claude"] ? "yes" : "no");
    } catch { process.stdout.write("no"); }
  ')

  if [[ "$has_provider" == "yes" ]]; then
    if is_noninteractive; then
      echo -e "  ${BLUE:-}→${NC:-} Trustly-Claude provider already configured — skipping"
      return 0
    fi
    if ! prompt_yn "Trustly-Claude provider already exists — overwrite?" N; then
      echo -e "  ${BLUE:-}→${NC:-} Keeping existing Trustly-Claude configuration"
      return 0
    fi
  fi

  # Prompt for API token
  local api_token=""
  if is_noninteractive; then
    echo -e "  ${BLUE:-}ℹ${NC:-} Non-interactive mode — using empty API token (update later in opencode.jsonc)"
  else
    echo ""
    echo -e "  ${BOLD:-}Trustly API Token${NC:-}"
    echo -e "  Enter your Trustly LLM Gateway API token."
    echo -e "  (Leave empty to configure later)"
    echo ""
    printf "  Token: "
    read -r api_token < /dev/tty || api_token=""
  fi

  # Write Trustly-Claude provider to .jsonc
  TRUSTLY_CONFIG_FILE="$jsonc_file" \
  TRUSTLY_API_TOKEN="$api_token" \
  node --input-type=module <<'EOF'
import { readFileSync, writeFileSync } from 'fs';
const f = process.env.TRUSTLY_CONFIG_FILE;
const token = process.env.TRUSTLY_API_TOKEN || '';

// Read and parse JSONC
const raw = readFileSync(f, 'utf8');
const stripped = raw.replace(/("(?:[^"\\]|\\.)*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (m, str) => str || '');
let cfg = {};
try { cfg = JSON.parse(stripped); } catch {}

cfg['$schema'] ??= 'https://opencode.ai/config.json';
cfg.provider ??= {};

cfg.provider['Trustly-Claude'] = {
  options: {
    baseURL: 'https://gateway.prd.devtools.trustly.cloud',
    apiKey: token
  },
  models: {
    'bedrock-claude-sonnet-4-6': { name: 'Claude Sonnet 4.6 (Trustly Bedrock)' },
    'bedrock-claude-opus-4-8': { name: 'Claude Opus 4.8 (Trustly Bedrock)' },
    'bedrock-claude-haiku-4-5': { name: 'Claude Haiku 4.5 (Trustly Bedrock)' }
  }
};

writeFileSync(f, JSON.stringify(cfg, null, 2) + '\n');
EOF

  # Dual-write: also write provider to legacy .json file
  [ -f "$json_file" ] || echo '{}' > "$json_file"
  TRUSTLY_CONFIG_FILE="$json_file" \
  TRUSTLY_API_TOKEN="$api_token" \
  node --input-type=module <<'EOF'
import { readFileSync, writeFileSync } from 'fs';
const f = process.env.TRUSTLY_CONFIG_FILE;
const token = process.env.TRUSTLY_API_TOKEN || '';

let cfg = {};
try { cfg = JSON.parse(readFileSync(f, 'utf8')); } catch {}

cfg.provider ??= {};
cfg.provider['Trustly-Claude'] = {
  options: {
    baseURL: 'https://gateway.prd.devtools.trustly.cloud',
    apiKey: token
  },
  models: {
    'bedrock-claude-sonnet-4-6': { name: 'Claude Sonnet 4.6 (Trustly Bedrock)' },
    'bedrock-claude-opus-4-8': { name: 'Claude Opus 4.8 (Trustly Bedrock)' },
    'bedrock-claude-haiku-4-5': { name: 'Claude Haiku 4.5 (Trustly Bedrock)' }
  }
};

writeFileSync(f, JSON.stringify(cfg, null, 2) + '\n');
EOF

  if [[ -n "$api_token" ]]; then
    echo -e "  ${GREEN:-}✓${NC:-} Trustly-Claude provider configured with API token"
  else
    echo -e "  ${GREEN:-}✓${NC:-} Trustly-Claude provider configured (token empty — update in ~/.config/opencode/opencode.jsonc)"
  fi
  echo -e "  ${BLUE:-}ℹ${NC:-} Models: bedrock-claude-sonnet-4-6, bedrock-claude-opus-4-8, bedrock-claude-haiku-4-5"
  return 0
}
