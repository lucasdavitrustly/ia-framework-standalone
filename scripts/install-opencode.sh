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

# ──────────────────────────────────────────────────────
# configure_worktree_permissions
# Allowlists the git-worktree directories used by the tlc-spec-driven workflow
# in the OpenCode permission config (opencode.jsonc primary, opencode.json legacy).
#
# Why: /tlc-specify, /tlc-quick and /start-work-on create worktrees at
# "<repo-root>/../worktrees/" — a SIBLING of the product repo, which is OUTSIDE
# the OpenCode workspace root (the repo the session was opened in). OpenCode treats
# such paths as `external_directory` and defaults to "ask", which makes subagents
# fail to write spec.md into the worktree. This grants "allow" for those paths.
#
# The allowlist accepts a base path (arg $1 or WORKTREE_ALLOW_BASE env). When
# absent, it prompts (interactive) with a sensible default (~/paywithmybank/source),
# using that default non-interactively. The broad "**/worktrees/**" glob is ALWAYS
# added on top of the base-derived patterns. Idempotent & merge-safe.
# ──────────────────────────────────────────────────────
configure_worktree_permissions() {
  echo -e "  ${YELLOW:-}→${NC:-} Configuring worktree filesystem permissions..."

  local config_dir="${XDG_CONFIG_HOME:-${HOME}/.config}/opencode"
  local jsonc_file="${config_dir}/opencode.jsonc"
  local json_file="${config_dir}/opencode.json"

  mkdir -p "$config_dir"

  # Resolve the base path whose sibling "worktrees/" dirs should be allowed.
  local default_base="${HOME}/paywithmybank/source"
  local base="${1:-${WORKTREE_ALLOW_BASE:-}}"
  if [ -z "$base" ]; then
    if is_noninteractive; then
      base="$default_base"   # use the suggested default; broad glob is always added too
    else
      echo -e "  ${BOLD:-}Worktree location${NC:-}"
      echo -e "  The spec-driven workflow creates git worktrees next to your product repos."
      echo -e "  Enter the base directory that CONTAINS your repos."
      echo -e "  The broad rule **/worktrees/** is always allowed as well."
      printf "  Base [default: %s]: " "$default_base"
      read -r base < /dev/tty || base=""
      [ -z "$base" ] && base="$default_base"
    fi
  fi

  # Build the allow patterns. Always include the broad "**/worktrees/**" glob.
  # When a base is given, also allow "<base>/worktrees/**" and "<base>/**/worktrees/**".
  local patterns_json
  if [ -n "$base" ]; then
    # Normalize: strip trailing slash
    base="${base%/}"
    # Export the resolved base so link_fi_connectors_worktree can reuse it
    # without prompting for the base a second time.
    WORKTREE_ALLOW_BASE="$base"; export WORKTREE_ALLOW_BASE
    patterns_json="$(WT_BASE="$base" node -e '
      const b = process.env.WT_BASE;
      process.stdout.write(JSON.stringify({
        [b + "/worktrees/**"]: "allow",
        [b + "/**/worktrees/**"]: "allow",
        "**/worktrees/**": "allow"
      }));
    ')"
  else
    patterns_json='{"**/worktrees/**":"allow"}'
  fi

  # Migration: seed .jsonc from .json if needed (reuses configure-mcp helpers)
  if [ ! -f "$jsonc_file" ] && [ -f "$json_file" ]; then
    _seed_jsonc_from_json "$jsonc_file" "$json_file" 2>/dev/null || true
  fi
  [ -f "$jsonc_file" ] || echo '{"$schema":"https://opencode.ai/config.json"}' > "$jsonc_file"
  if ! _read_jsonc "$jsonc_file" > /dev/null 2>&1; then
    _backup_malformed_jsonc "$jsonc_file"
  fi

  # Merge into .jsonc (primary)
  WT_CONFIG_FILE="$jsonc_file" WT_PATTERNS="$patterns_json" WT_JSONC=1 \
  node --input-type=module <<'EOF'
import { readFileSync, writeFileSync } from 'fs';
const f = process.env.WT_CONFIG_FILE;
const add = JSON.parse(process.env.WT_PATTERNS);
let cfg = {};
if (process.env.WT_JSONC) {
  const raw = readFileSync(f, 'utf8');
  const stripped = raw.replace(/("(?:[^"\\]|\\.)*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (m, str) => str || '');
  try { cfg = JSON.parse(stripped); } catch {}
} else {
  try { cfg = JSON.parse(readFileSync(f, 'utf8')); } catch {}
}
cfg['$schema'] ??= 'https://opencode.ai/config.json';

// Normalize permission to object form without clobbering existing rules.
if (cfg.permission === undefined) cfg.permission = { '*': 'allow' };
else if (typeof cfg.permission === 'string') cfg.permission = { '*': cfg.permission };

const ext = (typeof cfg.permission.external_directory === 'object' && cfg.permission.external_directory)
  ? cfg.permission.external_directory : {};
if (ext['*'] === undefined) ext['*'] = 'ask';   // preserve default gate for other paths
for (const [k, v] of Object.entries(add)) ext[k] = v;   // add/refresh worktree allows
cfg.permission.external_directory = ext;

writeFileSync(f, JSON.stringify(cfg, null, 2) + '\n');
EOF

  # Dual-write: legacy .json
  [ -f "$json_file" ] || echo '{}' > "$json_file"
  WT_CONFIG_FILE="$json_file" WT_PATTERNS="$patterns_json" \
  node --input-type=module <<'EOF'
import { readFileSync, writeFileSync } from 'fs';
const f = process.env.WT_CONFIG_FILE;
const add = JSON.parse(process.env.WT_PATTERNS);
let cfg = {};
try { cfg = JSON.parse(readFileSync(f, 'utf8')); } catch {}
if (cfg.permission === undefined) cfg.permission = { '*': 'allow' };
else if (typeof cfg.permission === 'string') cfg.permission = { '*': cfg.permission };
const ext = (typeof cfg.permission.external_directory === 'object' && cfg.permission.external_directory)
  ? cfg.permission.external_directory : {};
if (ext['*'] === undefined) ext['*'] = 'ask';
for (const [k, v] of Object.entries(add)) ext[k] = v;
cfg.permission.external_directory = ext;
writeFileSync(f, JSON.stringify(cfg, null, 2) + '\n');
EOF

  echo -e "  ${GREEN:-}✓${NC:-} Worktree paths allowed in OpenCode permissions:"
  echo "$patterns_json" | node -e 'const o=JSON.parse(require("fs").readFileSync(0,"utf8"));for(const k of Object.keys(o))console.log("      "+k);' 2>/dev/null || true
  return 0
}

# ──────────────────────────────────────────────────────
# link_fi_connectors_worktree
# Creates a symlink so worktree-based flows can resolve the fi-connectors repo
# as if it were a sibling of each worktree.
#
# Layout (given a base "source" dir that contains the product repos):
#   <base>/core                 — core repo (a git worktree host)
#   <base>/fi-connectors        — fi-connectors repo (sibling of core)
#   <base>/worktrees            — where tlc-spec-driven creates worktrees
#   <base>/worktrees/fi-connectors -> <base>/fi-connectors   (this symlink)
#
# Why: worktrees live at "<base>/worktrees/<slug>", one directory deeper than
# the product repos. Code that reaches for a sibling "fi-connectors" from inside
# a worktree would resolve to "<base>/worktrees/fi-connectors". Linking that to
# the real "<base>/fi-connectors" keeps the relative layout consistent.
#
# Base resolution mirrors configure_worktree_permissions (arg $1 /
# WORKTREE_ALLOW_BASE / prompt with default ~/paywithmybank/source). The
# fi-connectors path is prompted like the core path (default "<base>/fi-connectors").
# Soft-fails: if the fi-connectors source is missing, warns and skips the link.
# Idempotent & non-destructive (never clobbers a real directory/file).
# ──────────────────────────────────────────────────────
link_fi_connectors_worktree() {
  echo -e "  ${YELLOW:-}→${NC:-} Linking fi-connectors into worktrees directory..."

  # Resolve the base "source" dir (reuses the value exported by
  # configure_worktree_permissions when available).
  local default_base="${HOME}/paywithmybank/source"
  local base="${1:-${WORKTREE_ALLOW_BASE:-}}"
  if [ -z "$base" ]; then
    if is_noninteractive; then
      base="$default_base"
    else
      printf "  Base directory that CONTAINS your repos [default: %s]: " "$default_base"
      read -r base < /dev/tty || base=""
      [ -z "$base" ] && base="$default_base"
    fi
  fi
  # Trim whitespace, expand ~, strip trailing slash
  base="${base#"${base%%[![:space:]]*}"}"
  base="${base%"${base##*[![:space:]]}"}"
  base="${base/#\~/$HOME}"
  base="${base%/}"

  # Prompt for the fi-connectors source path (same UX as the core path prompt),
  # defaulting to the sibling location under the base.
  local default_fi="${base}/fi-connectors"
  local fi_path
  if is_noninteractive; then
    fi_path="$default_fi"
  else
    printf "  Enter the absolute path to your fi-connectors repo [default: %s]: " "$default_fi"
    read -r fi_path < /dev/tty || fi_path=""
    [ -z "$fi_path" ] && fi_path="$default_fi"
  fi
  # Trim whitespace, expand ~, strip trailing slash
  fi_path="${fi_path#"${fi_path%%[![:space:]]*}"}"
  fi_path="${fi_path%"${fi_path##*[![:space:]]}"}"
  fi_path="${fi_path/#\~/$HOME}"
  fi_path="${fi_path%/}"

  local worktrees_dir="${base}/worktrees"
  local link_path="${worktrees_dir}/fi-connectors"

  # Ensure the worktrees dir exists (created lazily by worktree flows otherwise).
  mkdir -p "$worktrees_dir"

  # Soft-fail when the fi-connectors source is absent.
  if [ ! -d "$fi_path" ]; then
    echo -e "  ${YELLOW:-}⚠${NC:-} fi-connectors not found at ${fi_path} — skipping link."
    echo -e "     Create it later with: ln -s \"${fi_path}\" \"${link_path}\""
    return 0
  fi

  # Idempotent, non-destructive handling of the link path.
  if [ -L "$link_path" ]; then
    local current
    current="$(readlink "$link_path" 2>/dev/null || true)"
    if [ "$current" = "$fi_path" ]; then
      echo -e "  ${GREEN:-}✓${NC:-} fi-connectors link already present: ${link_path} -> ${fi_path}"
      return 0
    fi
    ln -sfn "$fi_path" "$link_path"
    echo -e "  ${GREEN:-}✓${NC:-} fi-connectors link updated: ${link_path} -> ${fi_path}"
    return 0
  elif [ -e "$link_path" ]; then
    echo -e "  ${YELLOW:-}⚠${NC:-} ${link_path} exists and is not a symlink — leaving it untouched."
    return 0
  fi

  ln -s "$fi_path" "$link_path"
  echo -e "  ${GREEN:-}✓${NC:-} fi-connectors linked: ${link_path} -> ${fi_path}"
  return 0
}
