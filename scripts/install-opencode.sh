#!/usr/bin/env bash
# install-opencode.sh — Install OpenCode CLI with platform-aware method selection
# Provides: install_opencode() function
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
# Non-interactive mode: set IA_NON_INTERACTIVE=1 or pipe stdin (non-TTY)

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
