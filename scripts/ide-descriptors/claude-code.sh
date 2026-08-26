#!/usr/bin/env bash
# ide-descriptors/claude-code.sh — Claude Code IDE descriptor
# Source this file to export IDE_* variables for Claude Code.
# Do not execute directly.

IDE_ID="claude-code"
IDE_NAME="Claude Code"
IDE_DETECT_PATH="${HOME}/.claude"
IDE_GLOBAL_DIR="${HOME}/.claude"
IDE_SKILLS_DIR="${IDE_GLOBAL_DIR}/skills"
IDE_AGENTS_DIR="${IDE_GLOBAL_DIR}/agents"
IDE_COMMANDS_DIR="${IDE_GLOBAL_DIR}/commands"
IDE_HOOKS_DIR="${IDE_GLOBAL_DIR}/hooks"
IDE_MCP_CONFIG="${HOME}/.claude.json"    # user-scope "mcpServers" key (settings.json does NOT support mcpServers)
IDE_MCP_FORMAT="claude-json"
IDE_AGENT_FORMAT="md"
IDE_SUPPORTS_SYMLINK="true"
IDE_SUPPORTS_HOOKS="true"    # global hooks registered in ~/.claude/settings.json
IDE_SUPPORTS_COMMANDS="true"
