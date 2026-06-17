#!/usr/bin/env bash
# ide-descriptors/vscode-copilot.sh — VS Code + GitHub Copilot IDE descriptor
# Source this file to export IDE_* variables for VS Code.
# Do not execute directly.
#
# Note: VS Code via Copilot supports agents in .github/agents/ but has
#       no hooks or slash commands support.

IDE_ID="vscode-copilot"
IDE_NAME="VS Code (Copilot)"
IDE_DETECT_PATH="${HOME}/.vscode"
IDE_GLOBAL_DIR="${HOME}/.github"
IDE_SKILLS_DIR=""              # VS Code does not have a skills directory
IDE_AGENTS_DIR="${IDE_GLOBAL_DIR}/agents"
IDE_COMMANDS_DIR=""            # no slash commands
IDE_HOOKS_DIR=""               # no hooks support
IDE_MCP_CONFIG="${HOME}/.vscode/mcp.json"
IDE_MCP_FORMAT="vscode-json"
IDE_AGENT_FORMAT="md"
IDE_SUPPORTS_SYMLINK="true"    # agents only
IDE_SUPPORTS_HOOKS="false"
IDE_SUPPORTS_COMMANDS="false"
