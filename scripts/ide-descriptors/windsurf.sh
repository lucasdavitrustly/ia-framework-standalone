#!/usr/bin/env bash
# ide-descriptors/windsurf.sh — Windsurf IDE descriptor
# Source this file to export IDE_* variables for Windsurf (Codeium).
# Do not execute directly.

IDE_ID="windsurf"
IDE_NAME="Windsurf"
IDE_DETECT_PATH="${HOME}/.codeium/windsurf"
IDE_GLOBAL_DIR="${HOME}/.codeium/windsurf"
IDE_SKILLS_DIR="${IDE_GLOBAL_DIR}/skills"
IDE_AGENTS_DIR="${IDE_GLOBAL_DIR}/agents"
IDE_COMMANDS_DIR=""
IDE_HOOKS_DIR=""
IDE_MCP_CONFIG=""              # Windsurf MCP config location TBD — descriptor stub
IDE_MCP_FORMAT=""
IDE_AGENT_FORMAT="md"
IDE_SUPPORTS_SYMLINK="true"
IDE_SUPPORTS_HOOKS="false"
IDE_SUPPORTS_COMMANDS="false"
