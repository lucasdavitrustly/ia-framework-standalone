#!/usr/bin/env bash
# ide-descriptors/cursor.sh — Cursor IDE descriptor
# Source this file to export IDE_* variables for Cursor.
# Do not execute directly.
#
# Note: Cursor uses .cursor/rules/ for project-level rules.
#       Global skills support is via ~/.cursor/skills/ (if available).
#       MCP config follows the same format as VS Code.

IDE_ID="cursor"
IDE_NAME="Cursor"
IDE_DETECT_PATH="${HOME}/.cursor"
IDE_GLOBAL_DIR="${HOME}/.cursor"
IDE_SKILLS_DIR="${IDE_GLOBAL_DIR}/skills"
IDE_AGENTS_DIR="${IDE_GLOBAL_DIR}/agents"
IDE_COMMANDS_DIR=""            # Cursor does not support global slash commands
IDE_HOOKS_DIR=""               # no hooks support
IDE_MCP_CONFIG="${HOME}/.cursor/mcp.json"
IDE_MCP_FORMAT="vscode-json"   # Cursor uses same MCP format as VS Code
IDE_AGENT_FORMAT="md"
IDE_SUPPORTS_SYMLINK="true"
IDE_SUPPORTS_HOOKS="false"
IDE_SUPPORTS_COMMANDS="false"
