#!/usr/bin/env bash
# ide-descriptors/opencode.sh — OpenCode IDE descriptor
# Source this file to export IDE_* variables for OpenCode.
# Do not execute directly.

IDE_ID="opencode"
IDE_NAME="OpenCode"
IDE_DETECT_PATH="${XDG_CONFIG_HOME:-${HOME}/.config}/opencode/opencode.json"
IDE_GLOBAL_DIR="${XDG_CONFIG_HOME:-${HOME}/.config}/opencode"
IDE_SKILLS_DIR="${IDE_GLOBAL_DIR}/skills"
IDE_AGENTS_DIR="${IDE_GLOBAL_DIR}/agents"
IDE_COMMANDS_DIR="${IDE_GLOBAL_DIR}/command"   # singular — confirmed from live filesystem
IDE_HOOKS_DIR="${IDE_GLOBAL_DIR}/hooks"
IDE_MCP_CONFIG="${IDE_GLOBAL_DIR}/opencode.json"
IDE_MCP_FORMAT="opencode-json"
IDE_AGENT_FORMAT="md"
IDE_SUPPORTS_SYMLINK="true"
IDE_SUPPORTS_HOOKS="true"
IDE_SUPPORTS_COMMANDS="true"
