#!/usr/bin/env bash
# ide-descriptors/codex.sh — Codex CLI IDE descriptor
# Source this file to export IDE_* variables for Codex.
# Do not execute directly.
#
# Note: Codex agents require .toml format (IDE_AGENT_FORMAT=toml).
#       Agent files are COPIED and transformed, not symlinked.
#       Hooks are registered via ~/.codex/hooks.json.

IDE_ID="codex"
IDE_NAME="Codex CLI"
IDE_DETECT_PATH="${HOME}/.codex/config.toml"
IDE_GLOBAL_DIR="${HOME}/.codex"
IDE_SKILLS_DIR="${HOME}/.agents/skills"
IDE_AGENTS_DIR="${IDE_GLOBAL_DIR}/agents"
IDE_COMMANDS_DIR=""            # Codex does not support slash commands
IDE_HOOKS_DIR="${HOME}/.codex/hooks"
IDE_MCP_CONFIG="${IDE_GLOBAL_DIR}/config.toml"
IDE_MCP_FORMAT="codex-toml"
IDE_AGENT_FORMAT="toml"        # requires copy + transform from .md
IDE_SUPPORTS_SYMLINK="true"    # skill dir symlink supported; agents require copy
IDE_SUPPORTS_HOOKS="true"      # hooks registered in ~/.codex/hooks.json
IDE_SUPPORTS_COMMANDS="false"
